const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { toKRW } = require('../config');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

// 지금 시점 기준 총자산(현금+부동산+보험+주식+코인, KRW)을 계산합니다.
function computeCurrentTotal(userId) {
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
  let stockAndCryptoTotal = 0;
  holdings.forEach((h) => {
    const latest = db
      .prepare(
        `SELECT close_price FROM price_history
         WHERE symbol = ? AND asset_type = ?
         ORDER BY date DESC LIMIT 1`
      )
      .get(h.symbol, h.asset_type);
    const currentPrice = latest ? latest.close_price : h.avg_price;
    stockAndCryptoTotal += toKRW(currentPrice * h.quantity, h.currency);
  });

  return cash + realEstate + insurance + stockAndCryptoTotal;
}

// GET /api/financial-goals/:year - 해당 연도 목표 + 현재 진행률 조회
router.get('/:year', (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (!year) {
    return res.status(400).json({ error: '올바른 연도가 아닙니다.' });
  }

  const goal = db
    .prepare('SELECT * FROM financial_goals WHERE user_id = ? AND year = ?')
    .get(req.ownerId, year);
  const currentTotal = computeCurrentTotal(req.ownerId);

  if (!goal) {
    return res.json({
      year,
      target_amount: null,
      current_total: Math.round(currentTotal),
      progress_rate: null,
      remaining_amount: null,
    });
  }

  const progressRate = goal.target_amount > 0 ? (currentTotal / goal.target_amount) * 100 : 0;
  const remaining = goal.target_amount - currentTotal;

  res.json({
    year,
    target_amount: goal.target_amount,
    current_total: Math.round(currentTotal),
    progress_rate: Number(progressRate.toFixed(1)),
    remaining_amount: Math.round(remaining),
  });
});

// POST /api/financial-goals - 목표 설정/수정 (연도당 하나, 있으면 덮어씀)
router.post('/', (req, res) => {
  const { year, target_amount } = req.body;
  const y = parseInt(year, 10);
  const amount = Number(target_amount);

  if (!y || !amount || amount <= 0) {
    return res.status(400).json({ error: 'year와 target_amount(0보다 큰 값)는 필수입니다.' });
  }

  db.prepare(
    `INSERT INTO financial_goals (user_id, year, target_amount)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, year) DO UPDATE SET target_amount = excluded.target_amount, updated_at = datetime('now')`
  ).run(req.ownerId, y, amount);

  res.status(201).json({ year: y, target_amount: amount });
});

// DELETE /api/financial-goals/:year - 목표 삭제
router.delete('/:year', (req, res) => {
  const year = parseInt(req.params.year, 10);
  const result = db.prepare('DELETE FROM financial_goals WHERE user_id = ? AND year = ?').run(req.ownerId, year);
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 연도의 목표를 찾을 수 없습니다.' });
  }
  res.json({ deleted: true });
});

module.exports = router;
