import express from 'express'
import bodyParser from 'body-parser'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import csrf from 'csurf'
import xssShield from 'xss-shield'
import https from 'https'
import fs from 'fs'
import helmet from 'helmet'
import { Strategy as LocalStrategy } from 'passport-local'
import passport from 'passport'
import { createFilesystemLoader, createEnvironment, createFunction } from 'twing'
import dotenv from 'dotenv'
import path from 'path';
import { discovery } from 'openid-client'

dotenv.config({
  path: process.env.NODE_ENV !== 'test' ? '.env' : '.env.test'
})

import AuthController from './controllers/auth.js'
import BackupController from './controllers/backup.js'
import ScheduleController from './controllers/schedule.js'
import RestoreController from './controllers/restore.js'
import HomeController from './controllers/home.js'
import MetricsService from './services/metrics.js'
import AuthService from './services/auth.js'
import KubeService from './services/kube.js'
import tools from './tools.js'

const app = express();
const metrics = express();
// server export
var server = app;

// https server
if (tools.isSecureHost() && tools.sslCertFilePath() && tools.sslKeyFilePath()) {
  console.log(new Date(), ': Start HTTPS server...');
  server = https.createServer({ key: fs.readFileSync(tools.sslKeyFilePath()), cert: fs.readFileSync(tools.sslCertFilePath()) }, app);
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.disable('x-powered-by');

app.use(process.env.NODE_ENV !== 'test' ? xssShield.default.xssShield() : xssShield.xssShield()); // jest no-esm supporting
app.use(
  session({ secret: tools.secretKey(), resave: true, saveUninitialized: true, cookie: { secure: tools.isSecureHost() } })
);
app.use('/static', express.static(path.resolve('./') + '/static'));

const csrfProtect = csrf({ cookie: true });
const loader = createFilesystemLoader(fs);
loader.addPath('./templates');
const twing = createEnvironment(loader);
const viewPath = createFunction(
  'path',
  function (_executionContext, slug) {
    return Promise.resolve(tools.subPath(slug));
  },
  [{ name: 'slug' }]
);
twing.addFunction(viewPath);


app.use(helmet({contentSecurityPolicy: {directives: {scriptSrc: ["'self'", "'unsafe-inline'"]}}}));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
app.use(passport.initialize());
app.use(passport.session());

const authService = new AuthService();

passport.use(new LocalStrategy(
  async (username, password, done) => {
    return await authService.auth(username, password, done)
  }
))

const kubeService = new KubeService();

const authController = new AuthController(kubeService, twing, authService);
const backupController = new BackupController(kubeService, twing);
const scheduleController = new ScheduleController(kubeService, twing);
const restoreController = new RestoreController(kubeService, twing);
const homeController = new HomeController(kubeService, twing);

// oidc
const oidcConfig = tools.oidcConfig();
let oidcDiscovery, initFN;
if(oidcConfig){
  oidcDiscovery =  discovery(new URL(oidcConfig.discoveryUrl), oidcConfig.clientId, oidcConfig.clientSecret);
  (async function() {
      await authController.initOIDCConfiguration(oidcDiscovery, oidcConfig);
  })();
}

app.use((req, res, next) => authController.globalSecureAction(req, res, next));

app.get('/login', csrfProtect, (req, res, next) => authController.loginView(req, res, next));
app.get('/logout', (req, res, next) => authController.logoutAction(req, res, next));
app.post('/login', csrfProtect, (req, res, next) => authController.loginAction(req, res, next));

if(oidcConfig){
  app.get('/auth/oidc', (req, res, next) => authController.oidcAction(req, res, next));
  app.get('/auth/oidc/callback', (req, res, next) => authController.oidcCallbackAction(req, res, next));
}

app.get('/', csrfProtect, (req, res, next) => homeController.homeView(req, res, next));
app.get('/status', (req, res, next) => homeController.statusView(req, res, next));

app.use('/backup/new', csrfProtect, (req, res, next) => backupController.createViewAction(req, res, next));
app.get('/backups/result/:name', (req, res, next) => backupController.resultView(req, res, next));
app.get('/backups', (req, res, next) => backupController.listAction(req, res, next));
app.delete('/backups', csrfProtect, (req, res, next) => backupController.deleteAction(req, res, next));

app.use('/schedule/new', csrfProtect, (req, res, next) => scheduleController.createViewAction(req, res, next));
app.post('/schedules/execute', csrfProtect, (req, res, next) => scheduleController.executeAction(req, res, next));
app.post('/schedules/toggle', csrfProtect, (req, res, next) => scheduleController.toggleAction(req, res, next));
app.get('/schedules', (req, res, next) => scheduleController.listAction(req, res, next));
app.delete('/schedules', csrfProtect, (req, res, next) => scheduleController.deleteAction(req, res, next));

app.get('/restores/result/:name', (req, res, next) => restoreController.resultView(req, res, next));
app.get('/restores', (req, res, next) => restoreController.listAction(req, res, next));
app.post('/restores', csrfProtect, (req, res, next) => restoreController.restoreAction(req, res, next));

app.use((err, req, res, next) => authController.globalCSRFTokenAction(err, req, res, next));

const metricsService = new MetricsService(kubeService);

metrics.get('/' + tools.metricsPath(), (req, res, next) => metricsService.get(req, res, next));

export default { app: server, metrics: metrics, init: initFN };
