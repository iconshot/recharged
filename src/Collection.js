const path = require("path");

const Query = require("./Query");

class Collection {
  constructor(name, schema, options, database) {
    this.parse(schema);

    this.name = name;
    this.schema = schema;
    this.options = options;

    this.database = database;

    const {
      timestamps = false,
      maxDocumentSize = 1048576, // 1 mb
    } = options;

    if (timestamps) {
      this.schema.createdAt = { type: Date, required: true };
      this.schema.updatedAt = { type: Date, required: true };
    }

    this.maxFileSize = 524288000; // 500 mb

    this.maxDocumentSize = maxDocumentSize;

    const maxDocumentSizeWithSpace = maxDocumentSize + 1000; // make room for [] and commas

    if (maxDocumentSizeWithSpace > this.maxFileSize) {
      throw new Error(
        `Max file size is ${this.maxFileSize} bytes, try a lower max document size.`
      );
    }

    this.maxDocuments = Math.floor(this.maxFileSize / maxDocumentSizeWithSpace);

    this.maxDocuments = 2;
  }

  getName() {
    return this.name;
  }

  getSchema() {
    return this.schema;
  }

  getOptions() {
    return this.options;
  }

  getDatabase() {
    return this.database;
  }

  getMaxDocumentSize() {
    return this.maxDocumentSize;
  }

  getMaxDocuments() {
    return this.maxDocuments;
  }

  getDir() {
    const dir = this.database.getDir();

    return path.resolve(dir, this.name);
  }

  query() {
    return new Query(this);
  }

  parse(schema, objectKey = null) {
    for (const key in schema) {
      const { type = null } = schema[key];

      let propertyKey = objectKey !== null ? `${objectKey}.${key}` : key;

      if (type === null) {
        throw new Error(`Property "${propertyKey}" has an invalid type.`);
      }

      if (!Array.isArray(type) && typeof type === "object") {
        this.parse(type, propertyKey);
      }

      if (Array.isArray(type)) {
        const { type: tmpType = null } = type[0];

        if (tmpType === null) {
          throw new Error(
            `Property "${propertyKey}" has an invalid type for its items.`
          );
        }

        if (!Array.isArray(tmpType) && typeof tmpType === "object") {
          this.parse(tmpType, `${propertyKey}[]`);
        }
      }
    }
  }
}

module.exports = Collection;
