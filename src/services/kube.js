const tools = require('./../tools');
const k8s = require('@kubernetes/client-node');

class KubeService {

    constructor() {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();

        this.k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
        this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
        this.customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)
    }

    async listNamespaces(){
        try{
            const namespaces = await this.k8sApi.listNamespace();
            return namespaces.body.items;
        }catch(err){
            console.error('List namespaces error : '+err);
            return [];
        }
    }

    async listBackupStorageLocations(){
        try{
            const backupStorageLocations = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backupstoragelocations');
            return backupStorageLocations.body.items;
        }catch(err){
            console.error('List backup storage locations error : '+err);
            return [];
        }
    }

    async listVolumeSnapshotLocations(){
        try{
            const volumesnapshotlocations = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'volumesnapshotlocations');
            return volumesnapshotlocations.body.items;
        }catch(err){
            console.error('List volumes napshot locations error : '+err);
            return [];
        }
    }

    async listBackups(){
        try{
            const backups = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups');
            return backups.body.items;
        }catch(err){
            console.error('List backups error : '+err);
            return [];
        }
    }

    async getBackup(name){
        try{
            let backup = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups', name);
            return backup.body ? backup.body : null;
        }catch(err){
            console.error('Get backup error : '+err);
            return null;
        }
    }

    async listRestores(){
        try{
            const restores = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'restores');
            return restores.body.items;
        }catch(err){
            console.error('List restores error : '+err);
            return [];
        }
    }

    async getRestore(name){
        try{
            let restore = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'restores', name);
            return restore.body ? restore.body : null;
        }catch(err){
            console.error('Get restore error : '+err);
            return null;
        }
    }

    async createBackup(backupDef, user, errors){
        let labels = {};
        if(backupDef.backuplabels && backupDef.backuplabels.trim().length > 0) {
            let i, element, input = backupDef.backuplabels.trim().split(',');
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
                'name': backupDef.name,
                'namespace': tools.namespace(),
                'labels': labels
            },
            'spec': {
                'defaultVolumesToFsBackup': backupDef.fsbackup === '1' ? true : false,
                'includedNamespaces': backupDef.includenamespace,
                'excludedNamespaces': backupDef.excludenamespace ? backupDef.excludenamespace : [],
                'includedResources': backupDef.includeresources ? backupDef.includeresources.trim().split(',') : [],
                'excludedResources': backupDef.excluderesources ? backupDef.excluderesources.trim().split(',') : [],
                'includeClusterResources' : backupDef.cluster === '1' && user.isAdmin ? true : false,
                'snapshotVolumes': backupDef.snapshot === '1' ? true : null,
                'storageLocation': backupDef.backuplocation,
                'volumeSnapshotLocations': backupDef.snapshotlocation ? [backupDef.snapshotlocation]: [],
                'ttl': (parseInt(backupDef.retention)*24)+'h0m0s'
            }
        }
        if(backupDef.useselector && backupDef.useselector.trim().length > 0){
            let selectors = backupDef.useselector.split(',');
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

        try{
            const response = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups', body);
            return response.response.body;
        }catch(err){
            console.error('Create backup error : '+err);
            if(typeof errors == 'object' && err.body && err.body.message){
                errors.message = err.body.message
            }
            return null;
        }
    }

    async createDownloadRequest(name, targetName, targetKind){
         // create download request
         let body = {
            'apiVersion': 'velero.io/v1',
            'kind': 'DownloadRequest',
            'metadata': {
                'namespace': tools.namespace(),
                'name': name,
            },
            'spec': {
                'target': {
                    'kind': targetKind,
                    'name': targetName
                }
            }
        }

        try{
            const response = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'downloadrequests', body);
            return response.response.body;
        }catch(err){
            console.error('Create download request error : '+err);
            return null;
        }
    }

    async geDownloadRequest(name){
        try{
            let downloadRequest = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'downloadrequests', name);
            return downloadRequest.body ? downloadRequest.body : null;
        }catch(err){
            console.error('Get download request error : '+err);
            return null;
        }
    }
    
    async createDeleteBackupRequest(name, targetName){
        // create delete backup request
        var body = {
            'apiVersion': 'velero.io/v1',
            'kind': 'DeleteBackupRequest',
            'metadata': {
                'name': name,
                'namespace': tools.namespace()
            },
            'spec': {
                'backupName': targetName
            }
        }
        
       try{
           const response = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'deletebackuprequests', body);
           return response.response.body;
       }catch(err){
           console.error('Create delete backup request error : '+err);
           return null;
       }
   }

    async createRestore(restoreDef, backupRef, errors){
        // create restore
        var body = {
            'apiVersion': 'velero.io/v1',
            'kind': 'Restore',
            'metadata': {
                'namespace': tools.namespace(),
                'name': restoreDef.name,
            },
            'spec': {
                'backupName': restoreDef.backup,
                'includedNamespaces': backupRef.spec.includedNamespaces,
                'storageLocation': backupRef.spec.storageLocation,
                'excludedResources': ['nodes', 'events', 'events.events.k8s.io', 'backups.velero.io', 'restores.velero.io', 'resticrepositories.velero.io', 'csinodes.storage.k8s.io', 'volumeattachments.storage.k8s.io', 'backuprepositories.velero.io'],
                'ttl': '720h0m0s'
            }
        }
        try{
            const response = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'restores', body);
            return response.response.body;
        }catch(err){
            console.error('Create restore error : '+err);
            if(typeof errors == 'object' && err.body && err.body.message){
                errors.message = err.body.message
            }
            return null;
        }
    }

    async listSchedules(){
        try{
            const schedules = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules');
            return schedules.body.items;
        }catch(err){
            console.error('List schedules error : '+err);
            return [];
        }
    }

    async getSchedule(name){
        try{
            let schedule = await this.customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', name);
            return schedule.body ? schedule.body : null;
        }catch(err){
            console.error('Get schedule error : '+err);
            return null;
        }
    }

    async deleteSchedule(name){
        try{
            this.customObjectsApi.deleteNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', name);
            return true;
        }catch(err){
            console.error('Delete schedule error : '+err);
            return false;
        }
    }

    async toggleSchedule(schedule){
        try{
            // patch schedule
            let patch = [{
                'op': schedule.spec.paused ? 'remove' : 'replace',
                'path':'/spec/paused',
                'value': true
            }];
            let options = { 'headers': { 'Content-type': k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH}};
            let response = await this.customObjectsApi.patchNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', schedule.metadata.name, patch, undefined, undefined, undefined, options);
            return response.response.body;
        }catch(err){
            console.error('Toggle schedule error : '+err);
            return null;
        }
    }

    async executeSchedule(schedule, backupName){
        try{
            // execute schedule by new backup
            var body = {
                'apiVersion': 'velero.io/v1',
                'kind': 'Backup',
                'metadata': {
                    'name': backupName,
                    'namespace': tools.namespace()
                },
                'spec': schedule.spec.template
            }
            var returned = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'backups', body);
            return returned.response.body;
        }catch(err){
            console.error('Execute schedule error : '+err);
            return null;
        }
    }

    async createSchedule(scheduleDef, user, errors){
        let labels = {};
        if(scheduleDef.backuplabels && scheduleDef.backuplabels.trim().length > 0) {
            let i, element, input = scheduleDef.backuplabels.trim().split(',');
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
                'name': scheduleDef.name,
                'namespace': tools.namespace(),
                'labels': labels
            },
            'spec': {
                'template': {
                    'defaultVolumesToFsBackup': scheduleDef.fsbackup === '1' ? true : false,
                    'includedNamespaces': scheduleDef.includenamespace,
                    'excludedNamespaces': scheduleDef.excludenamespace ? scheduleDef.excludenamespace : [],
                    'includedResources': scheduleDef.includeresources ? scheduleDef.includeresources.trim().split(',') : [],
                    'excludedResources': scheduleDef.excluderesources ? scheduleDef.excluderesources.trim().split(',') : [],
                    'includeClusterResources' : scheduleDef.cluster === '1' && user.isAdmin ? true : false,
                    'snapshotVolumes': scheduleDef.snapshot === '1' ? true : null,
                    'storageLocation': scheduleDef.backuplocation,
                    'volumeSnapshotLocations': scheduleDef.snapshotlocation ? [scheduleDef.snapshotlocation]: [],
                    'ttl': (parseInt(scheduleDef.retention)*24)+'h0m0s',
                },
                'schedule': scheduleDef.cron,
                'useOwnerReferencesInBackup' : scheduleDef.ownerreferences === '1' ? true : false
            }
        }
        if(scheduleDef.useselector && scheduleDef.useselector.trim().length > 0){
            let selectors = scheduleDef.useselector.split(',');
            let labelSelector = {matchLabels: {}}
            for(let i in selectors){
                if(selectors[i].split(':').length === 2){
                    labelSelector.matchLabels[selectors[i].split(':')[0]] = selectors[i].split(':')[1];
                }
            }
            // @see https://github.com/vmware-tanzu/velero/issues/2083
            if(selectors.length > 0){
                body.spec.template.labelSelector = labelSelector; 
            }
        }

        try{
            const response = await this.customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', tools.namespace(), 'schedules', body);
            return response.response.body;
        }catch(err){
            console.error('Create schedule error : '+err);
            if(typeof errors == 'object' && err.body && err.body.message){
                errors.message = err.body.message
            }
            return null;
        }
    }


    async getVeleroDeploymentStatus(name){
        try{
            const deployStatus = await this.k8sAppsApi.readNamespacedDeploymentStatus('velero', tools.namespace());
            return deployStatus.body ? deployStatus.body : null;
        }catch(err){
            console.error('Get velero deployment status error : '+err);
            return null;
        }
    }
    
}

module.exports = KubeService;