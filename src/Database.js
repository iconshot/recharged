const fsp = require("fs/promises");

const Collection = require("./Collection");
const File = require("./File");

class Database {
  constructor(dir) {
    this.dir = dir;

    this.collections = [];

    this.caches = new Map();
  }

  getDir() {
    return this.dir;
  }

  getCache(name) {
    return this.caches.get(name);
  }

  createCollection(name, schema, options = {}) {
    this.caches.set(name, new Map());

    const collection = new Collection(name, schema, options, this);

    this.collections.push(collection);

    return collection;
  }

  async start() {
    const promises = this.collections.map(async (collection) => {
      const dir = collection.getDir();

      try {
        await fsp.access(dir);
      } catch (error) {
        return;
      }

      const files = await fsp.readdir(dir);

      const promises = [];

      for (let i = 0; i < files.length; i++) {
        const file = new File(collection, i);

        const read = async () => {
          try {
            await file.read();
          } catch (error) {
            await read();
          }
        };

        promises.push(read());
      }

      return await Promise.all(promises);
    });

    await Promise.all(promises);
  }
}

module.exports = Database;
