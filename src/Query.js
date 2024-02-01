const ObjectId = require("./ObjectId");

class Query {
  constructor(collection) {
    this.params = {
      create: null,
      find: null,
      sort: null,
      limit: null,
      skip: 0,
      update: null,
    };

    this.collection = collection;
  }

  getParams() {
    return this.params;
  }

  getCollection() {
    return this.collection;
  }

  find(find) {
    this.params.find = find;

    return this;
  }

  findByIds(ids) {
    return this.find({ id: { $in: ids } });
  }

  findById(id) {
    return this.find({ id: { $eq: id } });
  }

  sort(sort) {
    this.params.sort = sort;

    return this;
  }

  limit(limit) {
    this.params.limit = limit;

    return this;
  }

  skip(skip) {
    this.params.skip = skip;

    return this;
  }

  async send(action) {
    const client = this.collection.getClient();

    const socket = client.getSocket();

    return await socket.send(this, action);
  }

  async create(documents) {
    this.params.create = this.encode(this.timeifyCreate(documents));

    {
      const documents = await this.send("create");

      return this.decode(documents);
    }
  }

  async createOne(document) {
    const documents = await this.create([document]);

    return this.first(documents);
  }

  async read() {
    const documents = await this.send("read");

    return this.decode(documents);
  }

  async readOne() {
    const documents = await this.limit(1).read();

    return this.first(documents);
  }

  async update(update) {
    this.params.update = this.timeifyUpdate(update);

    return await this.send("update");
  }

  async updateOne(update) {
    return await this.limit(1).update(update);
  }

  async delete() {
    return await this.send("delete");
  }

  async deleteOne() {
    return await this.limit(1).delete();
  }

  async count() {
    return await this.send("count");
  }

  async exists() {
    const count = await this.count();

    return count !== 0;
  }

  first(documents) {
    if (documents.length === 0) {
      return null;
    }

    return documents[0];
  }

  timeifyCreate(documents) {
    const { timestamps } = this.collection.getOptions();

    if (!timestamps) {
      return documents;
    }

    return documents.map((document) => {
      const date = "createdAt" in document ? document.createdAt : new Date();

      const createdAt = date;

      const updatedAt = "updatedAt" in document ? document.updatedAt : date;

      return { ...document, createdAt, updatedAt };
    });
  }

  timeifyUpdate(update) {
    const { timestamps } = this.collection.getOptions();

    if (!timestamps) {
      return update;
    }

    if ("updatedAt" in update) {
      return update;
    }

    const updatedAt = { $timestamp: null };

    return { ...update, updatedAt };
  }

  encode(documents) {
    const schema = this.collection.getSchema();

    return documents.map((document, i) =>
      this.encodeObject(document, schema, `documents[${i}]`)
    );
  }

  encodeObject(object, schema, propertyPath) {
    if (
      !(object !== null && typeof object === "object" && !Array.isArray(object))
    ) {
      throw new Error(
        `Encoding value for "${propertyPath}" must be an object.`
      );
    }

    const tmpObject = {};

    for (const key in schema) {
      const format = schema[key];
      const value = object[key];

      const tmpPropertyPath = `${propertyPath}.${key}`;

      tmpObject[key] = this.encodeFormat(value, format, tmpPropertyPath);
    }

    return tmpObject;
  }

  encodeFormat(value, format, propertyPath) {
    const { type, required, default: tmpDefault, enum: tmpEnum } = format;

    if (value === undefined) {
      value = typeof tmpDefault === "function" ? tmpDefault() : tmpDefault;
    }

    if (required) {
      if (value === null) {
        throw new Error(`Encoding value for "${propertyPath}" is required.`);
      }
    }

    if (Array.isArray(tmpEnum)) {
      if (!tmpEnum.includes(value)) {
        throw new Error(
          `Encoding value for "${propertyPath}" is not included in the "enum" array.`
        );
      }
    }

    if (value !== null) {
      if (type === Boolean) {
        if (typeof value !== "boolean") {
          throw new Error(
            `Encoding value for "${propertyPath}" must be a boolean.`
          );
        }
      }

      if (type === String) {
        if (typeof value !== "string") {
          throw new Error(
            `Encoding value for "${propertyPath}" must be a string.`
          );
        }
      }

      if (type === Number) {
        if (typeof value !== "number") {
          throw new Error(
            `Encoding value for "${propertyPath}" must be a number.`
          );
        }
      }

      if (type === ObjectId) {
        if (!(value instanceof ObjectId)) {
          throw new Error(
            `Encoding value for "${propertyPath}" must be ObjectId.`
          );
        }
      }

      if (type === Date) {
        if (!(value instanceof Date)) {
          throw new Error(`Encoding value for "${propertyPath}" must be Date.`);
        }
      }

      if (Array.isArray(type)) {
        if (!Array.isArray(value)) {
          throw new Error(
            `Encoding value for "${propertyPath}" must be an array.`
          );
        }

        return value.map((element, i) =>
          this.encodeFormat(element, type[0], `${propertyPath}[${i}]`)
        );
      }

      if (typeof type === "object") {
        return this.encodeObject(value, type, propertyPath);
      }
    }

    return value;
  }

  decode(documents) {
    const schema = this.collection.getSchema();

    return documents.map((document, i) =>
      this.decodeObject(document, schema, `documents[${i}]`)
    );
  }

  decodeObject(object, schema, propertyPath) {
    if (
      !(object !== null && typeof object === "object" && !Array.isArray(object))
    ) {
      throw new Error(
        `Decoding value for "${propertyPath}" must be an object.`
      );
    }

    const tmpObject = {};

    for (const key in schema) {
      const format = schema[key];
      const value = object[key];

      const tmpPropertyPath = `${propertyPath}.${key}`;

      tmpObject[key] = this.decodeFormat(value, format, tmpPropertyPath);
    }

    return tmpObject;
  }

  decodeFormat(value, format, propertyPath) {
    const { type, required, default: tmpDefault, enum: tmpEnum } = format;

    if (value === undefined) {
      value = typeof tmpDefault === "function" ? tmpDefault() : tmpDefault;
    }

    if (required) {
      if (value === null) {
        throw new Error(`Decoding value for "${propertyPath}" is required.`);
      }
    }

    if (Array.isArray(tmpEnum)) {
      if (!tmpEnum.includes(value)) {
        throw new Error(
          `Decoding value for "${propertyPath}" is not included in the "enum" array.`
        );
      }
    }

    if (value !== null) {
      if (type === Boolean) {
        if (typeof value !== "boolean") {
          throw new Error(
            `Decoding value for "${propertyPath}" must be a boolean.`
          );
        }
      }

      if (type === String) {
        if (typeof value !== "string") {
          throw new Error(
            `Decoding value for "${propertyPath}" must be a string.`
          );
        }
      }

      if (type === Number) {
        if (typeof value !== "number") {
          throw new Error(
            `Decoding value for "${propertyPath}" must be a number.`
          );
        }
      }

      if (type === ObjectId) {
        try {
          return new ObjectId(value);
        } catch (error) {
          throw new Error(
            `Decoding value for "${propertyPath}" must be ObjectId.`
          );
        }
      }

      if (type === Date) {
        const date = new Date(value);

        if (date.getTime() !== value) {
          throw new Error(`Decoding value for "${propertyPath}" must be Date.`);
        }

        return date;
      }

      if (Array.isArray(type)) {
        if (!Array.isArray(value)) {
          throw new Error(
            `Decoding value for "${propertyPath}" must be an array.`
          );
        }

        return value.map((element, i) =>
          this.decodeFormat(element, type[0], `${propertyPath}[${i}]`)
        );
      }

      if (typeof type === "object") {
        return this.decodeObject(value, type, propertyPath);
      }
    }

    return value;
  }
}

module.exports = Query;
