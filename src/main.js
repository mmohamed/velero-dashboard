const express = require('express');
const k8s = require('@kubernetes/client-node');
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { TwingEnvironment, TwingLoaderFilesystem } = require('twing');
require('dotenv').config();

const AuthController = require('./controllers/auth');
const BackupController = require('./controllers/backup');
const ScheduleController = require('./controllers/schedule');
const RestoreController = require('./controllers/restore');
const HomeController = require('./controllers/home');

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)
const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({secret: require('./config').secretKey(), resave: true, saveUninitialized: true}));
app.use(express.static(__dirname+'/../static'));

const loader = new TwingLoaderFilesystem('./templates');
const twing = new TwingEnvironment(loader);

const authController = new AuthController(twing);
const backupController = new BackupController(twing, k8sApi, customObjectsApi);
const scheduleController = new ScheduleController(twing, k8sApi, customObjectsApi);
const restoreController =  new RestoreController(twing, customObjectsApi);
const homeController =  new HomeController(twing, k8sAppsApi, customObjectsApi);


app.use((req, res, next) => authController.globalSecureAction(req, res, next));
app.get('/login', (req, res, next) => authController.loginView(req, res, next));
app.get('/logout', (req, res, next) => authController.logoutAction(req, res, next));
app.post('/login', (req, res, next) => authController.loginAction(req, res, next));

app.get('/', (req, res, next) => homeController.homeView(req, res, next));
app.get('/status', (req, res, next) => homeController.statusView(req, res, next));

app.use('/backup/new', (req, res, next) => backupController.createViewAction(req, res, next));
app.get('/backups/result/:name', (req, res, next) => backupController.resultView(req, res, next));
app.get('/backups', (req, res, next) => backupController.listAction(req, res, next));
app.delete('/backups', (req, res, next) => backupController.deleteAction(req, res, next));

app.use('/schedule/new', (req, res, next) => scheduleController.createViewAction(req, res, next));
app.post('/schedules/execute', (req, res, next) => scheduleController.executeAction(req, res, next));
app.post('/schedules/toggle', (req, res, next) => scheduleController.toggleAction(req, res, next));
app.get('/schedules', (req, res, next) => scheduleController.listAction(req, res, next));
app.delete('/schedules', (req, res, next) => scheduleController.deleteAction(req, res, next));

app.get('/restores/result/:name', (req, res, next) => restoreController.resultView(req, res, next));
app.get('/restores', (req, res, next) => restoreController.listAction(req, res, next));
app.post('/restores', (req, res, next) => restoreController.restoreAction(req, res, next));


module.exports = app;