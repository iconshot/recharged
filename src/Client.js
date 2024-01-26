const Collection = require("./Collection");
const Socket = require("./Socket");

class Client {
  constructor({ host, port, username, password, database: databaseName }) {
    this.host = host;
    this.port = port;

    this.username = username;
    this.password = password;

    this.databaseName = databaseName;

    this.socket = null;
  }

  getHost() {
    return this.host;
  }

  getPort() {
    return this.port;
  }

  getUsername() {
    return this.username;
  }

  getPassword() {
    return this.password;
  }

  getDatabaseName() {
    return this.databaseName;
  }

  getSocket() {
    return this.socket;
  }

  createCollection(name, schema, options = {}) {
    return new Collection(name, schema, options, this);
  }

  async init() {
    this.socket = new Socket(this);

    await this.socket.init();
  }

  destroy() {
    this.socket.destroy();
  }
}

module.exports = Client;
