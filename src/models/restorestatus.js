class RestoreStatus {
  /**
   * @swagger
   * components:
   *   schemas:
   *     RestoreStatus:
   *       type : object
   *       properties:
   *         status:
   *           type: object
   *           properties:
   *             completedAt:
   *               type: datetime
   *               description: completing date
   *             startedAt:
   *               type: datetime
   *               description: starting date
   *             failureReason:
   *               type: string
   *               description: failure message if completed with error
   *             phase:
   *               type: string
   *               example: Completed
   *             errors:
   *               type: integer
   *               description: errors count
   *             warnings:
   *               type: integer
   *               description: warning count
   *             itemsRestored:
   *               type: integer
   *               description: restored items count
   *             totalItems:
   *               type: integer
   *               description: total items count
   */

  #restore;
  #phase;
  #completedAt;
  #startedAt;
  #itemsRestored = 0;
  #totalItems = 0;
  #errors = 0;
  #warnings = 0;
  #failureReason;

  constructor(restore) {
    this.#restore = restore;
  }

  setRestore(restore) {
    this.#restore = restore;
  }

  getRestore() {
    return this.#restore;
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

  setStartedAt(startedAt) {
    this.#startedAt = startedAt ? new Date(startedAt) : null;
  }

  getStartedAt() {
    return this.#startedAt;
  }

  setCompletedAt(completedAt) {
    this.#completedAt = completedAt ? new Date(completedAt) : null;
  }

  getCompletedAt() {
    return this.#completedAt;
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

  setItemsRestored(itemsRestored) {
    this.#itemsRestored = Number(itemsRestored);
  }

  getItemsRestored() {
    return this.#itemsRestored;
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
      startedAt: this.getStartedAt(),
      completedAt: this.getCompletedAt(),
      failureReason: this.getFailureReason(),
      errors: this.getErrors(),
      warnings: this.getWarnings(),
      itemsRestored: this.getItemsRestored(),
      totalItems: this.getTotalItems()
    };
  }

  static buildFromCRD(crd) {
    try {
      let status = new RestoreStatus();

      status.setPhase(crd.status.phase);
      status.setErrors(crd.status.errors ? crd.status.errors : 0);
      status.setWarnings(crd.status.warnings ? crd.status.warnings : 0);
      status.setStartedAt(crd.status.startTimestamp);
      status.setCompletedAt(crd.status.completionTimestamp);
      status.setFailureReason(crd.status.failureReason);

      if (crd.status.progress) {
        status.setItemsRestored(crd.status.progress.itemsRestored);
        status.setTotalItems(crd.status.progress.totalItems);
      }

      return status;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}

module.exports = RestoreStatus;
