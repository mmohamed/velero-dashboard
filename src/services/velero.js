const config = require('./../config');

class Velero {

    constructor(kubernetes) {
        this.kubernetes = kubernetes;
    }

    async listNamespace() {
        const namespaces = await this.kubernetes.current().k8sApi.listNamespace();
        return namespaces.body.items
    }

    async listBackupStorageLocations() {
        const backupStorageLocations  = await this.kubernetes.current().customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backupstoragelocations');
        return backupStorageLocations.body.items
    }

    async listVolumeSnapshotLocations() {
        const volumeSnapshotLocations  = await this.kubernetes.current().customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'volumesnapshotlocations');
        return volumeSnapshotLocations.body.items
    }

    async createBackup(backup) {
        await this.kubernetes.current().customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups', backup);
    }

    async getBackup(backupName) {
        await this.kubernetes.current().customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups', backupName);    
    }
}


module.exports = Velero;