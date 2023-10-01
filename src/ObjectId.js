class ObjectId {
  constructor(id = null) {
    // source: https://stackoverflow.com/a/37438675/16703278

    const generate = (
      m = Math,
      d = Date,
      h = 16,
      s = (s) => m.floor(s).toString(h)
    ) =>
      s(d.now() / 1000) + " ".repeat(h).replace(/./g, () => s(m.random() * h));

    this.id = id !== null ? id : generate();
  }

  toString() {
    return this.id;
  }

  toJSON() {
    return this.id;
  }
}

module.exports = ObjectId;
