const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const xssShield = require('xss-shield');
const https = require('https');
const fs = require('fs');
const { TwingEnvironment, TwingLoaderFilesystem, TwingFunction } = require('twing');
require('dotenv').config({ path: process.env.NODE_ENV !== 'test' ? '.env' : '.env.test' });

const AuthController = require('./controllers/auth');
const BackupController = require('./controllers/backup');
const ScheduleController = require('./controllers/schedule');
const RestoreController = require('./controllers/restore');
const HomeController = require('./controllers/home');
const MetricsService = require('./services/metrics');
const KubeService = require('./services/kube');
const tools = require('./tools');
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
app.use(xssShield.default.xssShield());
app.use(
  session({ secret: require('./tools').secretKey(), resave: true, saveUninitialized: true, cookie: { secure: tools.isSecureHost() } })
);
app.use(express.static(__dirname + '/../static'));

const csrfProtect = csrf({ cookie: true });
const loader = new TwingLoaderFilesystem('./templates');
const twing = new TwingEnvironment(loader);
const viewPath = new TwingFunction(
  'path',
  function (slug) {
    return Promise.resolve(tools.subPath(slug));
  },
  []
);
twing.addFunction(viewPath);

const kubeService = new KubeService();

const authController = new AuthController(kubeService, twing);
const backupController = new BackupController(kubeService, twing);
const scheduleController = new ScheduleController(kubeService, twing);
const restoreController = new RestoreController(kubeService, twing);
const homeController = new HomeController(kubeService, twing);

app.use((req, res, next) => authController.globalSecureAction(req, res, next));

app.get('/login', csrfProtect, (req, res, next) => authController.loginView(req, res, next));
app.get('/logout', (req, res, next) => authController.logoutAction(req, res, next));
app.post('/login', csrfProtect, (req, res, next) => authController.loginAction(req, res, next));

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

module.exports = { app: server, metrics: metrics };
