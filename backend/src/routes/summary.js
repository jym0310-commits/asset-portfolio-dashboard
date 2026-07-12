const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { toKRW } = require('../config');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

function computeChange(current, baseline) {
  if (baseline === null || baseline === undefined) {
    return { change: null, changeRate: null };
  }
  const change = current - baseline;
  const changeRate = baseline !== 0 ? (change / baseline) * 100 : 0;
  return { change: Math.round(change), changeRate: Number(changeRate.toFixed(2)) };
}

router.get('/', (req, res) => {
  const userId = req.ownerId;

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
    const valueInOriginalCurrency = currentPrice * h.quantity;
    const valueInKRW = toKRW(valueInOriginalCurrency, h.currency);

    if (h.asset_type === 'crypto') {
      cryptoTotal += valueInKRW;
    } else {
      stockTotal += valueInKRW;
    }
  });

  const total = cash + realEstate + insurance + cryptoTotal + stockTotal;

  const baseline = db
    .prepare(
      `SELECT * FROM net_worth_snapshots
       WHERE user_id = ? AND snapshot_date < date('now')
       ORDER BY snapshot_date DESC LIMIT 1`
    )
    .get(userId);

  const cashChange = computeChange(cash, baseline?.cash_total);
  const realEstateChange = computeChange(realEstate, baseline?.real_estate_total);
  const cryptoChange = computeChange(cryptoTotal, baseline?.crypto_total);
  const stockChange = computeChange(stockTotal, baseline?.stock_total);
  const insuranceChange = computeChange(insurance, baseline?.insurance_total);
  const totalChange = computeChange(total, baseline?.total);

  res.json({
    cash: Math.round(cash),
    realEstate: Math.round(realEstate),
    crypto: Math.round(cryptoTotal),
    stock: Math.round(stockTotal),
    insurance: Math.round(insurance),
    total: Math.round(total),
    baseline_date: baseline ? baseline.snapshot_date : null,
    changes: {
      cash: cashChange,
      realEstate: realEstateChange,
      crypto: cryptoChange,
      stock: stockChange,
      insurance: insuranceChange,
      total: totalChange,
    },
  });
});

module.exports = router;
