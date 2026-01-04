import duckdb from "duckdb";
import fs from "node:fs";

export class DbPool {
  static instance = null;

  constructor(dbPath, poolSize = 4) {
    if (DbPool.instance) {
      return DbPool.instance;
    }

    if (!fs.existsSync(dbPath)) {
      throw new Error(`Db not found : ${dbPath}`);
    }

    this.dbPath = dbPath;
    this.poolSize = poolSize;
    this.db = null;
    this.connections = [];
    this.index = 0;

    DbPool.instance = this;
  }

  async init() {
    this.db = new duckdb.Database(this.dbPath);

    for (let i = 0; i < this.poolSize; i++) {
      const conn = this.db.connect();

      await new Promise((resolve, reject) => {
        conn.exec(
          `
          PRAGMA threads=8;
          PRAGMA enable_object_cache=true;
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
