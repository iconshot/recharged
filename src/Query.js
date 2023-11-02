const File = require("./File");
const Action = require("./Action");

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

  findByIds(ids) {
    this.find((document) => ids.includes(document._id.toString()));

    return this.limit(ids.length);
  }

  findById(id) {
    this.find((document) => document._id.toString() === id);

    return this.limit(1);
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

  queue(closure) {
    return new Promise((resolve, reject) => {
      const action = new Action(closure, resolve, reject);

      this.collection.queue(action);
    });
  }

  async create(items) {
    return await this.queue(async () => {
      const cache = this.collection.getCache();
      const maxDocuments = this.collection.getMaxDocuments();

      const { timestamps = false } = this.collection.getOptions();

      const documents = [];

      for (const item of items) {
        let newDocuments = null;
        let newIndex = null;

        // if not array, create document

        if (timestamps) {
          const date = new Date();

          if (!("createdAt" in item)) {
            item.createdAt = date;
          }

          if (!("updatedAt" in item)) {
            item.updatedAt = date;
          }
        }

        const keys = [...cache.keys()];

        if (keys.length === 0) {
          // create first file

          const file = new File(this.collection, 0);

          const newItems = [item];

          newDocuments = await file.write(newItems);

          newIndex = 0;
        }

        if (newIndex === null) {
          let i = keys.length;

          while (true) {
            i--;

            if (i < 0) {
              break;
            }

            const file = new File(this.collection, i);

            const tmpDocuments = cache.get(i);

            if (tmpDocuments.length === maxDocuments) {
              continue; // check the file before
            }

            // overwrite file

            const newItems = [...tmpDocuments, item];

            newDocuments = await file.write(newItems);

            newIndex = newDocuments.length - 1;

            break;
          }
        }

        if (newIndex === null) {
          // create new file

          const file = new File(this.collection, keys.length);

          const newItems = [item];

          newDocuments = await file.write(newItems);

          newIndex = 0;
        }

        const document = newDocuments[newIndex];

        documents.push(document);
      }

      return documents;
    });
  }

  async createOne(item) {
    const documents = await this.create([item]);

    return documents[0];
  }

  /*

  if sorter is not null, get all matches and sort them
  if sorter is null, get documents from files in order

  */

  async fetch() {
    return await this.queue(async () => {
      const cache = this.collection.getCache();

      if (this.length === 0) {
        return [];
      }

      const keys = [...cache.keys()];

      if (keys.length === 0) {
        return [];
      }

      if (this.sorter !== null) {
        const documents = [];

        let i = keys.length;

        while (true) {
          i--;

          if (i < 0) {
            break;
          }

          const tmpDocuments = cache.get(i);

          for (const document of tmpDocuments) {
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

        let i = keys.length;

        while (true) {
          i--;

          if (i < 0) {
            break;
          }

          const tmpDocuments = cache.get(i);

          for (let j = tmpDocuments.length - 1; j >= 0; j--) {
            const document = tmpDocuments[j];

            if (this.finder !== null && !this.finder(document)) {
              continue;
            }

            skip++;

            if (skip <= this.offset) {
              continue;
            }

            documents.push(document);

            if (documents.length === this.length) {
              break;
            }
          }

          if (documents.length === this.length) {
            break;
          }
        }

        return documents;
      }
    });
  }

  async fetchOne() {
    const documents = await this.limit(1).fetch();

    return documents.length !== 0 ? documents[0] : null;
  }

  // object returned by updater will be merged with current document

  async update(updater = {}) {
    return await this.queue(async () => {
      const cache = this.collection.getCache();

      const { timestamps = false } = this.collection.getOptions();

      if (this.length === 0) {
        return [];
      }

      const keys = [...cache.keys()];

      if (keys.length === 0) {
        return [];
      }

      if (this.sorter !== null) {
        const files = [];
        const contents = [];

        const items = [];

        let i = keys.length;

        while (true) {
          i--;

          if (i < 0) {
            break;
          }

          const file = new File(this.collection, i);

          const content = [...cache.get(i)];

          files.push(file);
          contents.push(content);

          const index = files.length - 1;

          for (const document of content) {
            if (this.finder !== null && !this.finder(document)) {
              continue;
            }

            items.push({ document, index });
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
              finalItems.findIndex(
                (tmpItem) => tmpItem.index === item.index
              ) === i
          )
          .map((item) => item.index);

        const documents = [];

        for (const index of indexes) {
          const file = files[index];
          const content = contents[index];

          const tmpDocuments = finalItems
            .filter((item) => item.index === index)
            .map((item) => item.document);

          const updatedIndexes = [];

          for (const document of tmpDocuments) {
            const i = content.indexOf(document);

            const data =
              typeof updater === "function" ? updater(document) : updater;

            const item = { ...document, ...data }; // merge

            if (timestamps && !("updatedAt" in data)) {
              item.updatedAt = new Date();
            }

            content[i] = item; // replace

            updatedIndexes.push(i);
          }

          const newDocuments = await file.write(content);

          for (const updatedIndex of updatedIndexes) {
            const newDocument = newDocuments[updatedIndex];

            documents.push(newDocument);
          }
        }

        return documents;
      } else {
        const documents = [];

        let skip = 0;
        let length = 0;

        let i = keys.length;

        while (true) {
          i--;

          if (i < 0) {
            break;
          }

          const file = new File(this.collection, i);

          const content = [...cache.get(i)];

          const updatedIndexes = [];

          for (let j = content.length - 1; j >= 0; j--) {
            const document = content[j];

            if (this.finder !== null && !this.finder(document)) {
              continue;
            }

            skip++;

            if (skip <= this.offset) {
              continue;
            }

            const data =
              typeof updater === "function" ? updater(document) : updater;

            const item = { ...document, ...data }; // merge

            if (timestamps && !("updatedAt" in data)) {
              item.updatedAt = new Date();
            }

            content[j] = item; // replace

            updatedIndexes.push(j);

            length++;

            if (length === this.length) {
              break;
            }
          }

          if (updatedIndexes.length > 0) {
            const newDocuments = await file.write(content);

            for (const updatedIndex of updatedIndexes) {
              const newDocument = newDocuments[updatedIndex];

              documents.push(newDocument);
            }
          }

          if (length === this.length) {
            break;
          }
        }

        return documents;
      }
    });
  }

  async updateOne(updater = {}) {
    const documents = await this.limit(1).update(updater);

    return documents.length !== 0 ? documents[0] : null;
  }

  // consistent with update

  async delete() {
    return await this.queue(async () => {
      const cache = this.collection.getCache();

      if (this.length === 0) {
        return [];
      }

      const keys = [...cache.keys()];

      if (keys.length === 0) {
        return [];
      }

      if (this.sorter !== null) {
        const files = [];
        const contents = [];

        const items = [];

        let i = keys.length;

        while (true) {
          i--;

          if (i < 0) {
            break;
          }

          const file = new File(this.collection, i);

          const content = [...cache.get(i)];

          files.push(file);
          contents.push(content);

          const index = files.length - 1;

          for (const document of content) {
            if (this.finder !== null && !this.finder(document)) {
              continue;
            }

            items.push({ document, index });
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
              finalItems.findIndex(
                (tmpItem) => tmpItem.index === item.index
              ) === i
          )
          .map((item) => item.index);

        for (const index of indexes) {
          const file = files[index];
          const content = contents[index];

          let newContent = [...content];

          const tmpDocuments = finalItems
            .filter((item) => item.index === index)
            .map((item) => item.document);

          for (const document of tmpDocuments) {
            // filter out

            newContent = newContent.filter(
              (tmpDocument) => tmpDocument !== document
            );
          }

          await file.write(newContent);
        }

        return finalItems.map((item) => item.document);
      } else {
        const documents = [];

        let skip = 0;
        let length = 0;

        let i = keys.length;

        while (true) {
          i--;

          if (i < 0) {
            break;
          }

          const file = new File(this.collection, i);

          const content = [...cache.get(i)];

          let newContent = [...content];

          const deletedIndexes = [];

          for (let j = content.length - 1; j >= 0; j--) {
            const document = content[j];

            if (this.finder !== null && !this.finder(document)) {
              continue;
            }

            skip++;

            if (skip <= this.offset) {
              continue;
            }

            // filter out

            newContent = newContent.filter(
              (tmpDocument) => tmpDocument !== document
            );

            length++;

            deletedIndexes.push(j);

            if (length === this.length) {
              break;
            }
          }

          if (deletedIndexes.length > 0) {
            await file.write(newContent);

            for (const deletedIndex of deletedIndexes) {
              const document = content[deletedIndex];

              documents.push(document);
            }
          }

          if (length === this.length) {
            break;
          }
        }

        return documents;
      }
    });
  }

  async deleteOne() {
    const documents = await this.limit(1).delete();

    return documents.length !== 0 ? documents[0] : null;
  }

  // utilities

  async count() {
    const documents = await this.fetch();

    return documents.length;
  }

  async exists() {
    const count = await this.limit(1).count();

    return count === 1;
  }
}

module.exports = Query;
