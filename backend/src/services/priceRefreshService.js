const { db } = require('../db');
const { getDomesticPrice, getOverseasPrice } = require('./kisApi');
const { getTickerPrices } = require('./upbitApi');
const { toKRW } = require('../config');

// 모든 사용자의 보유중인 종목(holdings)을 대상으로 KIS(주식) + Upbit(코인) 시세를 갱신합니다.
// price_history는 사용자별로 나뉘지 않는 공통 시세 데이터라, 한 번만 갱신하면 모든 사용자가 혜택을 봅니다.
async function refreshAllPrices() {
  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  const upsertPrice = db.prepare(
    `INSERT INTO price_history (symbol, asset_type, date, close_price, volume)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(symbol, asset_type, date) DO UPDATE SET close_price = excluded.close_price`
  );

  // 국내/해외 주식: 한국투자증권 API (전체 사용자 보유 종목, 중복 심볼은 한 번만 조회)
  const stockHoldings = db
    .prepare(
      `SELECT DISTINCT symbol, asset_type, exchange
       FROM holdings WHERE asset_type IN ('domestic_stock', 'overseas_stock')`
    )
    .all();

  for (const h of stockHoldings) {
    try {
      let price;
      if (h.asset_type === 'domestic_stock') {
        price = await getDomesticPrice(h.symbol);
      } else {
        price = await getOverseasPrice(h.symbol, h.exchange || 'NAS');
      }
      upsertPrice.run(h.symbol, h.asset_type, today, price);
      results.push({ symbol: h.symbol, price, status: 'ok' });
    } catch (err) {
      results.push({ symbol: h.symbol, status: 'error', error: err.message });
    }
  }

  // 코인: Upbit API (전체 사용자 보유 코인, 중복 마켓은 한 번만 조회)
  const cryptoHoldings = db
    .prepare(`SELECT DISTINCT symbol, asset_type FROM holdings WHERE asset_type = 'crypto'`)
    .all();
  if (cryptoHoldings.length > 0) {
    try {
      const priceMap = await getTickerPrices(cryptoHoldings.map((h) => h.symbol));
      for (const h of cryptoHoldings) {
        const price = priceMap[h.symbol];
        if (price) {
          upsertPrice.run(h.symbol, h.asset_type, today, price);
          results.push({ symbol: h.symbol, price, status: 'ok' });
        } else {
          results.push({
            symbol: h.symbol,
            status: 'error',
            error: 'Upbit 응답에 해당 마켓 시세가 없습니다.',
          });
        }
      }
    } catch (err) {
      cryptoHoldings.forEach((h) => {
        results.push({ symbol: h.symbol, status: 'error', error: err.message });
      });
    }
  }

  return { updated_at: today, results };
}

// 특정 사용자(userId)의 오늘 날짜 자산 총액 스냅샷을 저장합니다.
// (이미 있으면 덮어씁니다 - 하루에 여러 번 실행돼도 안전)
function snapshotNetWorth(userId) {
  const today = new Date().toISOString().slice(0, 10);

  const cash = db
    .prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM cash_accounts WHERE user_id = ?')
    .get(userId).total;
  const realEstate = db
    .prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM real_estates WHERE user_id = ?')
    .get(userId).total;
  const insurance = db
    .prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM insurances WHERE user_id = ?')
    .get(userId).total;

  const holdings = db.prepare('SELECT * FROM holdings WHERE user_id = ?').all(userId);
  let cryptoTotal = 0;
  let stockTotal = 0;

  holdings.forEach((h) => {
    const latest = db
      .prepare(
        `SELECT close_price FROM price_history
         WHERE symbol = ? AND asset_type = ?
         ORDER BY date DESC LIMIT 1`
      )
      .get(h.symbol, h.asset_type);
    const currentPrice = latest ? latest.close_price : h.avg_price;
    const valueKRW = toKRW(currentPrice * h.quantity, h.currency);

    if (h.asset_type === 'crypto') {
      cryptoTotal += valueKRW;
    } else {
      stockTotal += valueKRW;
    }
  });

  const total = cash + realEstate + insurance + cryptoTotal + stockTotal;

  db.prepare(
    `INSERT INTO net_worth_snapshots
       (user_id, snapshot_date, cash_total, real_estate_total, crypto_total, stock_total, insurance_total, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
       cash_total = excluded.cash_total,
       real_estate_total = excluded.real_estate_total,
       crypto_total = excluded.crypto_total,
       stock_total = excluded.stock_total,
       insurance_total = excluded.insurance_total,
       total = excluded.total`
  ).run(
    userId,
    today,
    Math.round(cash),
    Math.round(realEstate),
    Math.round(cryptoTotal),
    Math.round(stockTotal),
    Math.round(insurance),
    Math.round(total)
  );
}

// 모든 사용자 id 목록 (스케줄러가 전체 사용자를 순회하며 스냅샷을 찍을 때 사용)
function getAllUserIds() {
  return db.prepare('SELECT id FROM users').all().map((u) => u.id);
}

module.exports = { refreshAllPrices, snapshotNetWorth, getAllUserIds };
