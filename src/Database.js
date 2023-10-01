const Collection = require("./Collection");

class Database {
  constructor(dir) {
    this.dir = dir;
  }

  getDir() {
    return this.dir;
  }

  createCollection(name, schema, options = {}) {
    return new Collection(name, schema, options, this);
  }
}

module.exports = Database;
