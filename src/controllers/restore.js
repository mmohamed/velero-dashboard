const tools = require('./../tools');
const axios = require('axios');
const zlib = require('zlib');

class RestoreController {

    constructor(twing, customObjectsApi) {
        this.twing = twing;
        this.customObjectsApi = customObjectsApi;
    }

    async resultView(request, response){
        try {
            let restore  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'restores', request.params.name);
            if(!restore.body) return response.status(404).json({});
            let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);
    
            // access
            if(!tools.hasAccess(request.session.user, restore.body)){
                return response.status(403).json({});
            }
    
            // create download request for result
            let body = {
                'apiVersion': 'velero.io/v1',
                'kind': 'DownloadRequest',
                'metadata': {
                    'namespace': tools.namespace(),
                    'name': downloadRequestName,
                },
                'spec': {
                    'target': {
                        'kind': 'RestoreResults',
                        'name': request.params.name
                    }
                }
            }
            let downloadRequest = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'downloadrequests', body);
            
            let isProcessed = false, retry = 0, downloadResultLink = null;
            while(!isProcessed && retry < 15){
                downloadRequest  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'downloadrequests', downloadRequestName);
                if(downloadRequest.body && downloadRequest.body.status && downloadRequest.body.status.phase == 'Processed'){
                    isProcessed = true;
                    downloadResultLink = downloadRequest.body.status.downloadURL;
                }else{
                    await tools.delay(1000);
                }
                retry++;
            }
    
            downloadRequestName = request.params.name + '-log-download-request-' + Math.floor(Date.now() / 1000);
            // create download request for log
            body = {
                'apiVersion': 'velero.io/v1',
                'kind': 'DownloadRequest',
                'metadata': {
                    'namespace': tools.namespace(),
                    'name': downloadRequestName,
                },
                'spec': {
                    'target': {
                        'kind': 'RestoreLog',
                        'name': request.params.name
                    }
                }
            }
            downloadRequest = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'downloadrequests', body);
            isProcessed = false, retry = 0;
            let downloadLogLink = null;
            while(!isProcessed && retry < 15){
                downloadRequest  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'downloadrequests', downloadRequestName);
                if(downloadRequest.body && downloadRequest.body.status && downloadRequest.body.status.phase == 'Processed'){
                    isProcessed = true;
                    downloadLogLink = downloadRequest.body.status.downloadURL;
                }else{
                    await tools.delay(1000);
                }
                retry++;
            }
    
            // download result file
            let jsonResult = null;
            if(downloadResultLink){          
                let { data } = await axios.get(downloadResultLink, { responseType: 'arraybuffer', 'decompress': false });
                jsonResult = JSON.parse(zlib.unzipSync(data).toString());
            }
            // download log file
            let logResult = null;
            if(downloadLogLink){          
                let { data } = await axios.get(downloadLogLink, { responseType: 'arraybuffer', 'decompress': false });
                logResult = zlib.unzipSync(data).toString();
            }
            
            return this.twing.render('result.html.twig', { 
                errors: jsonResult && jsonResult.errors ? tools.toArray(jsonResult.errors) : null,
                warnings: jsonResult && jsonResult.warnings ? tools.toArray(jsonResult.warnings) : null,
                log: logResult,
            }).then(output => {
                response.end(output);
            });
    
        } catch (err) {
            console.error(err);
        }
    
        return this.twing.render('result.html.twig').then(output => {
            response.end(output);
        });
    }

    async listAction(request, response){
        let restores  = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'restores');
        // filter
        let availableRestores = [];
        for(let i in restores.body.items){
            if(tools.hasAccess(request.session.user, restores.body.items[i])){
                availableRestores.push(restores.body.items[i]);
            }
        }
        response.send(availableRestores);
    }

    async restoreAction(request, response){
        if(!request.body.backup){
            return response.status(404).json({});
        }
        try {
            // filtering
            let backup  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups', request.body.backup);
            if(!backup.body){
                return response.status(404).json({});
            }
            // access
            if(!tools.hasAccess(request.session.user, backup.body)){
                return response.status(403).json({});
            }
            
            // create restore
            var body = {
                'apiVersion': 'velero.io/v1',
                'kind': 'Restore',
                'metadata': {
                    'namespace': tools.namespace(),
                    'name': request.body.name,
                },
                'spec': {
                    'backupName': request.body.backup,
                    'defaultVolumesToFsBackup': tools.useFSBackup(),
                    'includedNamespaces': backup.body.spec.includedNamespaces,
                    'storageLocation': 'default', // @TODO get default storage location
                    'excludedResources': ['nodes', 'events', 'events.events.k8s.io', 'backups.velero.io', 'restores.velero.io', 'resticrepositories.velero.io', 'csinodes.storage.k8s.io', 'volumeattachments.storage.k8s.io', 'backuprepositories.velero.io'],
                    'ttl': '720h0m0s'
                }
            }
            var returned = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'restores', body);
            response.send({'status': true, 'restore': returned.response.body});
        } catch (err) {
            console.error(err);
            response.send({'status': false});
        }
    }
}

module.exports = RestoreController;