const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { toKRW } = require('../config');
const { snapshotNetWorth } = require('../services/priceRefreshService');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

// POST /api/transactions/sell - 매도 등록 (실현손익 계산 + 보유수량 차감)
router.post('/sell', (req, res) => {
  const { holding_id, quantity, price, trade_date } = req.body;

  if (!holding_id || !quantity || !price || !trade_date) {
    return res.status(400).json({ error: 'holding_id, quantity, price, trade_date는 필수입니다.' });
  }

  const holding = db
    .prepare('SELECT * FROM holdings WHERE id = ? AND user_id = ?')
    .get(holding_id, req.ownerId);
  if (!holding) {
    return res.status(404).json({ error: '해당 보유 종목을 찾을 수 없습니다.' });
  }

  if (quantity <= 0) {
    return res.status(400).json({ error: '매도 수량은 0보다 커야 합니다.' });
  }

  if (quantity > holding.quantity) {
    return res
      .status(400)
      .json({ error: `보유 수량(${holding.quantity})보다 많이 매도할 수 없습니다.` });
  }

  const profitInOriginalCurrency = (price - holding.avg_price) * quantity;
  const realizedPnlKRW = Math.round(toKRW(profitInOriginalCurrency, holding.currency));

  const insertTx = db.prepare(
    `INSERT INTO transactions (user_id, symbol, asset_type, trade_type, quantity, price, realized_pnl, trade_date)
     VALUES (?, ?, ?, 'sell', ?, ?, ?, ?)`
  );
  const result = insertTx.run(
    req.ownerId,
    holding.symbol,
    holding.asset_type,
    quantity,
    price,
    realizedPnlKRW,
    trade_date
  );

  const remainingQuantity = holding.quantity - quantity;
  db.prepare(`UPDATE holdings SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(
    remainingQuantity,
    holding_id,
    req.ownerId
  );

  snapshotNetWorth(req.ownerId);

  res.status(201).json({
    id: result.lastInsertRowid,
    realized_pnl: realizedPnlKRW,
    remaining_quantity: remainingQuantity,
  });
});

// GET /api/transactions?symbol=&assetType=&tradeType= - 거래내역 조회 (내 것만)
// holdings 테이블과 조인해서 종목명을 같이 보여줍니다 (종목이 이미 삭제됐으면 이름 없이 코드만 표시).
router.get('/', (req, res) => {
  const { symbol, assetType, tradeType } = req.query;

  let query = `
    SELECT t.*, h.name AS holding_name
    FROM transactions t
    LEFT JOIN holdings h
      ON h.symbol = t.symbol AND h.asset_type = t.asset_type AND h.user_id = t.user_id
    WHERE t.user_id = ?
  `;
  const params = [req.ownerId];

  if (symbol && assetType) {
    query += ' AND t.symbol = ? AND t.asset_type = ?';
    params.push(symbol, assetType);
  } else if (assetType && assetType !== 'all') {
    query += ' AND t.asset_type = ?';
    params.push(assetType);
  }

  if (tradeType && tradeType !== 'all') {
    query += ' AND t.trade_type = ?';
    params.push(tradeType);
  }

  query += ' ORDER BY t.trade_date DESC, t.id DESC';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// GET /api/transactions/sell-years - 매도 실현손익 드롭다운용 연도 목록 (내 매도기록이 있는 연도 + 올해)
router.get('/sell-years', (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT strftime('%Y', trade_date) AS year
       FROM transactions
       WHERE user_id = ? AND trade_type = 'sell'
       ORDER BY year DESC`
    )
    .all(req.ownerId);

  const years = rows.map((r) => r.year);
  const currentYear = new Date().getFullYear().toString();
  if (!years.includes(currentYear)) {
    years.unshift(currentYear);
  }
  years.sort((a, b) => b.localeCompare(a));

  res.json(years);
});

module.exports = router;