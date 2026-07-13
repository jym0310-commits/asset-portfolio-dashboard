const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./index');

initSchema();

const today = new Date().toISOString().slice(0, 10);

function seedUser() {
  // 데모 계정: 로그인 화면에서 이 이메일/비밀번호로 로그인해서 샘플 데이터를 확인할 수 있습니다.
  const passwordHash = bcrypt.hashSync('demo1234', 10);
  const stmt = db.prepare(
    `INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)`
  );
  const result = stmt.run('demo@example.com', passwordHash, '윤민');
  return result.lastInsertRowid;
}

function seedCash(userId) {
  const rows = [
    ['한국투자증권(CMA)', '한국투자증권', 'KRW', 310006558],
    ['미래에셋(윤민)', '미래에셋', 'KRW', 20000000],
    ['주택청약(은영)', '한국투자증권', 'KRW', 10000000],
    ['주택청약(윤민)', '한국투자증권', 'KRW', 7400000],
    ['한국투자증권(주식)', '한국투자증권', 'KRW', 3262430],
    ['미래에셋(이서)', '미래에셋', 'KRW', 1272886],
    ['미래에셋(이혁)', '미래에셋', 'KRW', 790338],
    ['한국투자증권(연금)', '한국투자증권', 'KRW', 60152],
    ['업비트', '업비트', 'KRW', 2971],
    ['유안타증권', '유안타증권', 'KRW', 0],
  ];
  const stmt = db.prepare(
    'INSERT INTO cash_accounts (user_id, account_name, institution, currency, balance) VALUES (?, ?, ?, ?, ?)'
  );
  rows.forEach((r) => stmt.run(userId, ...r));
}

function seedRealEstate(userId) {
  const rows = [
    ['해링턴', 'KRW', 57501000],
    ['월세보증금', 'KRW', 30000000],
  ];
  const stmt = db.prepare(
    'INSERT INTO real_estates (user_id, item_name, currency, balance) VALUES (?, ?, ?, ?)'
  );
  rows.forEach((r) => stmt.run(userId, ...r));
}

function seedHoldingsAndPrices(userId) {
  // [symbol, name, asset_type, sector, institution, exchange, purchase_date, purchase_fx_rate, quantity, avg_price(평단가/원가), currency, current_price]
  const rows = [
    ['402970', 'ACE 미국배당다우', 'domestic_stock', '배당주', '한국투자증권', null, '2025-08-20', null, 5380, 11744, 'KRW', 16020],
    ['GOOGL', '알파벳 A', 'overseas_stock', '기술주', '한국투자증권', 'NAS', '2025-09-15', 1340, 68, 314.75, 'USD', 359.91],
    ['360750', 'TIGER 미국S&P5', 'domestic_stock', 'S&P500', '한국투자증권', null, '2025-07-10', null, 1061, 24773, 'KRW', 28605],
    ['005930', '삼성전자', 'domestic_stock', '기술주', '한국투자증권', null, '2024-11-05', null, 70, 58553, 'KRW', 309500],
    ['PFE', '화이자', 'overseas_stock', '배당주', '미래에셋', 'NYS', '2025-10-01', 1355, 420, 26.25, 'USD', 24.32],
    ['KRW-BTC', '비트코인', 'crypto', null, '업비트', null, '2025-12-01', null, 0.05, 91946420, 'KRW', 91946420],
  ];

  const insertHolding = db.prepare(
    `INSERT INTO holdings (user_id, symbol, name, asset_type, sector, institution, exchange, purchase_date, purchase_fx_rate, quantity, avg_price, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertPrice = db.prepare(
    `INSERT OR IGNORE INTO price_history (symbol, asset_type, date, close_price, volume)
     VALUES (?, ?, ?, ?, ?)`
  );

  rows.forEach(([symbol, name, assetType, sector, institution, exchange, purchaseDate, purchaseFxRate, qty, avgPrice, currency, currentPrice]) => {
    insertHolding.run(userId, symbol, name, assetType, sector, institution, exchange, purchaseDate, purchaseFxRate, qty, avgPrice, currency);
    insertPrice.run(symbol, assetType, today, currentPrice, null);
  });
}

function seedTransactions(userId) {
  // 캡처 화면의 "매도 실현 손익 2026년 -434,000원"을 재현하기 위한 샘플 매도 내역
  const stmt = db.prepare(
    `INSERT INTO transactions (user_id, symbol, asset_type, trade_type, quantity, price, realized_pnl, trade_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(userId, '005930', 'domestic_stock', 'sell', 10, 55000, -434000, '2026-03-15');
}

function seedNetWorthHistory(userId) {
  // 최근 30일치 자산 성장 추이 샘플 (테스트용 합성 데이터)
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO net_worth_snapshots
     (user_id, snapshot_date, cash_total, real_estate_total, crypto_total, stock_total, insurance_total, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const finalCash = 352795335;
  const finalRealEstate = 87501000;
  const finalCrypto = 4597321;
  const finalStock = 221791384;
  const finalInsurance = 0;

  const days = 30;
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const ratio = 1 - i / days / 3; // 과거로 갈수록 자산이 조금 더 적었다고 가정한 단순 합성값
    stmt.run(
      userId,
      dateStr,
      Math.round(finalCash * ratio),
      Math.round(finalRealEstate * ratio),
      Math.round(finalCrypto * ratio),
      Math.round(finalStock * ratio),
      finalInsurance,
      Math.round((finalCash + finalRealEstate + finalCrypto + finalStock + finalInsurance) * ratio)
    );
  }
}

function run() {
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  if (existing.cnt > 0) {
    console.log('이미 데이터가 있어서 시딩을 건너뜁니다. (초기화하려면 data.sqlite 파일을 지우고 다시 실행하세요)');
    return;
  }
  const userId = seedUser();
  seedCash(userId);
  seedRealEstate(userId);
  seedHoldingsAndPrices(userId);
  seedTransactions(userId);
  seedNetWorthHistory(userId);
  console.log('샘플 데이터 시딩 완료 (데모 계정: demo@example.com / demo1234)');
}

run();
