const Label = require('./label');

class Backup {
  /**
   * @swagger
   * components:
   *   schemas:
   *     Backup:
   *       type: object
   *       properties:
   *         name:
   *           required: true
   *           type: string
   *           description: The backup name (must be unique).
   *           example: my-backup
   *         defaultVolumeToFS:
   *           type: boolean
   *           required: false
   *           default: true
   *           description: Save volumes content to FileSystem.
   *         snapshot:
   *           type: boolean
   *           required: false
   *           default: false
   *           description: Use snapshot for volumes.
   *         snapshotMoveData:
   *           type: boolean
   *           required: false
   *           default: false
   *           description: Move snapshot data to remote storage backend.
   *         includeClusterResources:
   *           type: boolean
   *           required: false
   *           default: false
   *           description: Include cluster resources.
   *         snapshotLocation:
   *           type: string
   *           required: false
   *           description: The snapshot location name.
   *           example: default
   *         backupLocation:
   *           type: string
   *           required: false
   *           description: The backup location.
   *           example: default
   *         backupRetention:
   *           type: integer
   *           required: true
   *           description: The backup retention days (must be 30, 60 or 90).
   *           example: 60
   *         includeNamespaces:
   *           required: false
   *           type: array
   *           description: Include namespaces list.
   *           items:
   *             type: string
   *             example: my-namespace
   *         excludeNamespaces:
   *           required: false
   *           type: array
   *           description: Exclude namespaces list.
   *           items:
   *             type: string
   *             example: my-namespace
   *         includeResources:
   *           required: false
   *           type: array
   *           description: Include resources list.
   *           items:
   *             type: string
   *             example: configmap
   *         excludeResources:
   *           required: false
   *           type: array
   *           description: Exclude resources list.
   *           items:
   *             type: string
   *             example: secret
   *         labels:
   *           required: false
   *           type: array
   *           description: Backup labels list.
   *           items:
   *             $ref: '#/components/schemas/Label'
   *         selectors:
   *           required: false
   *           type: array
   *           description: Used selectors list.
   *           items:
   *             $ref: '#/components/schemas/Label'
   *
   */

  #name;
  #defaultVolumeToFS = true;
  #snapshot = false;
  #snapshotMoveData = false;
  #includeClusterResources = false;
  #snapshotLocation;
  #backupLocation;
  #backupRetention;
  #includeNamespaces = [];
  #excludeNamespaces = [];
  #includeResources = [];
  #excludeResources = [];
  #labels = [];
  #selectors = [];

  constructor(name) {
    this.#name = name;
  }

  setName(name) {
    this.#name = name;
  }

  getName() {
    return this.#name;
  }

  setDefaultVolumeToFS(defaultVolumeToFS) {
    this.#defaultVolumeToFS = Boolean(defaultVolumeToFS);
  }

  getDefaultVolumeToFS() {
    return this.#defaultVolumeToFS;
  }

  setSnapshot(snapshot) {
    this.#snapshot = Boolean(snapshot);
  }

  getSnapshot() {
    return this.#snapshot;
  }

  setSnapshotMoveData(snapshotMoveData) {
    this.#snapshotMoveData = Boolean(snapshotMoveData);
  }

  getSnapshotMoveData() {
    return this.#snapshotMoveData;
  }

  setIncludeClusterResources(includeClusterResources) {
    this.#includeClusterResources = Boolean(includeClusterResources);
  }

  getIncludeClusterResources() {
    return this.#includeClusterResources;
  }

  setSnapshotLocation(snapshotLocation) {
    this.#snapshotLocation = snapshotLocation;
  }

  getSnapshotLocation() {
    return this.#snapshotLocation;
  }

  setBackupLocation(backupLocation) {
    this.#backupLocation = backupLocation;
  }

  getBackupLocation() {
    return this.#backupLocation;
  }

  setBackupRetention(backupRetention) {
    this.#backupRetention = Number(backupRetention);
  }

  getBackupRetention() {
    return this.#backupRetention;
  }

  setIncludeNamespaces(includeNamespaces) {
    if (!includeNamespaces) return;
    this.#includeNamespaces = Array.isArray(includeNamespaces) ? includeNamespaces : [includeNamespaces];
  }

  getIncludeNamespaces() {
    return this.#includeNamespaces;
  }

  setExcludeNamespaces(excludeNamespaces) {
    if (!excludeNamespaces) return;
    this.#excludeNamespaces = Array.isArray(excludeNamespaces) ? excludeNamespaces : [excludeNamespaces];
  }

  getExcludeNamespaces() {
    return this.#excludeNamespaces;
  }

  setIncludeResources(includeResources) {
    if (!includeResources) return;
    this.#includeResources = Array.isArray(includeResources) ? includeResources : [includeResources];
  }

  getIncludeResources() {
    return this.#includeResources;
  }

  setExcludeResources(excludeResources) {
    if (!excludeResources) return;
    this.#excludeResources = Array.isArray(excludeResources) ? excludeResources : [excludeResources];
  }

  getExcludeResources() {
    return this.#excludeResources;
  }

  setLabels(labels) {
    this.#labels = Array.isArray(labels) ? labels : [labels];
  }

  getLabels() {
    return this.#labels;
  }

  setSelectors(selectors) {
    this.#selectors = Array.isArray(selectors) ? selectors : [selectors];
  }

  getSelectors() {
    return this.#selectors;
  }

  serialize() {
    let labels = [],
      selectors = [];
    for (let i in this.getLabels()) {
      labels.push(this.getLabels()[i].serialize());
    }
    for (let i in this.getSelectors()) {
      selectors.push(this.getSelectors()[i].serialize());
    }
    return {
      name: this.getName(),
      defaultVolumeToFS: this.getDefaultVolumeToFS(),
      snapshot: this.getSnapshot(),
      snapshotMoveData: this.getSnapshotMoveData(),
      includeClusterResources: this.getIncludeClusterResources(),
      snapshotLocation: this.getSnapshotLocation(),
      backupLocation: this.getBackupLocation(),
      backupRetention: this.getBackupRetention(),
      includeNamespaces: this.getIncludeNamespaces(),
      excludeNamespaces: this.getExcludeNamespaces(),
      includeResources: this.getIncludeResources(),
      excludeResources: this.getExcludeResources(),
      labels: labels,
      selectors: selectors
    };
  }

  static buildFromCRD(crd) {
    try {
      let backup = new Backup(crd.metadata.name);

      backup.setBackupLocation(crd.spec.storageLocation);
      backup.setSnapshotLocation(crd.spec.snapshotLocation);
      backup.setDefaultVolumeToFS(crd.spec.defaultVolumesToFsBackup);
      backup.setIncludeClusterResources(crd.spec.includeClusterResources);
      backup.setIncludeNamespaces(crd.spec.includedNamespaces);
      backup.setExcludeNamespaces(crd.spec.excludedNamespaces);
      backup.setIncludeResources(crd.spec.includeResources);
      backup.setExcludeResources(crd.spec.excludeResources);
      backup.setBackupRetention(crd.spec.ttl ? Math.floor(crd.spec.ttl.replace('h0m0s', '') / 24) : null);
      backup.setSnapshot(crd.spec.snapshotVolumes);
      backup.setSnapshotMoveData(crd.spec.snapshotMoveData);

      let labels = [];
      if (crd.metadata.labels) {
        for (const [key, value] of Object.entries(crd.metadata.labels)) {
          labels.push(new Label(key, value));
        }
      }
      backup.setLabels(labels);

      let selectors = [];
      if (crd.spec.labelSelector && crd.spec.labelSelector.matchLabels) {
        for (const [key, value] of Object.entries(crd.spec.labelSelector.matchLabels)) {
          selectors.push(new Label(key, value));
        }
      }
      backup.setSelectors(selectors);

      return backup;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}

module.exports = Backup;
