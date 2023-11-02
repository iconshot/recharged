class Action {
  constructor(closure, resolve, reject) {
    this.closure = closure;

    this.resolve = resolve;
    this.reject = reject;
  }

  async run() {
    try {
      const result = await this.closure();

      return this.resolve(result);
    } catch (error) {
      this.reject(error);
    }
  }
}

module.exports = Action;
