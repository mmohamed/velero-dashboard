const tools = require('./../tools');
const client = require('prom-client');

class MetricsService {
  constructor(kubeService, k8sApi, customObjectsApi) {
    this.kubeService = kubeService;
    client.register.setContentType(client.Registry.OPENMETRICS_CONTENT_TYPE);

    this.backupGauge = new client.Gauge({
      name: 'myvelero_backup_status',
      help: 'Backup status gauge',
      labelNames: ['name', 'namespace', 'phase', 'warnings', 'errors', 'start', 'end', 'expire', 'cluster']
    });

    this.restoreGauge = new client.Gauge({
      name: 'myvelero_restore_status',
      help: 'Restore status gauge',
      labelNames: ['name', 'namespace', 'phase', 'warnings', 'errors', 'start', 'end', 'cluster']
    });

    this.k8sApi = k8sApi;
    this.customObjectsApi = customObjectsApi;
  }

  async get(request, response) {
    if (!tools.metrics()) {
      return response.status(404).send();
    }

    let backups = await this.kubeService.listBackups();
    for (let i in backups) {
      let backup = backups[i];
      let namespace = tools.namespace();
      if (backup.spec.includedNamespaces.length === 1 && backup.spec.includedNamespaces[0] !== '*') {
        if (tools.filtering() && tools.ldap()) {
          namespace = backup.spec.includedNamespaces[0];
        }
      }
      this.backupGauge
        .labels({
          name: backup.metadata.name,
          namespace: namespace,
          phase: backup.status ? backup.status.phase : '',
          warnings: backup.status ? backup.status.warnings || 0 : 0,
          errors: backup.status ? backup.status.errors || 0 : 0,
          start: backup.status ? backup.status.startTimestamp : '',
          end: backup.status ? backup.status.completionTimestamp : '',
          expire: backup.status ? backup.status.expiration : '',
          cluster: this.kubeService.isMultiCluster() ? this.kubeService.getCurrentContext() : 'kubernetes'
        })
        .set(backup.status && backup.status.phase === 'Completed' ? 1 : 0);
    }

    let restores = await this.kubeService.listRestores();
    for (let i in restores) {
      let restore = restores[i];
      let namespace = tools.namespace();
      if (restore.spec.includedNamespaces.length === 1 && restore.spec.includedNamespaces[0] !== '*') {
        if (tools.filtering() && tools.ldap()) {
          namespace = restore.spec.includedNamespaces[0];
        }
      }
      this.restoreGauge
        .labels({
          name: restore.metadata.name,
          namespace: namespace,
          phase: restore.status ? restore.status.phase : '',
          warnings: restore.status ? restore.status.warnings || 0 : 0,
          errors: restore.status ? restore.status.errors || 0 : 0,
          start: restore.status ? restore.status.startTimestamp : '',
          end: restore.status ? restore.status.completionTimestamp : '',
          cluster: this.kubeService.isMultiCluster() ? this.kubeService.getCurrentContext() : 'kubernetes'
        })
        .set(restore.status && restore.status.phase === 'Completed' ? 1 : 0);
    }

    return response.send(await client.register.metrics());
  }
}

module.exports = MetricsService;
