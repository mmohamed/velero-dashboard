const tools = require('./../tools');
const https = require('https');
const axios = require('axios');
const zlib = require('zlib');

class BackupController {
  constructor(kubeService, twing) {
    this.kubeService = kubeService;
    this.twing = twing;
  }

  async createViewAction(request, response) {
    let user = request.session.user;
    let readOnly = tools.readOnlyMode() && !user.isAdmin;
    if (readOnly) return response.status(403).json({});

    const backupStorageLocations = await this.kubeService.listBackupStorageLocations();
    const volumeSnapshotLocations = await this.kubeService.listVolumeSnapshotLocations();

    // filter
    let availableNamespaces = tools.availableNamespaces(user, await this.kubeService.listNamespaces());

    if (request.method === 'POST') {
      let errors = [];
      let message;
      let found;
      let bodyRequest = request.body;
      if (!bodyRequest.name || bodyRequest.name.trim().length == 0) {
        errors.push('name');
      }
      // includenamespace
      if (!bodyRequest.includenamespace || bodyRequest.includenamespace.length == 0) {
        errors.push('includenamespace');
      } else {
        for (let i in bodyRequest.includenamespace) {
          found = false;
          for (let j in availableNamespaces) {
            if (bodyRequest.includenamespace[i] === availableNamespaces[j].metadata.name) {
              found = true;
              break;
            }
          }
          if (!found) {
            errors.push('includenamespace');
            break;
          }
        }
      }
      // excludenamespace
      if (bodyRequest.excludenamespace) {
        for (let i in bodyRequest.excludenamespace) {
          found = false;
          for (let j in availableNamespaces) {
            if (bodyRequest.excludenamespace[i] === availableNamespaces[j].metadata.name) {
              found = true;
              break;
            }
          }
          if (!found) {
            errors.push('excludenamespace');
            break;
          }
        }
      }
      // retention
      if (!bodyRequest.retention || ['30', '60', '90'].indexOf(bodyRequest.retention) === -1) {
        errors.push('retention');
      }
      // backuplocation
      if (!bodyRequest.backuplocation || bodyRequest.backuplocation.trim().length == 0) {
        errors.push('backuplocation');
      }
      if (bodyRequest.backuplocation) {
        found = false;
        for (let i in backupStorageLocations) {
          if (bodyRequest.backuplocation === backupStorageLocations[i].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('backuplocation');
        }
      }
      // snapshotlocation
      if (bodyRequest.snapshot && bodyRequest.snapshot === '1') {
        if (!bodyRequest.snapshotlocation || bodyRequest.snapshotlocation.trim().length == 0) {
          errors.push('snapshotlocation');
        }
        if (bodyRequest.snapshotlocation) {
          found = false;
          for (let i in volumeSnapshotLocations) {
            if (bodyRequest.snapshotlocation === volumeSnapshotLocations[i].metadata.name) {
              found = true;
              break;
            }
          }
          if (!found) {
            errors.push('snapshotlocation');
          }
        }
      }
      if (!errors.length) {
        let createErrors = {};
        const newBackup = await this.kubeService.createBackup(bodyRequest, user, createErrors);
        if (newBackup) {
          tools.audit(user.username, 'BackupController', 'CREATE', bodyRequest.name, 'Backup');
        } else {
          errors.push('global');
          message = createErrors.message ? createErrors.message : 'Unable to create new backup';
        }
      }

      this.twing
        .render('backup.form.html.twig', {
          backup: bodyRequest,
          backupStorageLocations: backupStorageLocations,
          volumeSnapshotLocations: volumeSnapshotLocations,
          namespaces: availableNamespaces,
          errors: errors,
          message: message,
          user: user,
          csrfToken: request.csrfToken()
        })
        .then((output) => {
          response.status(errors.length ? 200 : 201).end(output);
        });

      return;
    }

    return this.twing
      .render('backup.form.html.twig', {
        backupStorageLocations: backupStorageLocations,
        volumeSnapshotLocations: volumeSnapshotLocations,
        namespaces: availableNamespaces,
        user: user,
        defaultVolumesToFsBackup: tools.useFSBackup(),
        csrfToken: request.csrfToken()
      })
      .then((output) => {
        response.end(output);
      });
  }

  async resultView(request, response) {
    let backup = await this.kubeService.getBackup(request.params.name);
    if (!backup) {
      return response.status(404).json({});
    }
    let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);
    // access
    if (!tools.hasAccess(request.session.user, backup)) {
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
      tools.audit(request.session.user.username, 'BackupController', 'DOWNLOAD', request.params.name, 'Backup');

      return this.twing
        .render('result.html.twig', {
          errors: jsonResult && jsonResult.errors ? tools.toArray(jsonResult.errors) : null,
          warnings: jsonResult && jsonResult.warnings ? tools.toArray(jsonResult.warnings) : null,
          log: logResult
        })
        .then((output) => {
          response.end(output);
        });
    } catch (err) {
      console.error(err);
    }

    return this.twing.render('result.html.twig').then((output) => {
      response.end(output);
    });
  }

  async listAction(request, response) {
    let backups = await this.kubeService.listBackups();
    // filter
    let availableBackups = [];
    for (let i in backups) {
      if (tools.hasAccess(request.session.user, backups[i])) {
        availableBackups.push(backups[i]);
      }
    }
    // audit
    tools.audit(request.session.user.username, 'BackupController', 'LIST', '', 'Backup');

    response.send(availableBackups);
  }

  async deleteAction(request, response) {
    if (!request.body.backup) {
      return response.status(404).json({});
    }

    // filtering
    let backup = await this.kubeService.getBackup(request.body.backup);
    if (!backup) {
      return response.status(404).json({});
    }
    // access
    if (!tools.hasAccess(request.session.user, backup)) {
      return response.status(403).json({});
    }

    var deleteRequest = await this.kubeService.createDeleteBackupRequest(request.body.name, request.body.backup);
    if (deleteRequest) {
      // audit
      tools.audit(request.session.user.username, 'BackupController', 'DELETE', request.params.name, 'Backup');
    }
    response.send({ status: deleteRequest ? true : false });
  }
}

module.exports = BackupController;
