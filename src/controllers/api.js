const tools = require('./../tools');
const https = require('https');
const axios = require('axios');
const zlib = require('zlib');
const sanitizer = require('sanitizer');
const auth = require('basic-auth')
const { authenticate } = require('ldap-authentication');
const Backup = require('./../models/backup');
const BackupStatus = require('./../models/backupstatus');
const Restore = require('./../models/restore');
const RestoreStatus = require('./../models/restorestatus');
const Schedule = require('./../models/schedule');
const ScheduleStatus = require('./../models/schedulestatus');

class APIController {
  constructor(kubeService) {
    this.kubeService = kubeService;
  }

  async auth(request, response, next) {
    if (request.path === '/api-docs') {
      return next(); // skip for docs
    }

    let user = auth(request);
    let adminAccount = tools.admin();
    let ldapConfig = tools.ldap();
    let authenticatedUser = null;

    if (!user) {
      response.set('WWW-Authenticate', 'Basic realm="MyVelero"');
      return response.status(401).send();
    }

    if (adminAccount && adminAccount.username === user.name && adminAccount.password === user.pass) {
      authenticatedUser = {isAdmin: true, username: user.name, password: user.pass, groups: [], namespaces: []};
    }

    if (ldapConfig && !authenticatedUser) {
      try {
        ldapConfig.userPassword = user.pass;
        ldapConfig.username = user.name;
        ldapConfig.attributes = ['groups', 'givenName', 'sn', 'userPrincipalName', 'memberOf', 'gecos'];
        if (ldapConfig.attributes.indexOf(ldapConfig.usernameAttribute) === -1) {
          ldapConfig.attributes.push(ldapConfig.usernameAttribute);
        }
        let authenticated = await authenticate(ldapConfig);
        tools.debug('LDAP : Authenticated user : ', authenticated);

        if (authenticated) {
          let groups = authenticated.memberOf ? authenticated.memberOf : authenticated.groups ? authenticated.groups.split('|') : [];
          let availableNamespaces = tools.userNamespace(groups);
          authenticatedUser = {isAdmin: false, username: authenticated.gecos ? authenticated.gecos : request.body.username, password: user.pass, groups: groups, namespaces: availableNamespaces};
        }
      } catch (err) {
        console.error(err);
      }
    }

    if(!authenticatedUser){
      return response.status(403).end('Forbidden');
    }

    if (tools.readOnlyMode()) {
      if (request.method != 'GET' && !authenticatedUser.isAdmin) {
        return response.status(405).end('Method Not Allowed');
      }
    }

    tools.audit(user.name, 'APIController', 'LOGIN');

    response.set('authenticatedUser', JSON.stringify(authenticatedUser));
    
    // switch context for each request
    /*if (this.kubeService.isMultiCluster()) {
      let newContext = request.query.context;
      if (newContext) {
        request.session.context = newContext;
      }
      let userContext = request.session.context;
      if (!userContext) {
        userContext = this.kubeService.getCurrentContext();
        request.session.context = userContext;
      }
      this.kubeService.switchContext(userContext);
    }*/
    return next();
  }

  async createRestoreFromBackup(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let backup = await this.kubeService.getBackup(request.params.name);
    if (!backup) {
      return response.status(404).json({});
    }
    // access
    let user = JSON.parse(response.get('authenticatedUser'));
    if (!tools.hasAccess(user, backup)) {
      return response.status(403).json({});
    }

    let restoreName = request.params.name+'-restore-'+Math.floor(Date.now() / 1000);
    const newRestore = await this.kubeService.createRestore({name: restoreName, backup: request.params.name}, backup);
    // audit
    tools.audit(
      user.username,
      'APIController',
      'CREATE',
      restoreName,
      'Restore',
      'Origin backup : ' + request.params.name
    );

    let responseContent = Restore.buildFromCRD(newRestore);
    if(responseContent){
      responseContent = responseContent.serialize();
    }

    response.type('json').send({ status: newRestore ? true : false, restore: responseContent });
  }
  
  async listBackup(request, response) {
    let backups = await this.kubeService.listBackups();
    let user = JSON.parse(response.get('authenticatedUser'));
    // filter
    let availableBackups = [];
    for (let i in backups) {
      if (tools.hasAccess(user, backups[i])) {
        let responseContent = Backup.buildFromCRD(backups[i]);
        if(responseContent){
          responseContent = responseContent.serialize();
          let subResponseContent = BackupStatus.buildFromCRD(backups[i]);
          if(subResponseContent){
            responseContent.status = subResponseContent.serialize();
          }
        }
        if(responseContent){
          availableBackups.push(responseContent);
        }
      }
    }
    // audit
    tools.audit(user.username, 'APIController', 'LIST', '', 'Backup');

    response.type('json').send(sanitizer.sanitize(JSON.stringify(availableBackups)));
  }

  async getBackup(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let backup = await this.kubeService.getBackup(request.params.name);
    if (!backup) {
      return response.status(404).json({});
    }
    // access
    let user = JSON.parse(response.get('authenticatedUser'));
    if (!tools.hasAccess(user, backup)) {
      return response.status(403).json({});
    }
    // audit
    tools.audit(user.username, 'APIController', 'GET', request.params.name, 'Backup');

    let responseContent = Backup.buildFromCRD(backup);
    if(responseContent){
      responseContent = responseContent.serialize();
      let subResponseContent = BackupStatus.buildFromCRD(backup);
      if(subResponseContent){
        responseContent.status = subResponseContent.serialize();
      }
    }

    response.type('json').send(sanitizer.sanitize(JSON.stringify(responseContent)));
  }

  async getBackupLog(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }
    
    let backup = await this.kubeService.getBackup(request.params.name);
    
    if (!backup) {
      return response.status(404).json({});
    }
    
    let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);
    // access
    let user = JSON.parse(response.get('authenticatedUser'));
    if (!tools.hasAccess(user, backup)) {
      return response.status(403).json({});
    }
    // create download request for result
    let downloadRequest = await this.kubeService.createDownloadRequest(downloadRequestName, request.params.name, 'BackupResults');

    let isProcessed = false,
      retry = 0,
      downloadResultLink = null;
    while (!isProcessed && retry < 15) {
      downloadRequest = await this.kubeService.geDownloadRequest(downloadRequestName);
      if (downloadRequest && downloadRequest.status && downloadRequest.status.phase == 'Processed') {
        isProcessed = true;
        downloadResultLink = downloadRequest.status.downloadURL;
      } else {
        await tools.delay(1000);
      }
      retry++;
    }

    downloadRequestName = request.params.name + '-log-download-request-' + Math.floor(Date.now() / 1000);
    // create download request for log
    downloadRequest = await this.kubeService.createDownloadRequest(downloadRequestName, request.params.name, 'BackupLog');

    (isProcessed = false), (retry = 0);
    let downloadLogLink = null;
    while (!isProcessed && retry < 15) {
      downloadRequest = await this.kubeService.geDownloadRequest(downloadRequestName);
      if (downloadRequest && downloadRequest.status && downloadRequest.status.phase == 'Processed') {
        isProcessed = true;
        downloadLogLink = downloadRequest.status.downloadURL;
      } else {
        await tools.delay(1000);
      }
      retry++;
    }

    try {
      // download result file
      let jsonResult = null;
      let httpsAgent = null;
      let storageBackupLocation = await this.kubeService.getBackupStorageLocation(backup.spec.storageLocation);
      if (storageBackupLocation && storageBackupLocation.spec.objectStorage && storageBackupLocation.spec.objectStorage.caCert) {
        let buff = Buffer.from(storageBackupLocation.spec.objectStorage.caCert, 'base64');
        let caCert = buff.toString('ascii');
        httpsAgent = new https.Agent({ ca: caCert, keepAlive: false });
      }
      if (downloadResultLink) {
        let { data } = await axios.get(downloadResultLink, { responseType: 'arraybuffer', decompress: true, httpsAgent: httpsAgent });
        let content = zlib.unzipSync(data).toString();
        tools.debug('backup result download : ' + content.substring(0, 120) + '...');
        jsonResult = JSON.parse(content);
      }
      // download log file
      let logResult = null;
      if (downloadLogLink) {
        let { data } = await axios.get(downloadLogLink, { responseType: 'arraybuffer', decompress: true, httpsAgent: httpsAgent });
        logResult = zlib.unzipSync(data).toString();
        tools.debug('backup log download : ' + (logResult ? logResult.substring(0, 120) : '') + '...');
      }
      // audit
      tools.audit(user.username, 'APIController', 'DOWNLOAD', request.params.name, 'Backup');
      
      return response.type('json').send(sanitizer.sanitize(JSON.stringify({result: jsonResult, logs: logResult})));
    } catch (err) {
      console.error(err);
    }

    return response.status(503).json({});
  }

  async deleteBackup(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let backup = await this.kubeService.getBackup(request.params.name);
    if (!backup) {
      return response.status(404).json({});
    }
    // access
    let user = JSON.parse(response.get('authenticatedUser'));
    if (!tools.hasAccess(user, backup)) {
      return response.status(403).json({});
    }

    var deleteRequest = await this.kubeService.createDeleteBackupRequest('delete-'+request.params.name+'-'+Math.floor(Date.now() / 1000), request.params.name);
    if (deleteRequest) {
      // audit
      tools.audit(user.username, 'APIController', 'DELETE', request.params.name, 'Backup');
    }
    response.send({ status: deleteRequest ? true : false , backup: request.params.name});
  }

  async listRestore(request, response) {
    let restores = await this.kubeService.listRestores();
    let user = JSON.parse(response.get('authenticatedUser'));
    // filter
    let availableRestores = [];
    for (let i in restores) {
      if (tools.hasAccess(user, restores[i])) {
        let responseContent = Restore.buildFromCRD(restores[i]);
        if(responseContent){
          responseContent = responseContent.serialize();
          let subResponseContent = RestoreStatus.buildFromCRD(restores[i]);
          if(subResponseContent){
            responseContent.status = subResponseContent.serialize();
          }
        }
        availableRestores.push(responseContent);
      }
    }
    // audit
    tools.audit(user.username, 'APIController', 'LIST', '', 'Restore');

    response.type('json').send(sanitizer.sanitize(JSON.stringify(availableRestores)));
  }

  async getRestore(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let restore = await this.kubeService.getRestore(request.params.name);
    if (!restore) {
      return response.status(404).json({});
    }

    let user = JSON.parse(response.get('authenticatedUser'));
    // filter
    if (!tools.hasAccess(user, restore)) {
      return response.status(403).json({});
    }
    // audit
    tools.audit(user.username, 'APIController', 'GET', '', 'Restore');

    let responseContent = Restore.buildFromCRD(restore);
    if(responseContent){
      responseContent = responseContent.serialize();
      let subResponseContent = RestoreStatus.buildFromCRD(restore);
      if(subResponseContent){
        responseContent.status = subResponseContent.serialize();
      }
    }

    response.type('json').send(sanitizer.sanitize(JSON.stringify(responseContent)));
  }

  async getRestoreLog(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let restore = await this.kubeService.getRestore(request.params.name);
    if (!restore) return response.status(404).json({});

    let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);

    // access
    let user = JSON.parse(response.get('authenticatedUser'));
    if (!tools.hasAccess(user, restore)) {
      return response.status(403).json({});
    }

    let downloadRequest = await this.kubeService.createDownloadRequest(downloadRequestName, request.params.name, 'RestoreResults');

    let isProcessed = false,
      retry = 0,
      downloadResultLink = null;
    while (!isProcessed && retry < 15) {
      downloadRequest = await this.kubeService.geDownloadRequest(downloadRequestName);
      if (downloadRequest && downloadRequest.status && downloadRequest.status.phase == 'Processed') {
        isProcessed = true;
        downloadResultLink = downloadRequest.status.downloadURL;
      } else {
        await tools.delay(1000);
      }
      retry++;
    }

    downloadRequestName = request.params.name + '-log-download-request-' + Math.floor(Date.now() / 1000);
    // create download request for log
    downloadRequest = await this.kubeService.createDownloadRequest(downloadRequestName, request.params.name, 'RestoreLog');

    (isProcessed = false), (retry = 0);
    let downloadLogLink = null;
    while (!isProcessed && retry < 15) {
      downloadRequest = await this.kubeService.geDownloadRequest(downloadRequestName);
      if (downloadRequest && downloadRequest.status && downloadRequest.status.phase == 'Processed') {
        isProcessed = true;
        downloadLogLink = downloadRequest.status.downloadURL;
      } else {
        await tools.delay(1000);
      }
      retry++;
    }

    try {
      // download result file
      let jsonResult = null;
      let httpsAgent = null;
      let backup = await this.kubeService.getBackup(restore.spec.backupName);
      let storageBackupLocation = await this.kubeService.getBackupStorageLocation(backup ? backup.spec.storageLocation : 'default'); // To report to ui
      if (storageBackupLocation && storageBackupLocation.spec.objectStorage && storageBackupLocation.spec.objectStorage.caCert) {
        let buff = Buffer.from(storageBackupLocation.spec.objectStorage.caCert, 'base64');
        let caCert = buff.toString('ascii');
        httpsAgent = new https.Agent({ ca: caCert, keepAlive: false });
      }
      if (downloadResultLink) {
        let { data } = await axios.get(downloadResultLink, { responseType: 'arraybuffer', decompress: true, httpsAgent: httpsAgent });
        let content = zlib.unzipSync(data).toString();
        tools.debug('restore result download : ' + content.substring(0, 120) + '...');
        jsonResult = JSON.parse(content);
      }
      // download log file
      let logResult = null;
      if (downloadLogLink) {
        let { data } = await axios.get(downloadLogLink, { responseType: 'arraybuffer', decompress: true, httpsAgent: httpsAgent });
        logResult = zlib.unzipSync(data).toString();
        tools.debug('restore log download : ' + (logResult ? logResult.substring(0, 120) : '') + '...');
      }

      // audit
      tools.audit(user.username, 'APIController', 'DOWNLOAD', request.params.name, 'Restore');

      return response.type('json').send(sanitizer.sanitize(JSON.stringify({result: jsonResult, logs: logResult})));
    } catch (err) {
      console.error(err);
    }

    return response.status(503).json({});
  }

  async listSchedule(request, response) {
    let schedules = await this.kubeService.listSchedules();
    let user = JSON.parse(response.get('authenticatedUser'));
    // filter
    let availableSchedules = [];
    for (let i in schedules) {
      if (tools.hasAccess(user, schedules[i])) {
        let responseContent = Schedule.buildFromCRD(schedules[i]);
        if(responseContent){
          responseContent = responseContent.serialize();
          let subResponseContent = ScheduleStatus.buildFromCRD(schedules[i]);
          if(subResponseContent){
            responseContent.status = subResponseContent.serialize();
          }
        }
        availableSchedules.push(responseContent);
      }
    }
    // audit
    tools.audit(user.username, 'APIController', 'LIST', '', 'Schedule');

    response.type('json').send(sanitizer.sanitize(JSON.stringify(availableSchedules)));
  }

  async getSchedule(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let schedule = await this.kubeService.getSchedule(request.params.name);
    if (!schedule) {
      return response.status(404).json({});
    }

    let user = JSON.parse(response.get('authenticatedUser'));
    // filter
    if (!tools.hasAccess(user, schedule)) {
      return response.status(403).json({});
    }
    // audit
    tools.audit(user.username, 'APIController', 'GET', request.params.name, 'Schedule');
    let responseContent = Schedule.buildFromCRD(schedule);
    if(responseContent){
      responseContent = responseContent.serialize();
      let subResponseContent = ScheduleStatus.buildFromCRD(schedule);
      if(subResponseContent){
        responseContent.status = subResponseContent.serialize();
      }
    }
    response.type('json').send(sanitizer.sanitize(JSON.stringify({status: responseContent != null, data: responseContent})));
  }

  async deleteSchedule(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let schedule = await this.kubeService.getSchedule(request.params.name);
    let user = JSON.parse(response.get('authenticatedUser'));

    if (!schedule) {
      return response.status(404).json({});
    }

    // filter
    if (!tools.hasAccess(user, schedule)) {
      return response.status(403).json({});
    }
    // audit
    tools.audit(user.username, 'APIController', 'DELETE', request.params.name, 'Schedule');

    await this.kubeService.deleteSchedule(request.params.name);
    
    response.send({ status: true });
  }

  async executeSchedule(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let schedule = await this.kubeService.getSchedule(request.params.name);
    let user = JSON.parse(response.get('authenticatedUser'));
    // filter
    if (!tools.hasAccess(user, schedule)) {
      return response.status(403).json({});
    }

    let backupName = request.params.name+'-backup-'+Math.floor(Date.now() / 1000);
    const returned = await this.kubeService.executeSchedule(schedule, backupName);
    // audit
    tools.audit(
      user.username,
      'APIController',
      'EXECUTE',
      request.params.name,
      'Schedule',
      'Created backup : ' + backupName
    );
    // response
    response.send({ status: returned ? true : false, backup: returned });
  }

  async toggleSchedule(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let schedule = await this.kubeService.getSchedule(request.params.name);
    let user = JSON.parse(response.get('authenticatedUser'));

    if (!schedule) {
      return response.status(404).json({});
    }

    // filter
    if (!tools.hasAccess(user, schedule)) {
      return response.status(403).json({});
    }

    const returned = await this.kubeService.toggleSchedule(schedule);
    // audit
    tools.audit(
      user.username,
      'APIController',
      'TOGGLE',
      request.params.name,
      'Schedule',
      'Schedule ' + (schedule.spec.paused ? 'unpaused' : 'paused')
    );
    // response
    // @TODO fix false return
    response.type('json').send({ status: returned ? true : false, paused: returned ? returned.spec.paused : '' });
  }
}

module.exports = APIController;
