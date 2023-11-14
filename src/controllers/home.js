const tools = require('./../tools');

class HomeController {

    constructor(kubeService, twing) {
        this.kubeService = kubeService;
        this.twing = twing;
    }

    async homeView(request, response){
        if(!request.session.user) return response.redirect('/login');
        let user = request.session.user;
        let readOnly = tools.readOnlyMode() && !user.isAdmin;
        this.twing.render('index.html.twig', { version: tools.version(), readonly: readOnly, user: user.username }).then(output => {
            response.end(output);
        });
    }

    async statusView(request, response){
        const deployStatus = await this.kubeService.getVeleroDeploymentStatus();
        const backupStorageLocations = await this.kubeService.listBackupStorageLocations();
        const volumeSnapshotLocations = await this.kubeService.listVolumeSnapshotLocations();
    
        var backupStorageLocationStatus = 'uncknown';
        var backupStorageLocationLastSync = null;
        
        for(var i in backupStorageLocations){
            if(backupStorageLocations[i].spec.default){
                backupStorageLocationStatus = backupStorageLocations[i].status.phase;
                backupStorageLocationLastSync = backupStorageLocations[i].status.lastSyncedTime
                break;
            }
        }

        tools.audit(request.session.user.username, 'HomeController', 'STATUS');

        response.send({
            isReady: (deployStatus.status.replicas - deployStatus.status.readyReplicas) == 0,
            StorageStatus: backupStorageLocationStatus, 
            lastSync: backupStorageLocationLastSync,
            volumeSnapshot: volumeSnapshotLocations.length > 0
        });
    }
}

module.exports = HomeController;