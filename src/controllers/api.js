import tools from './../tools.js'
import https from 'https'
import axios from 'axios'
import zlib from 'zlib'
import {isValidCron} from 'cron-validator'
import sanitizer from 'sanitizer'
import auth from 'basic-auth'
import {authenticate} from 'ldap-authentication'
import Backup from './../models/backup.js'
import BackupStatus from './../models/backupstatus.js';
import Restore from './../models/restore.js'
import RestoreStatus from './../models/restorestatus.js'
import Schedule from './../models/schedule.js'
import ScheduleStatus from './../models/schedulestatus.js'

class APIController {
  constructor(kubeService) {
    this.kubeService = kubeService;
  }

  async auth(request, response, next) {
    if (request.path.indexOf('/v1/docs') !== -1) {
      return next(); // skip auth for docs
    }

    let user = auth(request);
    let adminAccount = tools.admin();
    let ldapConfig = tools.ldap();
    let authenticateduser = null;

    if (!user) {
      response.set('WWW-Authenticate', 'Basic realm="MyVelero"');
      return response.status(401).send();
    }

    if (adminAccount && adminAccount.username === user.name && adminAccount.password === user.pass) {
      authenticateduser = { isAdmin: true, username: user.name, password: user.pass, groups: [], namespaces: [] };
    }

    if (ldapConfig && !authenticateduser) {
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
          authenticateduser = {
            isAdmin: false,
            username: authenticated.gecos ? authenticated.gecos : request.body.username,
            password: user.pass,
            groups: groups,
            namespaces: availableNamespaces
          };
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (!authenticateduser) {
      return response.status(403).end('Forbidden');
    }

    if (tools.readOnlyMode()) {
      if (request.method != 'GET' && !authenticateduser.isAdmin) {
        return response.status(405).end('Method Not Allowed');
      }
    }

    tools.audit(user.name, 'APIController', 'LOGIN');
    delete authenticateduser.password;
    response.set('authenticateduser', JSON.stringify(authenticateduser));

    // switch context for each request
    if (this.kubeService.isMultiCluster()) {
      let newContext = request.query.context;
      if (newContext) {
        this.kubeService.switchContext(newContext);
      }
    }
    return next();
  }

  async getStatus(request, response) {
    const deployStatus = await this.kubeService.getVeleroDeploymentStatus();
    const backupStorageLocations = await this.kubeService.listBackupStorageLocations();
    const volumeSnapshotLocations = await this.kubeService.listVolumeSnapshotLocations();

    var backupStorageLocationsSerialized = [];
    var volumeSnapshotLocationsSerialized = [];

    for (var i in backupStorageLocations) {
      if (backupStorageLocations[i].spec.default) {
        backupStorageLocationsSerialized.push({
          status: backupStorageLocations[i].status ? backupStorageLocations[i].status.phase : 'unknown',
          lastSync: backupStorageLocations[i].status ? backupStorageLocations[i].status.lastSyncedTime : 'unknown',
          name: backupStorageLocations[i].metadata.name
        });
      }
    }

    for (var i in volumeSnapshotLocations) {
      if (volumeSnapshotLocations[i].spec.default) {
        volumeSnapshotLocationsSerialized.push({
          status: volumeSnapshotLocations[i].statu ? volumeSnapshotLocations[i].status.phase : 'unknown',
          lastSync: volumeSnapshotLocations[i].statu ? volumeSnapshotLocations[i].status.lastSyncedTime : 'unknown',
          name: volumeSnapshotLocations[i].metadata.name
        });
      }
    }

    // audit
    let user = JSON.parse(response.get('authenticateduser'));
    tools.audit(user.username, 'APIController', 'STATUS');
    // check ready
    let isReady = false;
    if (deployStatus && deployStatus.status && deployStatus.status.replicas - deployStatus.status.readyReplicas == 0) {
      isReady = true;
    }

    let status = {
      isReady: isReady,
      isReadOnly: !user.isAdmin && tools.readOnlyMode(),
      backupStorageLocations: backupStorageLocationsSerialized,
      volumeSnapshotLocations: volumeSnapshotLocationsSerialized
    };

    if (this.kubeService.isMultiCluster()) {
      status.contexts = [];
      status.currentContext = this.kubeService.getCurrentContext();
      let contexts = this.kubeService.getContexts();
      for (let i in contexts) {
        status.contexts.push(contexts[i].name);
      }
    }

    response.type('json').send(status);
  }

  async createBackup(request, response) {
    // access
    let user = JSON.parse(response.get('authenticateduser'));

    if (tools.readOnlyMode() && !user.isAdmin) return response.status(403).json({});

    const backupStorageLocations = await this.kubeService.listBackupStorageLocations();
    const volumeSnapshotLocations = await this.kubeService.listVolumeSnapshotLocations();

    // filter
    let availableNamespaces = tools.availableNamespaces(user, await this.kubeService.listNamespaces());
    let errors = [];
    let found;
    let bodyRequest = request.body;
    // name
    if (!bodyRequest.name || bodyRequest.name.trim().length == 0) {
      errors.push('name');
    }
    // includeNamespaces
    if (!bodyRequest.includeNamespaces || bodyRequest.includeNamespaces.length == 0) {
      errors.push('includeNamespaces');
    } else {
      for (let i in bodyRequest.includeNamespaces) {
        found = false;
        for (let j in availableNamespaces) {
          if (bodyRequest.includeNamespaces[i] === availableNamespaces[j].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('includeNamespaces');
          break;
        }
      }
    }
    // excludenamespace
    if (bodyRequest.excludeNamespaces) {
      for (let i in bodyRequest.excludeNamespaces) {
        found = false;
        for (let j in availableNamespaces) {
          if (bodyRequest.excludeNamespaces[i] === availableNamespaces[j].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('excludeNamespaces');
          break;
        }
      }
    }
    // retention
    if (!bodyRequest.backupRetention || [30, 60, 90].indexOf(Number(bodyRequest.backupRetention)) === -1) {
      errors.push('backupRetention');
    }
    // backuplocation
    if (!bodyRequest.backupLocation || bodyRequest.backupLocation.trim().length == 0) {
      errors.push('backupLocation');
    }
    if (bodyRequest.backupLocation) {
      found = false;
      for (let i in backupStorageLocations) {
        if (bodyRequest.backupLocation === backupStorageLocations[i].metadata.name) {
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push('backupLocation');
      }
    }
    // snapshotlocation
    if (bodyRequest.snapshot && bodyRequest.snapshot === '1') {
      if (!bodyRequest.snapshotLocation || bodyRequest.snapshotLocation.trim().length == 0) {
        errors.push('snapshotLocation');
      }
      if (bodyRequest.snapshotLocation) {
        found = false;
        for (let i in volumeSnapshotLocations) {
          if (bodyRequest.snapshotLocation === volumeSnapshotLocations[i].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('snapshotLocation');
        }
      }
    }

    let responseContent = null;

    if (!errors.length) {
      let selectors = [],
        labels = [];
      if (bodyRequest.selectors) {
        for (let i in bodyRequest.selectors) {
          selectors.push(bodyRequest.selectors[i].name + ':' + bodyRequest.selectors[i].value);
        }
      }
      if (bodyRequest.backuplabels) {
        for (let i in bodyRequest.backuplabels) {
          labels.push(bodyRequest.backuplabels[i].name + ':' + bodyRequest.backuplabels[i].value);
        }
      }
      let backupRequest = {
        name: bodyRequest.name,
        fsbackup: bodyRequest.defaultVolumeToFS ? '1' : '0',
        snapshot: bodyRequest.snapshot ? '1' : 0,
        snapshotMoveData: bodyRequest.snapshot && bodyRequest.snapshotmovedata,
        cluster: bodyRequest.includeClusterResources ? '1' : 0,
        backuplocation: bodyRequest.backupLocation,
        retention: bodyRequest.backupRetention,
        includenamespace: bodyRequest.includeNamespaces,
        excludenamespace: bodyRequest.excludeNamespaces,
        includeresources: bodyRequest.includeResources ? bodyRequest.includeResources.join(',') : null,
        excluderesources: bodyRequest.excludeResources ? bodyRequest.excludeResources.join(',') : null,
        useselector: selectors.join(','),
        labels: labels.join(',')
      };
      let createErrors = {};
      const newBackup = await this.kubeService.createBackup(backupRequest, user, createErrors);
      if (newBackup) {
        tools.audit(user.username, 'APIController', 'CREATE', bodyRequest.name, 'Backup');
        responseContent = Backup.buildFromCRD(newBackup);
        if (responseContent) {
          responseContent = responseContent.serialize();
        }
      } else {
        errors.push(createErrors.message ? createErrors.message : 'Unable to create new backup');
      }
    }
    response
      .type('json')
      .status(errors.length == 0 ? 201 : 200)
      .send({ status: errors.length == 0, data: responseContent, errors: errors });
  }

  async createSchedule(request, response) {
    // access
    let user = JSON.parse(response.get('authenticateduser'));

    if (tools.readOnlyMode() && !user.isAdmin) return response.status(403).json({});

    const backupStorageLocations = await this.kubeService.listBackupStorageLocations();
    const volumeSnapshotLocations = await this.kubeService.listVolumeSnapshotLocations();

    // filter
    let availableNamespaces = tools.availableNamespaces(user, await this.kubeService.listNamespaces());
    let errors = [];
    let found;
    let bodyRequest = request.body;
    // name
    if (!bodyRequest.name || bodyRequest.name.trim().length == 0) {
      errors.push('name');
    }
    // cron
    if (!bodyRequest.cron || bodyRequest.cron.trim().length == 0) {
      errors.push('cron');
    } else if (!isValidCron(bodyRequest.cron)) {
      errors.push('cron');
    }
    // includeNamespaces
    if (!bodyRequest.includeNamespaces || bodyRequest.includeNamespaces.length == 0) {
      errors.push('includeNamespaces');
    } else {
      for (let i in bodyRequest.includeNamespaces) {
        found = false;
        for (let j in availableNamespaces) {
          if (bodyRequest.includeNamespaces[i] === availableNamespaces[j].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('includeNamespaces');
          break;
        }
      }
    }
    // excludenamespace
    if (bodyRequest.excludeNamespaces) {
      for (let i in bodyRequest.excludeNamespaces) {
        found = false;
        for (let j in availableNamespaces) {
          if (bodyRequest.excludeNamespaces[i] === availableNamespaces[j].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('excludeNamespaces');
          break;
        }
      }
    }
    // retention
    if (!bodyRequest.backupRetention || [30, 60, 90].indexOf(Number(bodyRequest.backupRetention)) === -1) {
      errors.push('backupRetention');
    }
    // backuplocation
    if (!bodyRequest.backupLocation || bodyRequest.backupLocation.trim().length == 0) {
      errors.push('backupLocation');
    }
    if (bodyRequest.backupLocation) {
      found = false;
      for (let i in backupStorageLocations) {
        if (bodyRequest.backupLocation === backupStorageLocations[i].metadata.name) {
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push('backupLocation');
      }
    }
    // snapshotlocation
    if (bodyRequest.snapshot && bodyRequest.snapshot === '1') {
      if (!bodyRequest.snapshotLocation || bodyRequest.snapshotLocation.trim().length == 0) {
        errors.push('snapshotLocation');
      }
      if (bodyRequest.snapshotLocation) {
        found = false;
        for (let i in volumeSnapshotLocations) {
          if (bodyRequest.snapshotLocation === volumeSnapshotLocations[i].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('snapshotLocation');
        }
      }
    }

    let responseContent = null;

    if (!errors.length) {
      let selectors = [],
        labels = [];
      if (bodyRequest.selectors) {
        for (let i in bodyRequest.selectors) {
          selectors.push(bodyRequest.selectors[i].name + ':' + bodyRequest.selectors[i].value);
        }
      }
      if (bodyRequest.backuplabels) {
        for (let i in bodyRequest.backuplabels) {
          labels.push(bodyRequest.backuplabels[i].name + ':' + bodyRequest.backuplabels[i].value);
        }
      }
      let scheduleRequest = {
        name: bodyRequest.name,
        fsbackup: bodyRequest.defaultVolumeToFS ? '1' : '0',
        snapshot: bodyRequest.snapshot ? '1' : 0,
        snapshotMoveData: bodyRequest.snapshot && bodyRequest.snapshotmovedata,
        cluster: bodyRequest.includeClusterResources ? '1' : 0,
        backuplocation: bodyRequest.backupLocation,
        retention: bodyRequest.backupRetention,
        includenamespace: bodyRequest.includeNamespaces,
        excludenamespace: bodyRequest.excludeNamespaces,
        includeresources: bodyRequest.includeResources ? bodyRequest.includeResources.join(',') : null,
        excluderesources: bodyRequest.excludeResources ? bodyRequest.excludeResources.join(',') : null,
        useselector: selectors.join(','),
        labels: labels.join(','),
        cron: bodyRequest.cron,
        ownerreferences: bodyRequest.ownerReferenceInBackup ? '1' : '0',
        paused: bodyRequest.paused ? '1' : '0'
      };
      let createErrors = {};
      const newSchedule = await this.kubeService.createSchedule(scheduleRequest, user, createErrors);
      if (newSchedule) {
        tools.audit(user.username, 'APIController', 'CREATE', bodyRequest.name, 'Schedule');
        responseContent = Schedule.buildFromCRD(newSchedule);
        if (responseContent) {
          responseContent = responseContent.serialize();
        }
      } else {
        errors.push(createErrors.message ? createErrors.message : 'Unable to create new schedule');
      }
    }
    response
      .type('json')
      .status(errors.length == 0 ? 201 : 200)
      .send({ status: errors.length == 0, data: responseContent, errors: errors });
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
    let user = JSON.parse(response.get('authenticateduser'));
    if (!tools.hasAccess(user, backup)) {
      return response.status(403).json({});
    }

    let restoreName = request.params.name + '-restore-' + Math.floor(Date.now() / 1000);
    const newRestore = await this.kubeService.createRestore({ name: restoreName, backup: request.params.name }, backup);
    // audit
    tools.audit(user.username, 'APIController', 'CREATE', restoreName, 'Restore', 'Origin backup : ' + request.params.name);

    let responseContent = Restore.buildFromCRD(newRestore);
    if (responseContent) {
      responseContent = responseContent.serialize();
    }

    response
      .type('json')
      .status(newRestore ? 201 : 200)
      .send({ status: newRestore ? true : false, restore: responseContent });
  }

  async listBackup(request, response) {
    let backups = await this.kubeService.listBackups();
    let user = JSON.parse(response.get('authenticateduser'));
    // filter
    let availableBackups = [];
    for (let i in backups) {
      if (tools.hasAccess(user, backups[i])) {
        let responseContent = Backup.buildFromCRD(backups[i]);
        if (responseContent) {
          responseContent = responseContent.serialize();
          let subResponseContent = BackupStatus.buildFromCRD(backups[i]);
          if (subResponseContent) {
            responseContent.status = subResponseContent.serialize();
          }
        }
        if (responseContent) {
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
    let user = JSON.parse(response.get('authenticateduser'));
    if (!tools.hasAccess(user, backup)) {
      return response.status(403).json({});
    }
    // audit
    tools.audit(user.username, 'APIController', 'GET', request.params.name, 'Backup');

    let responseContent = Backup.buildFromCRD(backup);
    if (responseContent) {
      responseContent = responseContent.serialize();
      let subResponseContent = BackupStatus.buildFromCRD(backup);
      if (subResponseContent) {
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
    let user = JSON.parse(response.get('authenticateduser'));
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

      return response.type('json').send(sanitizer.sanitize(JSON.stringify({ result: jsonResult, logs: logResult })));
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
    let user = JSON.parse(response.get('authenticateduser'));
    if (!tools.hasAccess(user, backup)) {
      return response.status(403).json({});
    }

    var deleteRequest = await this.kubeService.createDeleteBackupRequest(
      'delete-' + request.params.name + '-' + Math.floor(Date.now() / 1000),
      request.params.name
    );
    if (deleteRequest) {
      // audit
      tools.audit(user.username, 'APIController', 'DELETE', request.params.name, 'Backup');
    }
    response.send({ status: deleteRequest ? true : false, backup: request.params.name });
  }

  async listRestore(request, response) {
    let restores = await this.kubeService.listRestores();
    let user = JSON.parse(response.get('authenticateduser'));
    // filter
    let availableRestores = [];
    for (let i in restores) {
      if (tools.hasAccess(user, restores[i])) {
        let responseContent = Restore.buildFromCRD(restores[i]);
        if (responseContent) {
          responseContent = responseContent.serialize();
          let subResponseContent = RestoreStatus.buildFromCRD(restores[i]);
          if (subResponseContent) {
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

    let user = JSON.parse(response.get('authenticateduser'));
    // filter
    if (!tools.hasAccess(user, restore)) {
      return response.status(403).json({});
    }
    // audit
    tools.audit(user.username, 'APIController', 'GET', '', 'Restore');

    let responseContent = Restore.buildFromCRD(restore);
    if (responseContent) {
      responseContent = responseContent.serialize();
      let subResponseContent = RestoreStatus.buildFromCRD(restore);
      if (subResponseContent) {
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
    let user = JSON.parse(response.get('authenticateduser'));
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

      return response.type('json').send(sanitizer.sanitize(JSON.stringify({ result: jsonResult, logs: logResult })));
    } catch (err) {
      console.error(err);
    }

    return response.status(503).json({});
  }

  async listSchedule(request, response) {
    let schedules = await this.kubeService.listSchedules();
    let user = JSON.parse(response.get('authenticateduser'));
    // filter
    let availableSchedules = [];
    for (let i in schedules) {
      if (tools.hasAccess(user, schedules[i])) {
        let responseContent = Schedule.buildFromCRD(schedules[i]);
        if (responseContent) {
          responseContent = responseContent.serialize();
          let subResponseContent = ScheduleStatus.buildFromCRD(schedules[i]);
          if (subResponseContent) {
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

    let user = JSON.parse(response.get('authenticateduser'));
    // filter
    if (!tools.hasAccess(user, schedule)) {
      return response.status(403).json({});
    }
    // audit
    tools.audit(user.username, 'APIController', 'GET', request.params.name, 'Schedule');
    let responseContent = Schedule.buildFromCRD(schedule);
    if (responseContent) {
      responseContent = responseContent.serialize();
      let subResponseContent = ScheduleStatus.buildFromCRD(schedule);
      if (subResponseContent) {
        responseContent.status = subResponseContent.serialize();
      }
    }
    response.type('json').send(sanitizer.sanitize(JSON.stringify({ status: responseContent != null, data: responseContent })));
  }

  async deleteSchedule(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let schedule = await this.kubeService.getSchedule(request.params.name);
    let user = JSON.parse(response.get('authenticateduser'));

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
    if (!schedule) {
      return response.status(404).json({});
    }

    let user = JSON.parse(response.get('authenticateduser'));
    // filter
    if (!tools.hasAccess(user, schedule)) {
      return response.status(403).json({});
    }

    let backupName = request.params.name + '-backup-' + Math.floor(Date.now() / 1000);
    const returned = await this.kubeService.executeSchedule(schedule, backupName);
    // audit
    tools.audit(user.username, 'APIController', 'EXECUTE', request.params.name, 'Schedule', 'Created backup : ' + backupName);
    // response
    response.send({ status: returned ? true : false, backup: returned });
  }

  async toggleSchedule(request, response) {
    if (!request.params.name) {
      return response.status(404).json({});
    }

    let schedule = await this.kubeService.getSchedule(request.params.name);
    let user = JSON.parse(response.get('authenticateduser'));

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
    response.type('json').send({ status: returned ? true : false, paused: returned ? (returned.spec.paused ? true : false) : false });
  }
}

export default APIController;
