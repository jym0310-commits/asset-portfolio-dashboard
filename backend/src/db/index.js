const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function ensureColumn(table, column, definition) {
  const existingColumns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existingColumns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`마이그레이션: ${table}.${column} 컬럼 추가됨`);
  }
}

function runMigrations() {
  const holdingsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='holdings'`)
    .get();
  if (holdingsExists) {
    ensureColumn('holdings', 'purchase_fx_rate', 'REAL');
  }

  const usersExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
    .get();
  if (usersExists) {
    ensureColumn('users', 'terms_agreed_at', 'TEXT');
    ensureColumn('users', 'reset_token_hash', 'TEXT');
    ensureColumn('users', 'reset_token_expires', 'TEXT');
  }
}

function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  runMigrations();
  console.log('DB 스키마 초기화 완료:', DB_PATH);
}

module.exports = { db, initSchema };