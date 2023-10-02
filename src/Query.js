const fsp = require("fs/promises");

const File = require("./File");

class Query {
  constructor(collection) {
    this.collection = collection;

    this.finder = null;
    this.sorter = null;
    this.length = null;
    this.offset = 0;
  }

  find(finder) {
    this.finder = finder;

    return this;
  }

  findById(id) {
    this.find((document) => document._id.toString() === id);

    return this;
  }

  sort(sorter) {
    this.sorter = sorter;

    return this;
  }

  limit(length) {
    this.length = length;

    return this;
  }

  skip(offset) {
    this.offset = offset;

    return this;
  }

  async create(documents) {
    const maxDocuments = this.collection.getMaxDocuments();
    const dir = this.collection.getDir();

    const { timestamps = false } = this.collection.getOptions();

    if (!Array.isArray(documents)) {
      // if not array, create document

      const document = documents;

      if (timestamps) {
        const date = new Date();

        if (!("createdAt" in document)) {
          document.createdAt = date;
        }

        if (!("updatedAt" in document)) {
          document.updatedAt = date;
        }
      }

      try {
        await fsp.access(dir);
      } catch (error) {
        // create first file

        const file = new File(this.collection, 0);

        const content = [document];

        await file.write(content);

        return;
      }

      const tmpFiles = await fsp.readdir(dir);

      let i = tmpFiles.length;

      while (true) {
        i--;

        const file = new File(this.collection, i);

        if (!(await file.exists())) {
          break; // -1 reached
        }

        const content = await file.read();

        if (content.length === maxDocuments) {
          continue; // check the file before
        }

        // overwrite file

        const newContent = [...content, document];

        await file.write(newContent);

        return;
      }

      // create new file

      const file = new File(this.collection, tmpFiles.length);

      const content = [document];

      await file.write(content);

      return;
    }

    // if array, create loop

    for (const document of documents) {
      await this.create(document);
    }
  }

  /*

  if sorter is not null, get all matches and sort them
  if sorter is null, get documents from files in order

  */

  async fetch() {
    const dir = this.collection.getDir();

    if (this.length === 0) {
      return [];
    }

    try {
      await fsp.access(dir);
    } catch (error) {
      return [];
    }

    if (this.sorter !== null) {
      const documents = [];

      let i = -1;

      while (true) {
        i++;

        const file = new File(this.collection, i);

        if (!(await file.exists())) {
          break;
        }

        const content = await file.read();

        for (const document of content) {
          if (this.finder !== null && !this.finder(document)) {
            continue;
          }

          documents.push(document);
        }
      }

      documents.sort(this.sorter);

      return this.length !== null
        ? documents.slice(this.offset, this.offset + this.length)
        : documents.slice(this.offset);
    } else {
      const documents = [];

      let skip = 0;

      let i = -1;

      while (true) {
        i++;

        const file = new File(this.collection, i);

        if (!(await file.exists())) {
          break;
        }

        const content = await file.read();

        for (const document of content) {
          if (this.finder !== null && !this.finder(document)) {
            continue;
          }

          skip++;

          if (this.offset >= skip) {
            continue;
          }

          documents.push(document);

          if (this.length === documents.length) {
            break;
          }
        }

        if (this.length === documents.length) {
          break;
        }
      }

      return documents;
    }
  }

  async fetchOne() {
    const documents = await this.limit(1).fetch();

    return documents.length !== 0 ? documents[0] : null;
  }

  // object returned by updater will be merged with current document

  async update(updater = {}) {
    const dir = this.collection.getDir();

    const { timestamps = false } = this.collection.getOptions();

    if (this.length === 0) {
      return 0;
    }

    try {
      await fsp.access(dir);
    } catch (error) {
      return 0;
    }

    if (this.sorter !== null) {
      const files = [];
      const contents = [];

      const items = [];

      let i = -1;

      while (true) {
        i++;

        const file = new File(this.collection, i);

        if (!(await file.exists())) {
          break;
        }

        files.push(file);

        const content = await file.read();

        contents.push(content);

        for (const document of content) {
          if (this.finder !== null && !this.finder(document)) {
            continue;
          }

          items.push({ document, index: i });
        }
      }

      items.sort((a, b) => this.sorter(a.document, b.document));

      const finalItems =
        this.length !== null
          ? items.slice(this.offset, this.offset + this.length)
          : items.slice(this.offset);

      // unique file indexes

      const indexes = finalItems
        .filter(
          (item, i) =>
            finalItems.findIndex((tmpItem) => tmpItem.index === item.index) ===
            i
        )
        .map((item) => item.index);

      for (const index of indexes) {
        const file = files[index];

        const content = contents[index];

        const documents = finalItems
          .filter((item) => item.index === index)
          .map((item) => item.document);

        for (const document of documents) {
          const i = content.indexOf(document);

          const data =
            typeof updater === "function" ? await updater(document) : updater;

          const newDocument = { ...document, ...data };

          if (timestamps && !("updatedAt" in data)) {
            newDocument.updatedAt = new Date();
          }

          content[i] = newDocument; // replace document
        }

        await file.write(content);
      }

      return finalItems.length;
    } else {
      let skip = 0;
      let length = 0;

      let i = -1;

      while (true) {
        i++;

        const file = new File(this.collection, i);

        if (!(await file.exists())) {
          break;
        }

        const content = await file.read();

        let updated = false;

        let j = -1;

        for (const document of content) {
          j++;

          if (this.finder !== null && !this.finder(document)) {
            continue;
          }

          skip++;

          if (this.offset >= skip) {
            continue;
          }

          const data =
            typeof updater === "function" ? await updater(document) : updater;

          const newDocument = { ...document, ...data };

          if (timestamps && !("updatedAt" in data)) {
            newDocument.updatedAt = new Date();
          }

          content[j] = newDocument;

          updated = true;

          length++;

          if (this.length === length) {
            break;
          }
        }

        if (updated) {
          await file.write(content);
        }

        if (this.length === length) {
          break;
        }
      }

      return length;
    }
  }

  async updateOne(updater = {}) {
    return await this.limit(1).update(updater);
  }

  // consistent with update

  async delete() {
    const dir = this.collection.getDir();

    if (this.length === 0) {
      return 0;
    }

    try {
      await fsp.access(dir);
    } catch (error) {
      return 0;
    }

    if (this.sorter !== null) {
      const files = [];
      const contents = [];

      const items = [];

      let i = -1;

      while (true) {
        i++;

        const file = new File(this.collection, i);

        if (!(await file.exists())) {
          break;
        }

        files.push(file);

        const content = await file.read();

        contents.push(content);

        for (const document of content) {
          if (this.finder !== null && !this.finder(document)) {
            continue;
          }

          items.push({ document, index: i });
        }
      }

      items.sort((a, b) => this.sorter(a.document, b.document));

      const finalItems =
        this.length !== null
          ? items.slice(this.offset, this.offset + this.length)
          : items.slice(this.offset);

      // unique file indexes

      const indexes = finalItems
        .filter(
          (item, i) =>
            finalItems.findIndex((tmpItem) => tmpItem.index === item.index) ===
            i
        )
        .map((item) => item.index);

      for (const index of indexes) {
        const file = files[index];

        let newContent = [...contents[index]];

        const documents = finalItems
          .filter((item) => item.index === index)
          .map((item) => item.document);

        for (const document of documents) {
          newContent = newContent.filter(
            (tmpDocument) => tmpDocument !== document
          );
        }

        await file.write(newContent);
      }

      return finalItems.length;
    } else {
      let skip = 0;
      let length = 0;

      let i = -1;

      while (true) {
        i++;

        const file = new File(this.collection, i);

        if (!(await file.exists())) {
          break;
        }

        const content = await file.read();

        let newContent = [...content];

        for (const document of content) {
          if (this.finder !== null && !this.finder(document)) {
            continue;
          }

          skip++;

          if (this.offset >= skip) {
            continue;
          }

          newContent = newContent.filter(
            (tmpDocument) => tmpDocument !== document
          );

          length++;

          if (this.length === length) {
            break;
          }
        }

        if (newContent.length !== content.length) {
          await file.write(newContent);
        }

        if (this.length === length) {
          break;
        }
      }

      return length;
    }
  }

  async deleteOne() {
    return await this.limit(1).delete();
  }

  // utilities

  async count() {
    const documents = await this.fetch();

    return documents.length;
  }

  async exists() {
    const count = await this.count();

    return count !== 0;
  }
}

module.exports = Query;
