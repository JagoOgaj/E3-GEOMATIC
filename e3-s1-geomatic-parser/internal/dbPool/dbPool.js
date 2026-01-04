import duckdb from "duckdb";
import fs from "node:fs";

export class DbPool {
  static instance = null;

  constructor(conf) {
    if (DbPool.instance) {
      return DbPool.instance;
    }

    this.conf = conf;
    this.dbPath = conf.getEnvValue("DB_PATH");
    this.poolSize = conf.getEnvValue("DB_POOL_SIZE");
    this.db = null;
    this.connections = [];
    this.index = 0;

    DbPool.instance = this;
  }

  async init() {
    if (!fs.existsSync(this.dbPath)) {
      console.log(`Database not found, creating one at: ${this.dbPath}`);
    }
    this.db = new duckdb.Database(this.dbPath);

    for (let i = 0; i < this.poolSize; i++) {
      const conn = this.db.connect();

      await new Promise((resolve, reject) => {
        conn.exec(
          `
          PRAGMA threads = 8;
          PRAGMA enable_object_cache = true;
          PRAGMA memory_limit = '${this.conf.getEnvValue("DB_MEMORY_LIMIT")}';
          PRAGMA preserve_insertion_order = ${this.conf.getEnvValue("DB_PRESERVE_INSERTION_ORDER")};
          INSTALL spatial;
          LOAD spatial;
          `,
          (err) => (err ? reject(err) : resolve())
        );
      });

      this.connections.push(conn);
    }
  }

  #getConnection() {
    const conn = this.connections[this.index];
    this.index = (this.index + 1) % this.connections.length;
    return conn;
  }

  query(sql, params = []) {
    const conn = this.#getConnection();

    return new Promise((resolve, reject) => {
      conn.all(sql, ...params, (err, rows) => {
        if (err) {
          reject(new Error(`SQL Error: ${err.message}`));
        } else {
          resolve(rows);
        }
      });
    });
  }

  async close() {
    for (const conn of this.connections) {
      conn.close();
    }

    await new Promise((resolve) => this.db.close(resolve));
    DbPool.instance = null;
  }
}
