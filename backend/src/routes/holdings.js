const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { toKRW } = require('../config');
const { getCachedUsdKrwRate } = require('../services/exchangeRateService');
const { refreshAllPrices, snapshotNetWorth } = require('../services/priceRefreshService');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

function getHoldingsWithCurrent(userId, filters = {}) {
  const { assetType, market, institution } = filters;

  const conditions = ['user_id = ?'];
  const params = [userId];

  if (assetType) {
    conditions.push('asset_type = ?');
    params.push(assetType);
  } else if (market && market !== 'all') {
    conditions.push('asset_type = ?');
    params.push(market);
  }

  if (institution && institution !== 'all') {
    conditions.push('institution = ?');
    params.push(institution);
  }

  const holdings = db
    .prepare(`SELECT * FROM holdings WHERE ${conditions.join(' AND ')}`)
    .all(...params);

  return holdings.map((h) => {
    const latest = db
      .prepare(
        `SELECT close_price, date FROM price_history
         WHERE symbol = ? AND asset_type = ?
         ORDER BY date DESC LIMIT 1`
      )
      .get(h.symbol, h.asset_type);

    const currentPrice = latest ? latest.close_price : h.avg_price;
    const costTotal = h.avg_price * h.quantity;
    const currentTotal = currentPrice * h.quantity;
    const profit = currentTotal - costTotal;
    const profitRate = costTotal > 0 ? (profit / costTotal) * 100 : 0;

    // 현재 평가금액: 지금(실시간) 환율로 환산
    const currentTotalKRW = toKRW(currentTotal, h.currency);
    // 매수 원가: 매수 시점에 저장해둔 환율로 환산 (없으면 현재 환율로 대체)
    const costTotalKRW =
      h.currency === 'USD'
        ? costTotal * (h.purchase_fx_rate || getCachedUsdKrwRate())
        : toKRW(costTotal, h.currency);

    return {
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      asset_type: h.asset_type,
      sector: h.sector,
      institution: h.institution,
      exchange: h.exchange,
      purchase_date: h.purchase_date,
      purchase_fx_rate: h.purchase_fx_rate,
      currency: h.currency,
      quantity: h.quantity,
      avg_price: h.avg_price,
      current_price: currentPrice,
      last_price_date: latest ? latest.date : null,
      cost_total: Math.round(costTotal),
      current_total: Math.round(currentTotal),
      current_total_krw: Math.round(currentTotalKRW),
      cost_total_krw: Math.round(costTotalKRW),
      profit: Math.round(profit),
      profit_krw: Math.round(currentTotalKRW - costTotalKRW),
      profit_rate: Number(profitRate.toFixed(2)),
    };
  });
}

// GET /api/holdings?type=domestic_stock|overseas_stock|crypto&institution=한국투자증권
router.get('/', (req, res) => {
  const { type, institution } = req.query;
  res.json(getHoldingsWithCurrent(req.ownerId, { assetType: type, institution }));
});

// POST /api/holdings - 종목 추가 (같은 종목 + 같은 증권사면 합산, 증권사가 다르면 별도 행)
router.post('/', (req, res) => {
  const { symbol, name, asset_type, sector, institution, exchange, purchase_date, quantity, avg_price, currency } =
    req.body;

  if (!symbol || !name || !asset_type) {
    return res.status(400).json({ error: 'symbol, name, asset_type는 필수입니다.' });
  }

  const userId = req.ownerId;
  const qty = Number(quantity) || 0;
  const price = Number(avg_price) || 0;
  const today = new Date().toISOString().slice(0, 10);
  const buyDate = purchase_date || today;

  const existing = db
    .prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ? AND asset_type = ? AND institution IS ?')
    .get(userId, symbol, asset_type, institution || null);

  const insertBuyTx = db.prepare(
    `INSERT INTO transactions (user_id, symbol, asset_type, trade_type, quantity, price, trade_date)
     VALUES (?, ?, ?, 'buy', ?, ?, ?)`
  );

  // 해외주식(USD)만 매수시점 환율을 기록합니다. 국내주식/코인(KRW)은 환율 환산이 필요없어 NULL로 둡니다.
  const currentFxRate = getCachedUsdKrwRate();
  const isUsd = (currency || 'KRW') === 'USD';

  if (existing) {
    // 같은 종목 + 같은 증권사 -> 수량 합산 + 평단가 가중평균 재계산
    const newQuantity = existing.quantity + qty;
    const newAvgPrice =
      newQuantity > 0
        ? (existing.quantity * existing.avg_price + qty * price) / newQuantity
        : existing.avg_price;

    // 매수시점 환율도 원가(USD 금액) 기준 가중평균으로 재계산합니다.
    let newFxRate = existing.purchase_fx_rate;
    if (existing.currency === 'USD') {
      const existingCostUsd = existing.quantity * existing.avg_price;
      const newCostUsd = qty * price;
      const totalCostUsd = existingCostUsd + newCostUsd;
      newFxRate =
        totalCostUsd > 0
          ? (existingCostUsd * (existing.purchase_fx_rate || currentFxRate) + newCostUsd * currentFxRate) /
            totalCostUsd
          : existing.purchase_fx_rate;
    }

    db.prepare(
      `UPDATE holdings
       SET quantity = ?,
           avg_price = ?,
           purchase_fx_rate = ?,
           sector = COALESCE(sector, ?),
           exchange = COALESCE(exchange, ?),
           purchase_date = COALESCE(purchase_date, ?),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(newQuantity, newAvgPrice, newFxRate, sector || null, exchange || null, buyDate, existing.id);

    insertBuyTx.run(userId, symbol, asset_type, qty, price, buyDate);
    snapshotNetWorth(userId);

    return res.status(200).json({
      id: existing.id,
      merged: true,
      quantity: newQuantity,
      avg_price: Number(newAvgPrice.toFixed(6)),
    });
  }

  try {
    const stmt = db.prepare(
      `INSERT INTO holdings (user_id, symbol, name, asset_type, sector, institution, exchange, purchase_date, purchase_fx_rate, quantity, avg_price, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      userId,
      symbol,
      name,
      asset_type,
      sector || null,
      institution || null,
      exchange || null,
      buyDate,
      isUsd ? currentFxRate : null,
      qty,
      price,
      currency || 'KRW'
    );

    insertBuyTx.run(userId, symbol, asset_type, qty, price, buyDate);

    const existingPrice = db
      .prepare('SELECT 1 FROM price_history WHERE symbol = ? AND asset_type = ?')
      .get(symbol, asset_type);
    if (!existingPrice) {
      db.prepare(
        `INSERT OR IGNORE INTO price_history (symbol, asset_type, date, close_price, volume)
         VALUES (?, ?, ?, ?, ?)`
      ).run(symbol, asset_type, today, price, null);
    }

    snapshotNetWorth(userId);
    res.status(201).json({ id: result.lastInsertRowid, merged: false });
  } catch (err) {
    res.status(500).json({ error: '종목 추가 중 오류가 발생했습니다.' });
  }
});

// PUT /api/holdings/:id - 종목 수정
router.put('/:id', (req, res) => {
  const { name, sector, institution, exchange, purchase_date, quantity, avg_price, currency } = req.body;
  const stmt = db.prepare(
    `UPDATE holdings
     SET name = ?, sector = ?, institution = ?, exchange = ?, purchase_date = ?, quantity = ?, avg_price = ?, currency = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  );
  const result = stmt.run(
    name,
    sector || null,
    institution || null,
    exchange || null,
    purchase_date || null,
    quantity,
    avg_price,
    currency,
    req.params.id,
    req.ownerId
  );
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 종목을 찾을 수 없습니다.' });
  }
  snapshotNetWorth(req.ownerId);
  res.json({ updated: true });
});

// DELETE /api/holdings/:id - 종목 삭제
router.delete('/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM holdings WHERE id = ? AND user_id = ?');
  const result = stmt.run(req.params.id, req.ownerId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 종목을 찾을 수 없습니다.' });
  }
  snapshotNetWorth(req.ownerId);
  res.json({ deleted: true });
});

// POST /api/holdings/refresh-prices - 한국투자증권(주식) + Upbit(코인) 실시간 시세 갱신 + 내 자산 스냅샷 갱신
router.post('/refresh-prices', async (req, res) => {
  const result = await refreshAllPrices();
  snapshotNetWorth(req.ownerId);
  res.json(result);
});

// GET /api/holdings/institutions - 주식 보유 증권사 목록 (필터 드롭다운용, 내 것만)
router.get('/institutions', (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT institution FROM holdings
       WHERE user_id = ? AND institution IS NOT NULL AND asset_type IN ('domestic_stock', 'overseas_stock')
       ORDER BY institution`
    )
    .all(req.ownerId);
  res.json(rows.map((r) => r.institution));
});

// GET /api/holdings/sector-breakdown?market=all|domestic_stock|overseas_stock&institution=...
router.get('/sector-breakdown', (req, res) => {
  const { market, institution } = req.query;
  let stocks;
  if (market && market !== 'all') {
    stocks = getHoldingsWithCurrent(req.ownerId, { assetType: market, institution });
  } else {
    stocks = [
      ...getHoldingsWithCurrent(req.ownerId, { assetType: 'domestic_stock', institution }),
      ...getHoldingsWithCurrent(req.ownerId, { assetType: 'overseas_stock', institution }),
    ];
  }

  const bySector = {};
  stocks.forEach((s) => {
    const key = s.sector || '미분류';
    bySector[key] = (bySector[key] || 0) + s.current_total_krw;
  });

  const total = Object.values(bySector).reduce((sum, v) => sum + v, 0);

  const result = Object.entries(bySector).map(([sector, value]) => ({
    sector,
    value: Math.round(value),
    ratio: total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0,
  }));

  res.json(result);
});

// GET /api/holdings/stock-summary?market=all|domestic_stock|overseas_stock&institution=...
router.get('/stock-summary', (req, res) => {
  const { market, institution } = req.query;
  let stocks;
  if (market && market !== 'all') {
    stocks = getHoldingsWithCurrent(req.ownerId, { assetType: market, institution });
  } else {
    stocks = [
      ...getHoldingsWithCurrent(req.ownerId, { assetType: 'domestic_stock', institution }),
      ...getHoldingsWithCurrent(req.ownerId, { assetType: 'overseas_stock', institution }),
    ];
  }

  const currentTotal = stocks.reduce((sum, s) => sum + s.current_total_krw, 0);
  const costTotal = stocks.reduce((sum, s) => sum + s.cost_total_krw, 0);
  const profit = currentTotal - costTotal;
  const profitRate = costTotal > 0 ? (profit / costTotal) * 100 : 0;

  res.json({
    currency: 'KRW',
    current_total: Math.round(currentTotal),
    profit: Math.round(profit),
    profit_rate: Number(profitRate.toFixed(1)),
  });
});

// GET /api/holdings/realized-pnl?year=2026&market=all|domestic_stock|overseas_stock
router.get('/realized-pnl', (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();
  const { market } = req.query;

  let query = `SELECT COALESCE(SUM(realized_pnl), 0) AS total
     FROM transactions
     WHERE user_id = ? AND trade_type = 'sell' AND strftime('%Y', trade_date) = ?`;
  const params = [req.ownerId, year];

  if (market && market !== 'all') {
    query += ' AND asset_type = ?';
    params.push(market);
  }

  const row = db.prepare(query).get(...params);

  res.json({ year, realized_pnl: Math.round(row.total) });
});

// GET /api/holdings/:symbol/price-history?assetType=domestic_stock&days=180 (시세는 공용 데이터)
router.get('/:symbol/price-history', (req, res) => {
  const { symbol } = req.params;
  const { assetType, days } = req.query;
  const limitDays = parseInt(days, 10) || 180;

  if (!assetType) {
    return res.status(400).json({ error: 'assetType 쿼리 파라미터가 필요합니다.' });
  }

  const rows = db
    .prepare(
      `SELECT date, close_price, volume FROM price_history
       WHERE symbol = ? AND asset_type = ? AND date >= date('now', ?)
       ORDER BY date ASC`
    )
    .all(symbol, assetType, `-${limitDays} days`);

  res.json(rows);
});

module.exports = router;
