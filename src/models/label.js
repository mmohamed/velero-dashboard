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
   *           example: myvelero/v1
   *         value:
   *           required: false
   *           type: string
   *           example: enable
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

export default Label;
