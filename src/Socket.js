const net = require("node:net");
const crypto = require("node:crypto");

const { EventEmitter } = require("node:events");

class Socket {
  constructor(client) {
    this.emitter = new EventEmitter();

    this.socket = null;

    this.results = new Map();

    this.client = client;
  }

  async init() {
    await this.connect();

    this.listen();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const host = this.client.getHost();
      const port = this.client.getPort();

      this.socket = net.connect({ host, port });

      this.socket.on("connect", resolve);
      this.socket.on("error", reject);
    });
  }

  listen() {
    let string = "";

    this.socket.on("data", (buffer) => {
      string += buffer.toString();

      if (!string.includes("\x00")) {
        return;
      }

      const split = string.split("\x00");

      for (let i = 0; i < split.length - 1; i++) {
        const json = split[i];

        this.parse(json);
      }

      string = split[split.length - 1];
    });
  }

  parse(json) {
    const { id, data, error, ended } = JSON.parse(json);

    if (ended) {
      this.emitter.emit("result", id);

      return;
    }

    const result = this.results.get(id);

    if (error !== null) {
      result.error = new Error(error.message);

      return;
    }

    if (Array.isArray(data)) {
      if (!Array.isArray(result.data)) {
        result.data = [];
      }

      result.data.push(...data);
    } else {
      result.data = data;
    }
  }

  send(query, action) {
    const id = crypto.randomUUID();

    this.write(id, query, action);

    return new Promise((resolve, reject) => {
      const listener = (tmpId) => {
        if (tmpId !== id) {
          return;
        }

        const result = this.results.get(id);

        if (result.error !== null) {
          reject(result.error);
        } else {
          resolve(result.data);
        }

        this.results.delete(id);

        this.emitter.off("result", listener);
      };

      const result = { data: null, error: null };

      this.results.set(id, result);

      this.emitter.on("result", listener);
    });
  }

  write(id, query, action) {
    const params = query.getParams();
    const collection = query.getCollection();

    const collectionName = collection.getName();

    const username = this.client.getUsername();
    const password = this.client.getPassword();

    const databaseName = this.client.getDatabaseName();

    const object = {
      id,
      auth: { username, password },
      query: {
        database: databaseName,
        collection: collectionName,
        action,
        params,
      },
    };

    const string = JSON.stringify(object, (key, value) => {
      if (value instanceof RegExp) {
        return value.toString();
      }

      return value;
    });

    this.socket.write(`${string}\x00`);
  }

  destroy() {
    return this.socket.destroy();
  }
}

module.exports = Socket;
