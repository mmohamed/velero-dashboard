const Backup = require('./backup');
const Label = require('./label');

class Schedule extends Backup {
  /**
   * @swagger
   * components:
   *   schemas:
   *     Schedule:
   *       allOf:
   *         - type : object
   *           properties:
   *             cron:
   *               type: string
   *               required: true
   *               example: "0 0 1 * *"
   *               description: The Crontab definition of the schedule.
   *             ownerReferenceInBackup:
   *               type: boolean
   *               required: false
   *               description: Set the schedule as owner fo the backup.
   *               default: false
   *             paused:
   *               type: boolean
   *               required: false
   *               description: the state of the schedule (pause, unpause).
   *               default: false
   *         - $ref: '#/components/schemas/Backup'
   *
   */

  #cron;
  #ownerReferenceInBackup = false;
  #paused = false;

  constructor(name) {
    super(name);
  }

  setCRON(cron) {
    this.#cron = cron;
  }

  getCRON() {
    return this.#cron;
  }

  setOwnerReferenceInBackup(ownerReferenceInBackup) {
    this.#ownerReferenceInBackup = Boolean(ownerReferenceInBackup);
  }

  getOwnerReferenceInBackup() {
    return this.#ownerReferenceInBackup;
  }

  setPaused(paused) {
    this.#paused = Boolean(paused);
  }

  getPaused() {
    return this.#paused;
  }

  serialize() {
    let serialize = super.serialize();
    serialize.cron = this.getCRON();
    serialize.ownerReferenceInBackup = this.getOwnerReferenceInBackup();
    serialize.paused = this.getPaused();
    return serialize;
  }

  static buildFromCRD(crd) {
    try {
      let schedule = new Schedule(crd.metadata.name);

      schedule.setBackupLocation(crd.spec.template.storageLocation);
      schedule.setSnapshotLocation(crd.spec.template.snapshotLocation);
      schedule.setDefaultVolumeToFS(crd.spec.template.defaultVolumesToFsBackup);
      schedule.setIncludeClusterResources(crd.spec.template.includeClusterResources);
      schedule.setIncludeNamespaces(crd.spec.template.includedNamespaces);
      schedule.setExcludeNamespaces(crd.spec.template.excludedNamespaces);
      schedule.setIncludeResources(crd.spec.template.includeResources);
      schedule.setExcludeResources(crd.spec.template.excludeResources);
      schedule.setBackupRetention(crd.spec.template.ttl ? Math.floor(crd.spec.template.ttl.replace('h0m0s', '') / 24) : null);
      schedule.setSnapshot(crd.spec.template.snapshotVolumes);
      schedule.setCRON(crd.spec.schedule);
      schedule.setOwnerReferenceInBackup(crd.spec.useOwnerReferencesInBackup);
      schedule.setPaused(crd.spec.paused);

      let labels = [];
      if (crd.metadata.labels) {
        for (const [key, value] of Object.entries(crd.metadata.labels)) {
          labels.push(new Label(key, value));
        }
      }
      schedule.setLabels(labels);

      let selectors = [];
      if (crd.spec.template.labelSelector && crd.spec.template.labelSelector.matchLabels) {
        for (const [key, value] of Object.entries(crd.spec.template.labelSelector.matchLabels)) {
          selectors.push(new Label(key, value));
        }
      }
      schedule.setSelectors(selectors);

      return schedule;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}

module.exports = Schedule;
