import tools from './../tools.js'

class HomeController {
  constructor(kubeService, twing) {
    this.kubeService = kubeService;
    this.twing = twing;
  }

  async homeView(request, response) {
    if (!request.user) return response.redirect(tools.subPath('/login'));

    let user = request.user;
    let readOnly = tools.readOnlyMode() && !user.isAdmin;
    let contexts = this.kubeService.getContexts();
    let currentContext = this.kubeService.getCurrentContext();

    this.twing
      .render('index.html.twig', {
        version: tools.version(),
        readonly: readOnly,
        user: user.username,
        contexts: contexts,
        current: currentContext,
        csrfToken: request.csrfToken()
      })
      .then((output) => {
        response.set('Content-Type', 'text/html').end(output);
      });
  }

  async statusView(request, response) {
    const deployStatus = await this.kubeService.getVeleroDeploymentStatus();
    const backupStorageLocations = await this.kubeService.listBackupStorageLocations();
    const volumeSnapshotLocations = await this.kubeService.listVolumeSnapshotLocations();

    var backupStorageLocationStatus = 'unknown';
    var backupStorageLocationLastSync = null;

    for (var i in backupStorageLocations) {
      if (backupStorageLocations[i].spec.default) {
        backupStorageLocationStatus = backupStorageLocations[i].status.phase;
        backupStorageLocationLastSync = backupStorageLocations[i].status.lastSyncedTime;
        break;
      }
    }
    // audit
    tools.audit(request.user.username, 'HomeController', 'STATUS');
    // check ready
    let isReady = false;
    if (deployStatus && deployStatus.status && deployStatus.status.replicas - deployStatus.status.readyReplicas == 0) {
      isReady = true;
    }
    response.send({
      isReady: isReady,
      StorageStatus: backupStorageLocationStatus,
      lastSync: backupStorageLocationLastSync,
      volumeSnapshot: volumeSnapshotLocations.length > 0
    });
  }
}

export default HomeController;
