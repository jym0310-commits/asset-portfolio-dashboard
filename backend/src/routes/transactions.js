const express = require('express');
const router = express.Router();
const { db, backfillTransactionHoldingIds } = require('../db');
const { toKRW } = require('../config');
const { snapshotNetWorth } = require('../services/priceRefreshService');
const { recalcHolding } = require('../services/holdingRecalcService');
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
    `INSERT INTO transactions (user_id, symbol, asset_type, trade_type, quantity, price, realized_pnl, trade_date, holding_id)
     VALUES (?, ?, ?, 'sell', ?, ?, ?, ?, ?)`
  );
  const result = insertTx.run(
    req.ownerId,
    holding.symbol,
    holding.asset_type,
    quantity,
    price,
    realizedPnlKRW,
    trade_date,
    holding.id
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

  // 종목 재매수 등으로 새로 보유종목이 생겼을 수 있으니, 조회할 때마다
  // 아직 연결 안 된 예전 거래내역들을 다시 한번 자동 연결 시도합니다.
  backfillTransactionHoldingIds();

  let query = `
    SELECT t.*, h.name AS holding_name, h.institution AS holding_institution
    FROM transactions t
    LEFT JOIN holdings h
      ON h.id = t.holding_id
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

// PUT /api/transactions/:id - 거래내역 수정 (수량/단가/거래일자)
// 수정 후에는 해당 종목의 모든 거래를 날짜순으로 다시 훑어서 보유수량/평단가/실현손익을 재계산합니다.
router.put('/:id', (req, res) => {
  const { quantity, price, trade_date } = req.body;

  if (quantity === undefined || price === undefined || !trade_date) {
    return res.status(400).json({ error: 'quantity, price, trade_date는 필수입니다.' });
  }
  if (Number(quantity) <= 0 || Number(price) < 0) {
    return res.status(400).json({ error: '수량은 0보다 커야 하고, 단가는 0 이상이어야 합니다.' });
  }

  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.ownerId);
  if (!tx) {
    return res.status(404).json({ error: '해당 거래를 찾을 수 없습니다.' });
  }

  // 연결된 보유 종목이 있으면(=holding_id 있음) 수정 후 그 종목의 보유수량/평단가를
  // 재계산합니다. 연결된 보유 종목이 없는 예전 거래(종목이 이미 완전히 정리된 경우)는
  // 재계산할 대상이 없으니 거래 값만 수정합니다.
  const runInTransaction = db.transaction(() => {
    db.prepare('UPDATE transactions SET quantity = ?, price = ?, trade_date = ? WHERE id = ?').run(
      Number(quantity),
      Number(price),
      trade_date,
      tx.id
    );
    if (tx.holding_id) {
      recalcHolding(tx.holding_id, req.ownerId);
    }
  });

  try {
    runInTransaction();
  } catch (err) {
    if (err.message === 'NEGATIVE_QUANTITY') {
      return res
        .status(400)
        .json({ error: '이 수정을 적용하면 보유 수량이 마이너스가 돼요. 값을 다시 확인해주세요.' });
    }
    console.error('거래 수정 중 오류:', err);
    return res.status(500).json({ error: '거래 수정 중 오류가 발생했습니다.' });
  }

  res.json({ updated: true });
});

// DELETE /api/transactions/:id - 거래내역 삭제 (삭제 후 보유수량/평단가/실현손익 재계산)
router.delete('/:id', (req, res) => {
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.ownerId);
  if (!tx) {
    return res.status(404).json({ error: '해당 거래를 찾을 수 없습니다.' });
  }

  const runInTransaction = db.transaction(() => {
    db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);
    if (tx.holding_id) {
      recalcHolding(tx.holding_id, req.ownerId);
    }
  });

  try {
    runInTransaction();
  } catch (err) {
    if (err.message === 'NEGATIVE_QUANTITY') {
      return res
        .status(400)
        .json({ error: '이 거래를 삭제하면 보유 수량이 마이너스가 돼요. 다른 거래를 먼저 확인해주세요.' });
    }
    console.error('거래 삭제 중 오류:', err);
    return res.status(500).json({ error: '거래 삭제 중 오류가 발생했습니다.' });
  }

  res.json({ deleted: true });
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