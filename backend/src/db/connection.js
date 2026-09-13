const path = require('node:path');
const fs = require('node:fs');

// Dual-engine database connection:
// Defaults to local SQLite via Node 26 built-in node:sqlite.
// If DATABASE_URL is provided, can switch to PostgreSQL pool.
let sqliteDb = null;
let pgPool = null;

function getDb() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
    if (!pgPool) {
      const { Pool } = require('pg');
      pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
    return {
      type: 'postgres',
      async query(sql, params = []) {
        // Convert ? placeholders to $1, $2 for Postgres
        let idx = 1;
        const pgSql = sql.replace(/\?/g, () => '$' + (idx++));
        const res = await pgPool.query(pgSql, params);
        return res.rows;
      },
      async run(sql, params = []) {
        // INSERT/UPDATE/DELETE — convert ? to $N, ignore return
        let idx = 1;
        const pgSql = sql.replace(/\?/g, () => '$' + (idx++));
        return await pgPool.query(pgSql, params);
      },
      async exec(sql) {
        return await pgPool.query(sql);
      }
    };
  }

  if (!sqliteDb) {
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../../sales_garut.db');
    sqliteDb = new DatabaseSync(dbPath);
    sqliteDb.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  }

  return {
    type: 'sqlite',
    query(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      return stmt.all(...params);
    },
    run(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      return stmt.run(...params);
    },
    exec(sql) {
      return sqliteDb.exec(sql);
    },
    raw: sqliteDb
  };
}

function initSchema() {
  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  
  if (db.type === 'sqlite') {
    db.exec(schemaSql);
    try {
      const cols = db.query('PRAGMA table_info(org_salesman)').map(c => c.name);
      if (!cols.includes('salesman_type')) db.exec("ALTER TABLE org_salesman ADD COLUMN salesman_type VARCHAR(50) DEFAULT 'Kanvas'");
      if (!cols.includes('target_cl')) db.exec("ALTER TABLE org_salesman ADD COLUMN target_cl INTEGER DEFAULT 375");
      if (!cols.includes('visit_cycle')) db.exec("ALTER TABLE org_salesman ADD COLUMN visit_cycle VARCHAR(50) DEFAULT '3 Minggu'");
      if (!cols.includes('has_rayon')) db.exec("ALTER TABLE org_salesman ADD COLUMN has_rayon BOOLEAN DEFAULT 1");
      if (!cols.includes('max_rayon')) db.exec("ALTER TABLE org_salesman ADD COLUMN max_rayon INTEGER DEFAULT 15");
    } catch (e) {
      // Ignore if already migrated
    }
  } else {
    // Postgres: run each statement individually (pg.query doesn't support multi-statement)
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    return (async () => {
      for (const stmt of statements) {
        try {
          await pgPool.query(stmt);
        } catch (e) {
          // Ignore "already exists" errors (idempotent re-runs)
          if (!e.message.includes('already exists')) throw e;
        }
      }
    })();
  }
  return true;
}

module.exports = {
  getDb,
  initSchema
};
