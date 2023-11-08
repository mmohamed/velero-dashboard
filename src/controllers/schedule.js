const tools = require('./../tools');
const k8s = require('@kubernetes/client-node');
const cron = require('cron-validator');

class ScheduleController {

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
            if(!bodyRequest.cron || bodyRequest.cron.trim().length == 0){
                errors.push('cron');
            }else if(!cron.isValidCron(bodyRequest.cron)){
                errors.push('cron');
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
                        element = input[i].trim().split('=');
                        if(element.length === 2){
                            labels[element[0]] = element[1];
                        }
                    }
                }
                // create schedule
                var body = {
                    'apiVersion': 'velero.io/v1',
                    'kind': 'Schedule',
                    'metadata': {
                        'name': bodyRequest.name,
                        'namespace': tools.namespace(),
                        'labels': labels
                    },
                    'spec': {
                        'template': {
                            'defaultVolumesToFsBackup': bodyRequest.fsbackup === '1' ? true : false,
                            'includedNamespaces': bodyRequest.includenamespace,
                            'excludedNamespaces': bodyRequest.excludenamespace ? bodyRequest.excludenamespace : [],
                            'includedResources': bodyRequest.includeresources ? bodyRequest.includeresources.trim().split(',') : [],
                            'excludedResources': bodyRequest.excluderesources ? bodyRequest.excluderesources.trim().split(',') : [],
                            'includeClusterResources' : bodyRequest.cluster === '1' && user.isAdmin ? true : false,
                            'snapshotVolumes': bodyRequest.snapshot === '1' ? true : null,
                            'storageLocation': bodyRequest.backuplocation,
                            'volumeSnapshotLocations': bodyRequest.snapshotlocation ? [bodyRequest.snapshotlocation]: [],
                            'ttl': (parseInt(bodyRequest.retention)*24)+'h0m0s',
                        },
                        'schedule': bodyRequest.cron,
                        'useOwnerReferencesInBackup' : bodyRequest.ownerreferences === '1' ? true : false
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
                    await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', body);
                } catch (err) {
                    console.error(err);
                    errors.push('global');
                    message = err.body.message;
                }
            }

            return this.twing.render('schedule.form.html.twig', { 
                schedule: bodyRequest,
                backupStorageLocations: backupStorageLocations.body.items,
                volumeSnapshotLocations: volumeSnapshotLocations.body.items,
                namespaces: availableNamespaces,
                errors: errors,
                message: message,
                user: user
            }).then(output => {
                response.status(errors.length ? 200 : 201).end(output);
            });
        }

        return this.twing.render('schedule.form.html.twig', { 
            backupStorageLocations: backupStorageLocations.body.items,
            volumeSnapshotLocations: volumeSnapshotLocations.body.items,
            namespaces: availableNamespaces,
            user: user,
            defaultVolumesToFsBackup: tools.useFSBackup()
        }).then(output => {
            response.end(output);
        });
    }

    async listAction(request, response){
        let schedules  = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules');
        // filter
        let availableSchedules = [];
        for(let i in schedules.body.items){
            if(tools.hasAccess(request.session.user, schedules.body.items[i])){
                availableSchedules.push(schedules.body.items[i]);
            }
        }
        response.send(availableSchedules);
    }

    async deleteAction(request, response){
        if(!request.body.schedule){
            return response.status(404).json({});
        }
        try {
            // filtering
            let schedule  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', request.body.schedule);
            if(!schedule.body){
                return response.status(404).json({});
            }
            // access
            if(!tools.hasAccess(request.session.user, schedule.body)){
                return response.status(403).json({});
            }
            await this.customObjectsApi.deleteNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', request.body.schedule);
            response.send({'status': true});
        } catch (err) {
            console.error(err);
            response.send({'status': false});
        }
    }

    async toggleAction(request, response){
        if(!request.body.schedule){
            return response.status(404).json({});
        }
        try {
            // filtering
            let schedule  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', request.body.schedule);
            if(!schedule.body){
                return response.status(404).json({});
            }
            // access
            if(!tools.hasAccess(request.session.user, schedule.body)){
                return response.status(403).json({});
            }
            
            // patch schedule
            var patch = [{
                  'op': schedule.body.spec.paused ? 'remove' : 'replace',
                  'path':'/spec/paused',
                  'value': true
            }];
            var options = { 'headers': { 'Content-type': k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH}};
            var returned = await this.customObjectsApi.patchNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', request.body.schedule, patch, undefined, undefined, undefined, options);
            response.send({'status': true, 'state': returned.response.body.spec.paused});
        } catch (err) {
            console.error('Error patching shcedule : '+err.body.message);
            response.send({'status': false});
        }
    }

    async executeAction(request, response){
        if(!request.body.schedule){
            return response.status(404).json({});
        }
        try {
            let schedule  = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', request.body.schedule);
            if(!schedule.body){
                return response.status(404).json({});
            }
            // access
            if(!tools.hasAccess(request.session.user, schedule.body)){
                return response.status(403).json({});
            }
            // create backup
            var body = {
                'apiVersion': 'velero.io/v1',
                'kind': 'Backup',
                'metadata': {
                    'name': request.body.name,
                    'namespace': tools.namespace()
                },
                'spec': schedule.body.spec.template
            }
            var returned = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups', body);
            response.send({'status': true, 'backup': returned.response.body});
        } catch (err) {
            console.error(err);
            response.send({'status': false});
        }
    }
}

module.exports = ScheduleController;