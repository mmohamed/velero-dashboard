const tools = require('./../tools');
const axios = require('axios');
const zlib = require('zlib');

class BackupController {

    constructor(twing, k8sApi, customObjectsApi) {
        this.twing = twing;
        this.k8sApi = k8sApi;
        this.customObjectsApi = customObjectsApi;
    }

    async createViewAction(request, response){
        let user = request.session.user;
        let readOnly = tools.readOnlyMode() && !user.isAdmin;
        if(readOnly) return response.status(403).json({});
    
        const namespaces = await this.k8sApi.listNamespace();
        const backupStorageLocations  = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backupstoragelocations');
        const volumeSnapshotLocations  = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'volumesnapshotlocations');
        
        // filter
        let availableNamespaces = tools.availableNamespaces(user, namespaces.body.items);

        if (request.method === 'POST') {
            let errors = [];
            let message;
            let found;
            let bodyRequest =  request.body;
            if(!bodyRequest.name || bodyRequest.name.trim().length == 0){
                errors.push('name');
            }
            // includenamespace
            if(!bodyRequest.includenamespace || bodyRequest.includenamespace.length == 0){
                errors.push('includenamespace');
            }else{
                for(let i in bodyRequest.includenamespace){
                    found = false
                    for(let j in availableNamespaces){
                        if(bodyRequest.includenamespace[i] === availableNamespaces[j].metadata.name){
                            found = true;
                            break;
                        }
                    }
                    if(!found){
                        errors.push('includenamespace');
                        break;
                    }
                }
            }
            // excludenamespace
            if(bodyRequest.excludenamespace){
                for(let i in bodyRequest.excludenamespace){
                    found = false
                    for(let j in availableNamespaces){
                        if(bodyRequest.excludenamespace[i] === availableNamespaces[j].metadata.name){
                            found = true;
                            break;
                        }
                    }
                    if(!found){
                        errors.push('excludenamespace');
                        break;
                    }
                }
            }
            // retention
            if(!bodyRequest.retention || ['30', '60', '90'].indexOf(bodyRequest.retention) === -1){
                errors.push('retention');
            }
            // backuplocation
            if(!bodyRequest.backuplocation || bodyRequest.backuplocation.trim().length == 0){
                errors.push('backuplocation');
            }
            if(bodyRequest.backuplocation){
                found = false;
                for(let i in backupStorageLocations.body.items){
                    if(bodyRequest.backuplocation === backupStorageLocations.body.items[i].metadata.name){
                        found = true;
                        break;
                    }
                }
                if(!found){
                    errors.push('backuplocation');
                }
            }
            // snapshotlocation
            if(bodyRequest.snapshot && bodyRequest.snapshot === '1'){
                if(!bodyRequest.snapshotlocation || bodyRequest.snapshotlocation.trim().length == 0){
                    errors.push('snapshotlocation');
                }
                if(bodyRequest.snapshotlocation){
                    found = false;
                    for(let i in volumeSnapshotLocations.body.items){
                        if(bodyRequest.snapshotlocation === volumeSnapshotLocations.body.items[i].metadata.name){
                            found = true;
                            break;
                        }
                    }
                    if(!found){
                        errors.push('snapshotlocation');
                    }
                }
            }
            if(!errors.length){
                let labels = {};
                if(bodyRequest.backuplabels && bodyRequest.backuplabels.trim().length > 0) {
                    let i, element, input = bodyRequest.backuplabels.trim().split(',');
                    for(i in input){
                        element = input[i].trim().split(':');
                        if(element.length === 2){
                            labels[element[0]] = element[1];
                        }
                    }
                }
                // create backup
                let body = {
                    'apiVersion': 'velero.io/v1',
                    'kind': 'Backup',
                    'metadata': {
                        'name': bodyRequest.name,
                        'namespace': tools.namespace(),
                        'labels': labels
                    },
                    'spec': {
                        'defaultVolumesToFsBackup': bodyRequest.fsbackup === '1' ? true : false,
                        'includedNamespaces': bodyRequest.includenamespace,
                        'excludedNamespaces': bodyRequest.excludenamespace ? bodyRequest.excludenamespace : [],
                        'includedResources': bodyRequest.includeresources ? bodyRequest.includeresources.trim().split(',') : [],
                        'excludedResources': bodyRequest.excluderesources ? bodyRequest.excluderesources.trim().split(',') : [],
                        'includeClusterResources' : bodyRequest.cluster === '1' && user.isAdmin ? true : false,
                        'snapshotVolumes': bodyRequest.snapshot === '1' ? true : null,
                        'storageLocation': bodyRequest.backuplocation,
                        'volumeSnapshotLocations': bodyRequest.snapshotlocation ? [bodyRequest.snapshotlocation]: [],
                        'ttl': (parseInt(bodyRequest.retention)*24)+'h0m0s'
                    }
                }
                if(bodyRequest.useselector && bodyRequest.useselector.trim().length > 0){
                    let selectors = bodyRequest.useselector.split(',');
                    let labelSelector = {matchLabels: {}}
                    for(let i in selectors){
                        if(selectors[i].split(':').length === 2){
                            labelSelector.matchLabels[selectors[i].split(':')[0]] = selectors[i].split(':')[1];
                        }
                    }
                    // @see https://github.com/vmware-tanzu/velero/issues/2083
                    if(selectors.length > 0){
                        body.spec.labelSelector = labelSelector; 
                    }
                }
                
                try {
                    await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups', body);
                } catch (err) {
                    console.error(err);
                    errors.push('global');
                    message = err.body.message;
                }
            }
    
            this.twing.render('backup.form.html.twig', { 
                backup: bodyRequest,
                backupStorageLocations: backupStorageLocations.body.items,
                volumeSnapshotLocations: volumeSnapshotLocations.body.items,
                namespaces: availableNamespaces,
                errors: errors,
                message: message,
                user: user
            }).then(output => {
                response.status(errors.length ? 200 : 201).end(output);
            });
    
            return;
        }
    
        return this.twing.render('backup.form.html.twig', { 
            backupStorageLocations: backupStorageLocations.body.items,
            volumeSnapshotLocations: volumeSnapshotLocations.body.items,
            namespaces: availableNamespaces,
            user: user,
            defaultVolumesToFsBackup: tools.useFSBackup()
        }).then(output => {
            response.end(output);
        });
    }

    async resultView(request, response){
        try {
            let backup  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups', request.params.name);
            if(!backup.body) {
                return response.status(404).json({});
            }
            let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);
            // access
            if(!tools.hasAccess(request.session.user, backup.body)){
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
                        'kind': 'BackupResults',
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
                        'kind': 'BackupLog',
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
        let backups = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups');
        // filter
        let availableBackups = [];
        for(let i in backups.body.items){
            if(tools.hasAccess(request.session.user, backups.body.items[i])){
                availableBackups.push(backups.body.items[i]);
            }
        }
        response.send(availableBackups);
    }

    async deleteAction(request, response){
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
            
            // create delete backup request
            var body = {
                'apiVersion': 'velero.io/v1',
                'kind': 'DeleteBackupRequest',
                'metadata': {
                    'name': request.body.name,
                    'namespace': tools.namespace()
                },
                'spec': {
                    'backupName': request.body.backup
                }
            }
            var returned = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'deletebackuprequests', body);
            response.send({'status': true, 'backup': returned.response.body});
        } catch (err) {
            console.error(err);
            response.send({'status': false});
        }
    }
}

module.exports = BackupController;