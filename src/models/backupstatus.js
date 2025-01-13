class BackupStatus {
  /**
   * @swagger
   * components:
   *   schemas:
   *     BackupStatus:
   *       type : object
   *       properties:
   *         status:
   *           type: object
   *           properties:
   *             phase:
   *               type: string
   *               description: the state of the backup.
   *               example: Completed, PartiallyFailed
   *             failureReason:
   *               type: string
   *               description: failure message if completed with error
   *             errors:
   *               type: integer
   *               description: errors count
   *             warnings:
   *               type: integer
   *               description: warning count
   *             itemsBackedUp:
   *               type: integer
   *               description: items backedUp count
   *             totalItems:
   *               type: integer
   *               description: total items count
   *             expireAt:
   *               type: string
   *               description: the expiration date
   *             startedAt:
   *               type: string
   *               description: the starting date
   *             completedAt:
   *               type: string
   *               description: the completion date
   */

  #backup;
  #phase;
  #failureReason;
  #expireAt;
  #startedAt;
  #completedAt;
  #errors = 0;
  #warnings = 0;
  #itemsBackedUp = 0;
  #totalItems = 0;

  constructor(backup) {
    this.#backup = backup;
  }

  setBackup(backup) {
    this.#backup = backup;
  }

  getBackup() {
    return this.#backup;
  }

  setPhase(phase) {
    this.#phase = phase;
  }

  getPhase() {
    return this.#phase;
  }

  setFailureReason(failureReason) {
    this.#failureReason = failureReason;
  }

  getFailureReason() {
    return this.#failureReason;
  }

  setExpireAt(expireAt) {
    this.#expireAt = expireAt ? new Date(expireAt) : null;
  }

  getExpireAt() {
    return this.#expireAt;
  }

  setCompletedAt(completedAt) {
    this.#completedAt = completedAt ? new Date(completedAt) : null;
  }

  getCompletedAt() {
    return this.#completedAt;
  }

  setStartedAt(startedAt) {
    this.#startedAt = startedAt ? new Date(startedAt) : null;
  }

  getStartedAt() {
    return this.#startedAt;
  }

  setErrors(errors) {
    this.#errors = Number(errors);
  }

  getErrors() {
    return this.#errors;
  }

  setWarnings(warnings) {
    this.#warnings = Number(warnings);
  }

  getWarnings() {
    return this.#warnings;
  }

  setItemsBackedUp(itemsBackedUp) {
    this.#itemsBackedUp = Number(itemsBackedUp);
  }

  getItemsBackedUp() {
    return this.#itemsBackedUp;
  }

  setTotalItems(totalItems) {
    this.#totalItems = Number(totalItems);
  }

  getTotalItems() {
    return this.#totalItems;
  }

  serialize() {
    return {
      phase: this.getPhase(),
      expireAt: this.getExpireAt(),
      startedAt: this.getStartedAt(),
      completedAt: this.getCompletedAt(),
      failureReason: this.getFailureReason(),
      errors: this.getErrors(),
      warnings: this.getWarnings(),
      itemsBackedUp: this.getItemsBackedUp(),
      totalItems: this.getTotalItems()
    };
  }

  static buildFromCRD(crd) {
    try {
      let status = new BackupStatus();

      status.setPhase(crd.status.phase);
      status.setErrors(crd.status.errors ? crd.status.errors : 0);
      status.setWarnings(crd.status.warnings ? rd.status.warnings : 0);
      status.setExpireAt(crd.status.expirattion);
      status.setStartedAt(crd.status.startTimestamp);
      status.setCompletedAt(crd.status.completionTimestamp);
      status.setFailureReason(crd.status.failureReason);

      if (crd.status.progress) {
        status.setItemsBackedUp(crd.status.progress.itemsBackedUp);
        status.setTotalItems(crd.status.progress.totalItems);
      }

      return status;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}

module.exports = BackupStatus;
