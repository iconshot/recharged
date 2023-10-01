const path = require("path");

const fsp = require("fs/promises");

const ObjectId = require("./ObjectId");

class File {
  constructor(collection, index) {
    this.collection = collection;
    this.index = index;
  }

  getMaxFileSize() {
    return this.maxFileSize;
  }

  getFile() {
    const dir = this.collection.getDir();

    return path.resolve(dir, `${this.index}.json`);
  }

  async exists() {
    try {
      const file = this.getFile();

      await fsp.access(file);

      return true;
    } catch (error) {
      return false;
    }
  }

  async read() {
    const file = this.getFile();

    const json = await fsp.readFile(file, { encoding: "utf-8" });

    const content = this.decode(JSON.parse(json));

    return content;
  }

  async write(content) {
    const file = this.getFile();

    const dir = path.dirname(file);

    await fsp.mkdir(dir, { recursive: true });

    const json = JSON.stringify(this.encode(content));

    await fsp.writeFile(file, json);
  }

  encode(data) {
    const schema = this.collection.getSchema();

    const maxDocumentSize = this.collection.getMaxDocumentSize();

    const encoder = new TextEncoder();

    return data.map((value) => {
      const tmpValue = this.encodeData(value, schema, null, true);

      // check document size

      const encoded = encoder.encode(JSON.stringify(tmpValue));

      if (encoded.length > maxDocumentSize) {
        throw new Error(`Max document size is ${maxDocumentSize} bytes.`);
      }

      return tmpValue;
    });
  }

  encodeData(data, schema, objectKey, setId) {
    const document = {};

    if (setId) {
      document._id = "_id" in data ? data._id : new ObjectId();
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

      let { [key]: value = defaultValue } = data;

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
          value = this.encodeData(value, type, propertyKey, setValueId);
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
                tmpValue = this.encodeData(
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

  decode(data) {
    const schema = this.collection.getSchema();

    return data.map((value) => this.decodeData(value, schema));
  }

  decodeData(data, schema) {
    const document = {};

    for (const key in data) {
      let value = data[key];

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
            value = this.decodeData(value, type);
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
                  tmpValue = this.decodeData(tmpValue, tmpType);
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
