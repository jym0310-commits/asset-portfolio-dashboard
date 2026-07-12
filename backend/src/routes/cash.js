const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { snapshotNetWorth } = require('../services/priceRefreshService');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

// GET /api/cash - 현금 보유 현황 목록
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM cash_accounts WHERE user_id = ? ORDER BY balance DESC')
    .all(req.ownerId);
  res.json(rows);
});

// POST /api/cash - 계좌 추가
router.post('/', (req, res) => {
  const { account_name, institution, currency, balance } = req.body;
  if (!account_name) {
    return res.status(400).json({ error: 'account_name은 필수입니다.' });
  }
  const stmt = db.prepare(
    `INSERT INTO cash_accounts (user_id, account_name, institution, currency, balance)
     VALUES (?, ?, ?, ?, ?)`
  );
  const result = stmt.run(req.ownerId, account_name, institution || null, currency || 'KRW', balance || 0);
  snapshotNetWorth(req.ownerId);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/cash/:id - 계좌 수정
router.put('/:id', (req, res) => {
  const { account_name, institution, currency, balance } = req.body;
  const stmt = db.prepare(
    `UPDATE cash_accounts
     SET account_name = ?, institution = ?, currency = ?, balance = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  );
  const result = stmt.run(account_name, institution, currency, balance, req.params.id, req.ownerId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 계좌를 찾을 수 없습니다.' });
  }
  snapshotNetWorth(req.ownerId);
  res.json({ updated: true });
});

// DELETE /api/cash/:id - 계좌 삭제
router.delete('/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM cash_accounts WHERE id = ? AND user_id = ?');
  const result = stmt.run(req.params.id, req.ownerId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 계좌를 찾을 수 없습니다.' });
  }
  snapshotNetWorth(req.ownerId);
  res.json({ deleted: true });
});

module.exports = router;
