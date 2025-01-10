class Label {
  /**
   * @swagger
   * components:
   *   schemas:
   *     Label:
   *       type: object
   *       properties:
   *         name:
   *           required: true
   *           type: string
   *         value:
   *           required: false
   *           type: string
   */

  #name;
  #value;

  constructor(name, value) {
    this.#name = name;
    this.#value = value;
  }

  setName(name) {
    this.#name = name;
  }

  getName() {
    return this.#name;
  }

  setValue(value) {
    this.#value = value;
  }

  getValue() {
    return this.#value;
  }

  serialize() {
    return {
      name: this.getName(),
      value: this.getValue()
    };
  }
}

module.exports = Label;
