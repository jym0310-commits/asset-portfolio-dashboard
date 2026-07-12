const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 배포 환경(Fly.io)에서는 영구 저장 볼륨 경로(예: /data/data.sqlite)를
// SQLITE_PATH 환경변수로 지정해서 씁니다. 지정 안 하면 기존처럼 로컬 파일을 씁니다.
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  console.log('DB 스키마 초기화 완료:', DB_PATH);
}

module.exports = { db, initSchema };