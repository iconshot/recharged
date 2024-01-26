const Query = require("./Query");
const ObjectId = require("./ObjectId");

class Collection {
  constructor(name, schema, options, client) {
    this.name = name;
    this.options = options;

    this.schema = this.parse(schema);

    this.client = client;
  }

  getName() {
    return this.name;
  }

  getSchema() {
    return this.schema;
  }

  getClient() {
    return this.client;
  }

  query() {
    return new Query(this);
  }

  isValid(key) {
    return /^(?:(?![\$\[\].]).)*$/.test(key);
  }

  parse(schema, id = true, propertyPath = null) {
    if (
      !(schema !== null && typeof schema === "object" && !Array.isArray(schema))
    ) {
      throw new Error('"schema" must be an object.');
    }

    const tmpSchema = {};

    if (id) {
      tmpSchema.id = this.parseFormat({ type: ObjectId });
    }

    for (const key in schema) {
      if (key === "id") {
        continue;
      }

      if (!this.isValid(key)) {
        throw new Error(`Property name "${key}" is not valid.`);
      }

      const format = schema[key];

      const tmpPropertyPath =
        propertyPath !== null ? `${propertyPath}.${key}` : key;

      tmpSchema[key] = this.parseFormat(format, tmpPropertyPath);
    }

    return tmpSchema;
  }

  parseFormat(format, propertyPath) {
    if (
      !(format !== null && typeof format === "object" && !Array.isArray(format))
    ) {
      throw new Error(`"format" for "${propertyPath}" must be an object.`);
    }

    const {
      type = null,
      id = true,
      required = false,
      default: tmpDefault = null,
      enum: tmpEnum = null,
    } = format;

    if (
      !(
        type === Boolean ||
        type === String ||
        type === Number ||
        type === ObjectId ||
        type === Date ||
        Array.isArray(type) ||
        (type !== null && typeof type === "object")
      )
    ) {
      throw new Error(
        `Format property "type" for "${propertyPath}" must be Boolean, String, Number, ObjectId, Date, Array or an schema object.`
      );
    }

    if (!(typeof id === "boolean")) {
      throw new Error(
        `Format property "id" for "${propertyPath}" must be boolean.`
      );
    }

    if (!(typeof required === "boolean")) {
      throw new Error(
        `Format property "required" for "${propertyPath}" must be boolean.`
      );
    }

    if (!(tmpEnum === null || Array.isArray(tmpEnum))) {
      throw new Error(
        `Format property "enum" for "${propertyPath}" must be null or an array.`
      );
    }

    const tmpFormat = {
      type,
      id,
      required,
      default: tmpDefault,
      enum: tmpEnum,
    };

    if (Array.isArray(type)) {
      const tmpPropertyPath = `${propertyPath}[]`;

      const innerFormat = this.parseFormat(type[0], tmpPropertyPath);

      tmpFormat.type = [innerFormat];
    }

    if (type !== null && typeof type === "object" && !Array.isArray(type)) {
      tmpFormat.type = this.parse(type, id, propertyPath);
    }

    return tmpFormat;
  }
}

module.exports = Collection;
