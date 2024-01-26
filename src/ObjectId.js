class ObjectId {
  constructor(id = null) {
    if (id !== null) {
      if (!ObjectId.test(id)) {
        throw new Error("ID must be null or a 24 character hex string.");
      }
    } else {
      id = ObjectId.generate();
    }

    this.id = id;
  }

  toString() {
    return this.id;
  }

  toJSON() {
    return this.id;
  }

  static test(id) {
    const regex = /^[0-9a-fA-F]{24}$/;

    return typeof id === "string" && regex.test(id);
  }

  // source: https://stackoverflow.com/a/37438675/16703278

  static generate(
    m = Math,
    d = Date,
    h = 16,
    s = (s) => m.floor(s).toString(h)
  ) {
    return (
      s(d.now() / 1000) + " ".repeat(h).replace(/./g, () => s(m.random() * h))
    );
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `new ObjectId("${this.id}")`;
  }
}

module.exports = ObjectId;
