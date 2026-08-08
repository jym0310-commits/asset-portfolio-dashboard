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

// 예전 거래내역(holding_id가 없는 행)을 종목코드+구분+사용자 기준으로
// 보유 종목과 1:1로 매칭되는 경우에만 연결해줍니다 (거래내역 수정/삭제 기능이 동작하려면 필요).
function backfillTransactionHoldingIds() {
  const rows = db
    .prepare(`SELECT id, user_id, symbol, asset_type FROM transactions WHERE holding_id IS NULL`)
    .all();
  if (rows.length === 0) return;

  const findHoldings = db.prepare(
    `SELECT id FROM holdings WHERE user_id = ? AND symbol = ? AND asset_type = ?`
  );
  const updateTx = db.prepare(`UPDATE transactions SET holding_id = ? WHERE id = ?`);

  let updatedCount = 0;
  rows.forEach((r) => {
    const matches = findHoldings.all(r.user_id, r.symbol, r.asset_type);
    if (matches.length === 1) {
      updateTx.run(matches[0].id, r.id);
      updatedCount += 1;
    }
  });
  if (updatedCount > 0) {
    console.log(`마이그레이션: transactions.holding_id ${updatedCount}건 자동 연결됨`);
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

  const transactionsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'`)
    .get();
  if (transactionsExists) {
    ensureColumn('transactions', 'holding_id', 'INTEGER REFERENCES holdings(id)');
    backfillTransactionHoldingIds();
  }
}

function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  runMigrations();
  console.log('DB 스키마 초기화 완료:', DB_PATH);
}

module.exports = { db, initSchema, backfillTransactionHoldingIds };