class ScheduleStatus {
  /**
   * @swagger
   * components:
   *   schemas:
   *     ScheduleStatus:
   *       type : object
   *       properties:
   *         status:
   *           type: object
   *           properties:
   *             lastBackup:
   *               type: string
   *               description: the last backup date.
   *               example: 2023-11-06T14:11:09Z
   */

  #schedule;
  #lastBackup;

  constructor(schedule) {
    this.#schedule = schedule;
  }

  setSchedule(schedule) {
    this.#schedule = schedule;
  }

  getSchedule() {
    return this.#schedule;
  }

  setLastBackup(lastBackup) {
    this.#lastBackup = lastBackup ? new Date(lastBackup) : null;
  }

  getLastBackup() {
    return this.#lastBackup;
  }

  serialize() {
    return {
      lastBackup: this.getLastBackup()
    };
  }

  static buildFromCRD(crd) {
    try {
      let status = new ScheduleStatus();

      status.setLastBackup(crd.status ? crd.status.lastBackup : null);

      return status;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}

export default ScheduleStatus;
