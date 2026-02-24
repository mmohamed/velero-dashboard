import tools from './../tools.js'
import https from 'https'
import axios from 'axios'
import zlib from 'zlib'
import sanitizer from 'sanitizer'

class RestoreController {
  constructor(kubeService, twing) {
    this.kubeService = kubeService;
    this.twing = twing;
  }

  async resultView(request, response) {
    let restore = await this.kubeService.getRestore(request.params.name);
    if (!restore) return response.status(404).json({});
    let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);

    // access
    if (!tools.hasAccess(request.user, restore)) {
      return response.status(403).json({});
    }

    let downloadRequest = await this.kubeService.createDownloadRequest(downloadRequestName, request.params.name, 'RestoreResults');

    let isProcessed = false,
      retry = 0,
      downloadResultLink = null;
    while (downloadRequest && !isProcessed && retry < 15) {
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
    while (downloadRequest && !isProcessed && retry < 15) {
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
      let storageBackupLocation = await this.kubeService.getBackupStorageLocation(backup.spec.storageLocation);
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
      tools.audit(request.user.username, 'RestoreController', 'DOWNLOAD', request.params.name, 'Restore');

      return this.twing
        .render('result.html.twig', {
          errors: jsonResult && jsonResult.errors ? tools.toArray(jsonResult.errors) : null,
          warnings: jsonResult && jsonResult.warnings ? tools.toArray(jsonResult.warnings) : null,
          log: logResult
        })
        .then((output) => {
          response.set('Content-Type', 'text/html').end(output);
        });
    } catch (err) {
      console.error(err);
    }

    return this.twing.render('result.html.twig').then((output) => {
      response.set('Content-Type', 'text/html').end(output);
    });
  }

  async listAction(request, response) {
    let restores = await this.kubeService.listRestores();
    // filter
    let availableRestores = [];
    for (let i in restores) {
      if (tools.hasAccess(request.user, restores[i])) {
        availableRestores.push(restores[i]);
      }
    }
    // audit
    tools.audit(request.user.username, 'RestoreController', 'LIST', '', 'Restore');

    response.type('json').send(sanitizer.sanitize(JSON.stringify(availableRestores)));
  }

  async restoreAction(request, response) {
    if (!request.body.backup) {
      return response.status(404).json({});
    }
    // filtering
    let backup = await this.kubeService.getBackup(request.body.backup);
    if (!backup) {
      return response.status(404).json({});
    }
    // access
    if (!tools.hasAccess(request.user, backup)) {
      return response.status(403).json({});
    }

    const newRestore = await this.kubeService.createRestore(request.body, backup);
    // audit
    tools.audit(
      request.user.username,
      'RestoreController',
      'CREATE',
      request.body.name,
      'Restore',
      'Origin backup : ' + request.body.backup
    );

    response.send({ status: newRestore ? true : false });
  }
}

export default RestoreController;
