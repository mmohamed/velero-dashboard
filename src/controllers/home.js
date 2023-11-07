const config = require('./../config');

class HomeController {

    constructor(twing, k8sAppsApi, customObjectsApi) {
        this.twing = twing;
        this.k8sAppsApi = k8sAppsApi;
        this.customObjectsApi = customObjectsApi;
    }

    async homeView(request, response){
        if(!request.session.user) return response.redirect('/login');
        let user = request.session.user;
        let readOnly = config.readOnlyMode() && !user.isAdmin;
        this.twing.render('index.html.twig', { version: config.version(), readonly: readOnly, user: user.username }).then(output => {
            response.end(output);
        });
    }

    async statusView(request, response){
        const deployStatus = await this.k8sAppsApi.readNamespacedDeploymentStatus('velero', config.namespace());
        const backupStorageLocations  = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backupstoragelocations');
        const volumeSnapshotLocations  = await this.customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'volumesnapshotlocations');
    
        var backupStorageLocationStatus = 'uncknown';
        var backupStorageLocationLastSync = null;
        
        for(var i in backupStorageLocations.body.items){
            if(backupStorageLocations.body.items[i].spec.default){
                backupStorageLocationStatus = backupStorageLocations.body.items[i].status.phase;
                backupStorageLocationLastSync = backupStorageLocations.body.items[i].status.lastSyncedTime
                break;
            }
        }

        response.send({
            isReady: (deployStatus.body.status.replicas - deployStatus.body.status.readyReplicas) == 0,
            StorageStatus: backupStorageLocationStatus, 
            lastSync: backupStorageLocationLastSync,
            volumeSnapshot: volumeSnapshotLocations.body.items.length > 0
        });
    }
}

module.exports = HomeController;