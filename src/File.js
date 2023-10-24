const path = require("path");

const fsp = require("fs/promises");

const ObjectId = require("./ObjectId");

class File {
  constructor(collection, index) {
    this.collection = collection;
    this.index = index;
  }

  getFile() {
    const dir = this.collection.getDir();

    return path.resolve(dir, `${this.index}.json`);
  }

  async read() {
    const file = this.getFile();

    const json = await fsp.readFile(file, { encoding: "utf-8" });

    if (json.length === 0) {
      return await this.read();
    }

    const items = JSON.parse(json);

    const documents = this.decode(items);

    return documents;
  }

  async write(items) {
    const file = this.getFile();

    const dir = path.dirname(file);

    await fsp.mkdir(dir, { recursive: true });

    const documents = this.encode(items);

    const json = JSON.stringify(documents);

    await fsp.writeFile(file, json);

    return documents;
  }

  encode(items) {
    const schema = this.collection.getSchema();

    const maxDocumentSize = this.collection.getMaxDocumentSize();

    const encoder = new TextEncoder();

    return items.map((item) => {
      const document = this.encodeItem(item, schema, null, true);

      // check document size

      const json = JSON.stringify(document);

      const encoded = encoder.encode(json);

      if (encoded.length > maxDocumentSize) {
        throw new Error(`Max document size is ${maxDocumentSize} bytes.`);
      }

      return document;
    });
  }

  encodeItem(item, schema, objectKey, setId) {
    const document = {};

    if (setId) {
      document._id = "_id" in item ? item._id : new ObjectId();
    }

    for (const key in schema) {
      let propertyKey = objectKey !== null ? `${objectKey}.${key}` : key;

      // example: {type: String, required: true}

      const {
        type,
        _id: setValueId = true,
        required = false,
        default: defaultValue = null,
        enum: valueEnum = null,
      } = schema[key];

      let { [key]: value = defaultValue } = item;

      if (valueEnum !== null && !valueEnum.includes(value)) {
        throw new Error(
          `Property "${propertyKey}" doesn't have an allowed value.`
        );
      }

      if (value === null && required) {
        throw new Error(`Property "${propertyKey}" is required.`);
      }

      if (value !== null) {
        if (type === String && typeof value !== "string") {
          throw new Error(
            `Property "${propertyKey}" is expected to be a string.`
          );
        }

        if (type === Boolean && typeof value !== "boolean") {
          throw new Error(
            `Property "${propertyKey}" is expected to be a boolean.`
          );
        }

        if (type === Number && typeof value !== "number") {
          throw new Error(
            `Property "${propertyKey}" is expected to be a number.`
          );
        }

        if (type === ObjectId && !(value instanceof ObjectId)) {
          throw new Error(
            `Property "${propertyKey}" is expected to be an instance of ObjectId.`
          );
        }

        if (type === Date && !(value instanceof Date)) {
          throw new Error(
            `Property "${propertyKey}" is expected to be an instance of Date.`
          );
        }

        if (
          !Array.isArray(type) &&
          typeof type === "object" &&
          (Array.isArray(value) || typeof value !== "object")
        ) {
          throw new Error(
            `Property "${propertyKey}" is expected to be an object.`
          );
        }

        if (Array.isArray(type) && !Array.isArray(value)) {
          throw new Error(
            `Property "${propertyKey}" is expected to be an array.`
          );
        }

        if (!Array.isArray(type) && typeof type === "object") {
          value = this.encodeItem(value, type, propertyKey, setValueId);
        }

        if (Array.isArray(type)) {
          value = value.map((tmpValue = null, i) => {
            // example: {type: [{type: String, required: true}], required: true}

            const {
              type: tmpType,
              _id: tmpSetValueId = true,
              required: tmpRequired = false,
              enum: tmpValueEnum = null,
            } = type[0];

            if (tmpValueEnum !== null && !tmpValueEnum.includes(tmpValue)) {
              throw new Error(
                `Property "${propertyKey}" doesn't have an allowed value for one or more of its items.`
              );
            }

            if (tmpValue === null && tmpRequired) {
              throw new Error(
                `Property "${propertyKey}" is expected to be an array of required items.`
              );
            }

            if (tmpValue !== null) {
              if (tmpType === String && typeof tmpValue !== "string") {
                throw new Error(
                  `Property "${propertyKey}" is expected to be an array of strings.`
                );
              }

              if (tmpType === Boolean && typeof tmpValue !== "boolean") {
                throw new Error(
                  `Property "${propertyKey}" is expected to be an array of booleans.`
                );
              }

              if (tmpType === Number && typeof tmpValue !== "number") {
                throw new Error(
                  `Property "${propertyKey}" is expected to be an array of numbers.`
                );
              }

              if (tmpType === ObjectId && !(tmpValue instanceof ObjectId)) {
                throw new Error(
                  `Property "${propertyKey}" is expected to be an array of ObjectId instances.`
                );
              }

              if (tmpType === Date && !(tmpValue instanceof Date)) {
                throw new Error(
                  `Property "${propertyKey}" is expected to be an array of Date instances.`
                );
              }

              if (typeof tmpType === "object" && typeof tmpValue !== "object") {
                throw new Error(
                  `Property "${propertyKey}" is expected to be an array of objects.`
                );
              }

              if (typeof tmpType === "object") {
                tmpValue = this.encodeItem(
                  tmpValue,
                  tmpType,
                  `${propertyKey}[${i}]`,
                  tmpSetValueId
                );
              }
            }

            return tmpValue;
          });
        }
      }

      document[key] = value;
    }

    return document;
  }

  decode(items) {
    const schema = this.collection.getSchema();

    return items.map((item) => this.decodeItem(item, schema));
  }

  decodeItem(item, schema) {
    const document = {};

    for (const key in item) {
      let value = item[key];

      if (key === "_id") {
        value = new ObjectId(value);
      }

      if (key in schema) {
        const { type } = schema[key];

        if (value !== null) {
          if (type === ObjectId) {
            value = new ObjectId(value);
          }

          if (type === Date) {
            value = new Date(value);
          }

          if (!Array.isArray(type) && typeof type === "object") {
            value = this.decodeItem(value, type);
          }

          if (Array.isArray(type)) {
            value = value.map((tmpValue) => {
              const { type: tmpType } = type[0];

              if (tmpValue !== null) {
                if (tmpType === ObjectId) {
                  tmpValue = new ObjectId(tmpValue);
                }

                if (tmpType === Date) {
                  tmpValue = new Date(tmpValue);
                }

                if (typeof tmpType === "object") {
                  tmpValue = this.decodeItem(tmpValue, tmpType);
                }
              }

              return tmpValue;
            });
          }
        }
      }

      document[key] = value;
    }

    return document;
  }
}

module.exports = File;
