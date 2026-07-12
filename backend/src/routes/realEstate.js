const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { snapshotNetWorth } = require('../services/priceRefreshService');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

// GET /api/real-estate
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM real_estates WHERE user_id = ? ORDER BY balance DESC')
    .all(req.ownerId);
  res.json(rows);
});

// POST /api/real-estate
router.post('/', (req, res) => {
  const { item_name, currency, balance } = req.body;
  if (!item_name) {
    return res.status(400).json({ error: 'item_name은 필수입니다.' });
  }
  const stmt = db.prepare(
    'INSERT INTO real_estates (user_id, item_name, currency, balance) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(req.ownerId, item_name, currency || 'KRW', balance || 0);
  snapshotNetWorth(req.ownerId);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/real-estate/:id
router.put('/:id', (req, res) => {
  const { item_name, currency, balance } = req.body;
  const stmt = db.prepare(
    `UPDATE real_estates
     SET item_name = ?, currency = ?, balance = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  );
  const result = stmt.run(item_name, currency, balance, req.params.id, req.ownerId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 항목을 찾을 수 없습니다.' });
  }
  snapshotNetWorth(req.ownerId);
  res.json({ updated: true });
});

// DELETE /api/real-estate/:id
router.delete('/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM real_estates WHERE id = ? AND user_id = ?');
  const result = stmt.run(req.params.id, req.ownerId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 항목을 찾을 수 없습니다.' });
  }
  snapshotNetWorth(req.ownerId);
  res.json({ deleted: true });
});

module.exports = router;
