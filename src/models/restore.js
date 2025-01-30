class Restore {
  /**
   * @swagger
   * components:
   *   schemas:
   *     Restore:
   *       type: object
   *       properties:
   *         name:
   *           required: true
   *           type: string
   *           description: The restore name (must be unique).
   *           example: my-restore-from-my-backup
   *         backupName:
   *           required: true
   *           type: string
   *           description: The source backup name.
   *           example: my-backup
   *         scheduleName:
   *           required: false
   *           type: string
   *           description: The schedule name if is created by.
   *           example: my-backup
   *         createdAt:
   *           required: true
   *           type: string
   *           example: 2023-11-06T14:11:09Z
   *           description: creation date.
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
   *             example: events
   */

  #name;
  #backupName;
  #scheduleName;
  #createdAt;
  #includeNamespaces = [];
  #excludeNamespaces = [];
  #includeResources = [];
  #excludeResources = [];

  constructor(name) {
    this.#name = name;
  }

  setName(name) {
    this.#name = name;
  }

  getName() {
    return this.#name;
  }

  setBackupName(backupName) {
    this.#backupName = backupName;
  }

  getBackupName() {
    return this.#backupName;
  }

  setScheduleName(scheduleName) {
    this.#scheduleName = scheduleName;
  }

  getScheduleName() {
    return this.#scheduleName;
  }

  setCreatedAt(createdAt) {
    this.#createdAt = createdAt ? new Date(createdAt) : null;
  }

  getCreatedAt() {
    return this.#createdAt;
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

  serialize() {
    return {
      name: this.getName(),
      backupName: this.getBackupName(),
      scheduleName: this.getScheduleName(),
      createdAt: this.getCreatedAt(),
      includeNamespaces: this.getIncludeNamespaces(),
      excludeNamespaces: this.getExcludeNamespaces(),
      includeResources: this.getIncludeResources(),
      excludeResources: this.getExcludeResources()
    };
  }

  static buildFromCRD(crd) {
    try {
      let restore = new Restore(crd.metadata.name);

      restore.setScheduleName(crd.spec.scheduleName);
      restore.setBackupName(crd.spec.backupName);
      restore.setCreatedAt(crd.metadata.creationTimestamp);
      restore.setIncludeNamespaces(crd.spec.includedNamespaces);
      restore.setExcludeNamespaces(crd.spec.excludedNamespaces);
      restore.setIncludeResources(crd.spec.includeResources);
      restore.setExcludeResources(crd.spec.excludeResources);

      return restore;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}

module.exports = Restore;
