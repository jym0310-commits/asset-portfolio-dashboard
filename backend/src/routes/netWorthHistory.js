const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

// GET /api/net-worth-history?days=365
router.get('/', (req, res) => {
  const days = parseInt(req.query.days, 10) || 365;
  const rows = db
    .prepare(
      `SELECT snapshot_date, cash_total, real_estate_total, crypto_total, stock_total, insurance_total, total
       FROM net_worth_snapshots
       WHERE user_id = ? AND snapshot_date >= date('now', ?)
       ORDER BY snapshot_date ASC`
    )
    .all(req.ownerId, `-${days} days`);

  res.json(rows);
});

module.exports = router;
