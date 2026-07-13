const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 새 컬럼이 필요한데, 이미 만들어진 테이블에는 "CREATE TABLE IF NOT EXISTS"가
// 적용되지 않아서(테이블이 있으면 통째로 건너뜀), 여기서 안전하게 컬럼만 추가해줍니다.
// 이미 컬럼이 있으면 아무 일도 안 하고, 없으면 추가합니다. 기존 데이터는 전혀 건드리지 않습니다.
function ensureColumn(table, column, definition) {
  const existingColumns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existingColumns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`마이그레이션: ${table}.${column} 컬럼 추가됨`);
  }
}

function runMigrations() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='holdings'`)
    .get();
  if (tableExists) {
    ensureColumn('holdings', 'purchase_fx_rate', 'REAL');
  }
}

function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  runMigrations();
  console.log('DB 스키마 초기화 완료:', DB_PATH);
}

module.exports = { db, initSchema };