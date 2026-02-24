import tools from './../tools.js'
import fs from 'fs'
import path from 'path'
import * as k8s from '@kubernetes/client-node'

class KubeService {
  constructor() {
    this.kc = new k8s.KubeConfig();
    let remoteClusterConfigPath = tools.multiClusterConfigDir();
    if (remoteClusterConfigPath) {
      let globalConfig;
      try {
        globalConfig = this.loadMultiClusterConfig(remoteClusterConfigPath);
      } catch (err) {
        console.error('Unable to load multi-cluster configurations file : ', err);
      }
      if (!globalConfig) {
        throw Error('Multi-cluster configuration, but without any cluster config file !');
      }
      this.kc.loadFromString(JSON.stringify(globalConfig));
      this.kc.setCurrentContext(this.kc.getContexts()[0].name);
    } else {
      this.kc.loadFromDefault();
    }
  }

  loadMultiClusterConfig(remoteClusterConfigPath) {
    let config;
    let idx = 0;
    let globalConfig = null;
    tools.debug('Try to load configuration of multi-cluster from directory : ', remoteClusterConfigPath);
    fs.readdirSync(remoteClusterConfigPath, { withFileTypes: true }).forEach((file) => {
      let filepath = remoteClusterConfigPath + path.sep + file.name;
      if (!file.isFile() && !file.isSymbolicLink()) {
        return;
      }
      if (file.isSymbolicLink()) {
        // will fail with windows env and unix link
        let target = fs.readlinkSync(filepath, { withFileTypes: true });
        let targetStat = fs.lstatSync(path.isAbsolute(target) ? target : remoteClusterConfigPath + path.sep + target);
        if (!targetStat.isFile()) {
          return;
        }
      }
      tools.debug('Try to load configuration file from : ', filepath);
      config = k8s.loadYaml(fs.readFileSync(filepath, { flag: 'r' }));
      if (!globalConfig) {
        globalConfig = config;
        for (var i in globalConfig.contexts) {
          // update context
          globalConfig.contexts[i].name = path.parse(filepath).name + (i != 0 ? '-' + globalConfig.contexts[i].name : '');
        }
      } else {
        for (var i in config.clusters) {
          // update contexts
          for (var j in config.contexts) {
            if (config.contexts[j].context.cluster === config.clusters[i].name) {
              config.contexts[j].context.cluster = config.clusters[i].name + '-' + idx;
            }
          }
          // update cluster name
          config.clusters[i].name = config.clusters[i].name + '-' + idx;
          globalConfig.clusters.push(config.clusters[i]);
        }
        for (var i in config.users) {
          // update contexts
          for (var j in config.contexts) {
            if (config.contexts[j].context.user === config.users[i].name) {
              config.contexts[j].context.user = config.users[i].name + '-' + idx;
            }
          }
          // update user
          config.users[i].name = config.users[i].name + '-' + idx;
          globalConfig.users.push(config.users[i]);
        }
        for (var i in config.contexts) {
          // update context
          config.contexts[i].name = path.parse(filepath).name + (i != 0 ? '-' + config.contexts[i].name : '');
          globalConfig.contexts.push(config.contexts[i]);
        }
      }
      idx++;
    });
    return globalConfig;
  }

  getContexts() {
    return this.kc.getContexts();
  }

  getCurrentContext() {
    return this.kc.getCurrentContext();
  }

  isMultiCluster() {
    return this.getContexts().length > 1;
  }

  switchContext(userContext) {
    if (userContext && this.getCurrentContext() != userContext) {
      let oldContext = this.kc.getCurrentContext();
      this.kc.setCurrentContext(userContext);
      tools.debug('Switching context from "' + oldContext + '" to "' + userContext + '"');
    }
  }

  getAppsApi() {
    return this.kc.makeApiClient(k8s.AppsV1Api);
  }

  getCoreApi() {
    return this.kc.makeApiClient(k8s.CoreV1Api);
  }

  getCustomObjectsApi() {
    return this.kc.makeApiClient(k8s.CustomObjectsApi);
  }

  async listNamespaces() {
    try {
      const namespaces = await this.getCoreApi().listNamespace();
      return namespaces.items;
    } catch (err) {
      console.error('List namespaces error : ' + err);
      return [];
    }
  }

  async listBackupStorageLocations() {
    try {
      const backupStorageLocations = await this.getCustomObjectsApi().listNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'backupstoragelocations'
      });

      return backupStorageLocations.items;
    } catch (err) {
      console.error('List backup storage locations error : ' + err);
      return [];
    }
  }

  async getBackupStorageLocation(name) {
    try {
      const backupStorageLocation = await this.getCustomObjectsApi().getNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'backupstoragelocations',
        name: name
      });
      return backupStorageLocation.body ? backupStorageLocation.body : null;
    } catch (err) {
      console.error('Get backup storage locations error : ' + err);
      return null;
    }
  }

  async listVolumeSnapshotLocations() {
    try {
      const volumesnapshotlocations = await this.getCustomObjectsApi().listNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'volumesnapshotlocations'
      });
      return volumesnapshotlocations.items;
    } catch (err) {
      console.error('List volumes napshot locations error : ' + err);
      return [];
    }
  }

  async listBackups() {
    try {
      const backups = await this.getCustomObjectsApi().listNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'backups'
      });
      return backups.items;
    } catch (err) {
      console.error('List backups error : ' + err);
      return [];
    }
  }

  async getBackup(name) {
    try {
      let backup = await this.getCustomObjectsApi().getNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'backups',
        name: name
      });
      return backup;
    } catch (err) {
      console.error('Get backup error : ' + err);
      return null;
    }
  }

  async listRestores() {
    try {
      const restores = await this.getCustomObjectsApi().listNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'restores'
      });
      return restores.items;
    } catch (err) {
      console.error('List restores error : ' + err);
      return [];
    }
  }

  async getRestore(name) {
    try {
      let restore = await this.getCustomObjectsApi().getNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'restores',
        name: name
      });
      return restore;
    } catch (err) {
      console.error('Get restore error : ' + err);
      return null;
    }
  }

  async createBackup(backupDef, user, errors) {
    let labels = {};
    if (backupDef.backuplabels && backupDef.backuplabels.trim().length > 0) {
      let i,
        element,
        input = backupDef.backuplabels.trim().split(',');
      for (i in input) {
        element = input[i].trim().split(':');
        if (element.length === 2) {
          labels[element[0]] = element[1];
        }
      }
    }
    // create backup
    let body = {
      apiVersion: 'velero.io/v1',
      kind: 'Backup',
      metadata: {
        name: backupDef.name,
        namespace: tools.namespace(),
        labels: labels
      },
      spec: {
        defaultVolumesToFsBackup: backupDef.fsbackup === '1' ? true : false,
        includedNamespaces: backupDef.includenamespace,
        excludedNamespaces: backupDef.excludenamespace ? backupDef.excludenamespace : [],
        includedResources: backupDef.includeresources ? backupDef.includeresources.trim().split(',') : [],
        excludedResources: backupDef.excluderesources ? backupDef.excluderesources.trim().split(',') : [],
        snapshotVolumes: backupDef.snapshot === '1' ? true : false,
        snapshotMoveData: backupDef.snapshot === '1' && backupDef.snapshotmovedata === '1' ? true : false,
        storageLocation: backupDef.backuplocation,
        volumeSnapshotLocations: backupDef.snapshotlocation ? [backupDef.snapshotlocation] : [],
        ttl: parseInt(backupDef.retention) * 24 + 'h0m0s'
      }
    };
    if (tools.resourcePolicies() != null) {
      body.spec.resourcePolicy = { kind: 'configmap', name: tools.resourcePolicies() };
    }
    if (backupDef.cluster !== undefined && user.isAdmin) {
      body.spec.includeClusterResources = backupDef.cluster === '1' ? true : false;
    }
    if (backupDef.useselector && backupDef.useselector.trim().length > 0) {
      let selectors = backupDef.useselector.split(',');
      let labelSelector = { matchLabels: {} };
      for (let i in selectors) {
        if (selectors[i].split(':').length === 2) {
          labelSelector.matchLabels[selectors[i].split(':')[0]] = selectors[i].split(':')[1];
        }
      }
      // @see https://github.com/vmware-tanzu/velero/issues/2083
      if (selectors.length > 0) {
        body.spec.labelSelector = labelSelector;
      }
    }

    try {
      const response = await this.getCustomObjectsApi().createNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'backups',
        body: body
      });
      return response;
    } catch (err) {
      console.error('Create backup error : ' + err);
      if (typeof errors == 'object' && err.body && err.body.message) {
        errors.message = err.body.message;
      }
      return null;
    }
  }

  async createDownloadRequest(name, targetName, targetKind) {
    // create download request
    let body = {
      apiVersion: 'velero.io/v1',
      kind: 'DownloadRequest',
      metadata: {
        namespace: tools.namespace(),
        name: name
      },
      spec: {
        target: {
          kind: targetKind,
          name: targetName
        }
      }
    };

    try {
      const response = await this.getCustomObjectsApi().createNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'downloadrequests',
        body: body
      });
      return response;
    } catch (err) {
      console.error('Create download request error : ' + err);
      return null;
    }
  }

  async geDownloadRequest(name) {
    try {
      let downloadRequest = await this.getCustomObjectsApi().getNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'downloadrequests',
        name: name
      });
      return downloadRequest;
    } catch (err) {
      console.error('Get download request error : ' + err);
      return null;
    }
  }

  async createDeleteBackupRequest(name, targetName) {
    // create delete backup request
    var body = {
      apiVersion: 'velero.io/v1',
      kind: 'DeleteBackupRequest',
      metadata: {
        name: name,
        namespace: tools.namespace()
      },
      spec: {
        backupName: targetName
      }
    };

    try {
      const response = await this.getCustomObjectsApi().createNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'deletebackuprequests',
        body: body
      });
      return response;
    } catch (err) {
      console.error('Create delete backup request error : ' + err);
      return null;
    }
  }

  async createRestore(restoreDef, backupRef, errors) {
    // create restore
    var body = {
      apiVersion: 'velero.io/v1',
      kind: 'Restore',
      metadata: {
        namespace: tools.namespace(),
        name: restoreDef.name
      },
      spec: {
        backupName: restoreDef.backup,
        includedNamespaces: backupRef.spec.includedNamespaces,
        storageLocation: backupRef.spec.storageLocation,
        excludedResources: [
          'nodes',
          'events',
          'events.events.k8s.io',
          'backups.velero.io',
          'restores.velero.io',
          'resticrepositories.velero.io',
          'csinodes.storage.k8s.io',
          'volumeattachments.storage.k8s.io',
          'backuprepositories.velero.io'
        ],
        ttl: '720h0m0s'
      }
    };
    try {
      const response = await this.getCustomObjectsApi().createNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'restores',
        body: body
      });
      return response;
    } catch (err) {
      console.error('Create restore error : ' + err);
      if (typeof errors == 'object' && err.body && err.body.message) {
        errors.message = err.body.message;
      }
      return null;
    }
  }

  async listSchedules() {
    try {
      const schedules = await this.getCustomObjectsApi().listNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'schedules'
      });
      return schedules.items;
    } catch (err) {
      console.error('List schedules error : ' + err);
      return [];
    }
  }

  async getSchedule(name) {
    try {
      let schedule = await this.getCustomObjectsApi().getNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'schedules',
        name: name
      });
      return schedule;
    } catch (err) {
      console.error('Get schedule error : ' + err);
      return null;
    }
  }

  async deleteSchedule(name) {
    try {
      this.getCustomObjectsApi().deleteNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'schedules',
        name: name
      });
      return true;
    } catch (err) {
      console.error('Delete schedule error : ' + err);
      return false;
    }
  }

  async toggleSchedule(schedule) {
    try {
      // patch schedule
      let patch = [
        {
          op: schedule.spec.paused ? 'remove' : 'replace',
          path: '/spec/paused',
          value: true
        }
      ];
      let options = { headers: { 'Content-type': k8s.PatchStrategy.JsonPatch } };
      let response = await this.getCustomObjectsApi().patchNamespacedCustomObject(
        {
          group: 'velero.io',
          version: 'v1',
          namespace: tools.namespace(),
          plural: 'schedules',
          name: schedule.metadata.name,
          body: patch
        },
        options
      );
      return response;
    } catch (err) {
      console.error('Toggle schedule error : ' + err);
      return null;
    }
  }

  async executeSchedule(schedule, backupName) {
    try {
      // execute schedule by new backup
      var body = {
        apiVersion: 'velero.io/v1',
        kind: 'Backup',
        metadata: {
          name: backupName,
          namespace: tools.namespace()
        },
        spec: schedule.spec.template
      };
      var returned = await this.getCustomObjectsApi().createNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'backups',
        body: body
      });
      return returned;
    } catch (err) {
      console.error('Execute schedule error : ' + err);
      return null;
    }
  }

  async createSchedule(scheduleDef, user, errors) {
    let labels = {};
    if (scheduleDef.backuplabels && scheduleDef.backuplabels.trim().length > 0) {
      let i,
        element,
        input = scheduleDef.backuplabels.trim().split(',');
      for (i in input) {
        element = input[i].trim().split('=');
        if (element.length === 2) {
          labels[element[0]] = element[1];
        }
      }
    }
    // create schedule
    var body = {
      apiVersion: 'velero.io/v1',
      kind: 'Schedule',
      metadata: {
        name: scheduleDef.name,
        namespace: tools.namespace(),
        labels: labels
      },
      spec: {
        template: {
          defaultVolumesToFsBackup: scheduleDef.fsbackup === '1' ? true : false,
          includedNamespaces: scheduleDef.includenamespace,
          excludedNamespaces: scheduleDef.excludenamespace ? scheduleDef.excludenamespace : [],
          includedResources: scheduleDef.includeresources ? scheduleDef.includeresources.trim().split(',') : [],
          excludedResources: scheduleDef.excluderesources ? scheduleDef.excluderesources.trim().split(',') : [],
          snapshotVolumes: scheduleDef.snapshot === '1' ? true : false,
          snapshotMoveData: scheduleDef.snapshot === '1' && scheduleDef.snapshotmovedata === '1' ? true : false,
          storageLocation: scheduleDef.backuplocation,
          volumeSnapshotLocations: scheduleDef.snapshotlocation ? [scheduleDef.snapshotlocation] : [],
          ttl: parseInt(scheduleDef.retention) * 24 + 'h0m0s'
        },
        schedule: scheduleDef.cron,
        useOwnerReferencesInBackup: scheduleDef.ownerreferences === '1' ? true : false,
        paused: scheduleDef.paused === '1' ? true : false
      }
    };
    if (tools.resourcePolicies() != null) {
      body.spec.template.resourcePolicy = { kind: 'configmap', name: tools.resourcePolicies() };
    }
    if (scheduleDef.cluster !== undefined && user.isAdmin) {
      body.spec.template.includeClusterResources = scheduleDef.cluster === '1' ? true : false;
    }
    if (scheduleDef.useselector && scheduleDef.useselector.trim().length > 0) {
      let selectors = scheduleDef.useselector.split(',');
      let labelSelector = { matchLabels: {} };
      for (let i in selectors) {
        if (selectors[i].split(':').length === 2) {
          labelSelector.matchLabels[selectors[i].split(':')[0]] = selectors[i].split(':')[1];
        }
      }
      // @see https://github.com/vmware-tanzu/velero/issues/2083
      if (selectors.length > 0) {
        body.spec.template.labelSelector = labelSelector;
      }
    }

    try {
      const response = await this.getCustomObjectsApi().createNamespacedCustomObject({
        group: 'velero.io',
        version: 'v1',
        namespace: tools.namespace(),
        plural: 'schedules',
        body: body
      });
      return response;
    } catch (err) {
      console.error('Create schedule error : ' + err);
      if (typeof errors == 'object' && err.body && err.body.message) {
        errors.message = err.body.message;
      }
      return null;
    }
  }

  async getVeleroDeploymentStatus(name) {
    try {
      const deployStatus = await this.getAppsApi().readNamespacedDeploymentStatus({ name: 'velero', namespace: tools.namespace() });
      return deployStatus;
    } catch (err) {
      console.error('Get velero deployment status error : ' + err);
      return null;
    }
  }
}

export default KubeService;
