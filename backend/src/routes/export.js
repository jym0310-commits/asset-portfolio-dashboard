const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { toKRW } = require('../config');
const { requireAuth } = require('../middleware/requireAuth');
const { resolveOwner } = require('../middleware/resolveOwner');

router.use(requireAuth, resolveOwner);

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers, rows) {
  const headerLine = headers.map(toCsvValue).join(',');
  const dataLines = rows.map((row) => row.map(toCsvValue).join(','));
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

const ASSET_TYPE_LABELS = {
  domestic_stock: '국내주식',
  overseas_stock: '해외주식',
  crypto: '코인',
};

router.get('/holdings', (req, res) => {
  const holdings = db.prepare('SELECT * FROM holdings WHERE user_id = ? ORDER BY asset_type, name').all(req.ownerId);

  const rows = holdings.map((h) => {
    const latest = db
      .prepare(
        `SELECT close_price FROM price_history WHERE symbol = ? AND asset_type = ? ORDER BY date DESC LIMIT 1`
      )
      .get(h.symbol, h.asset_type);
    const currentPrice = latest ? latest.close_price : h.avg_price;
    const costTotal = h.avg_price * h.quantity;
    const currentTotal = currentPrice * h.quantity;
    const currentTotalKrw = Math.round(toKRW(currentTotal, h.currency));
    const profitRate = costTotal > 0 ? (((currentTotal - costTotal) / costTotal) * 100).toFixed(2) : '0.00';

    return [
      ASSET_TYPE_LABELS[h.asset_type] || h.asset_type,
      h.symbol,
      h.name,
      h.institution || '',
      h.quantity,
      h.avg_price,
      currentPrice,
      h.currency,
      currentTotalKrw,
      `${profitRate}%`,
      h.purchase_date || '',
    ];
  });

  const csv = buildCsv(
    ['구분', '종목코드', '종목명', '증권사', '수량', '평단가', '현재가', '통화', '평가금액(원)', '수익률', '매수일'],
    rows
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolionote_holdings.csv"');
  res.send(csv);
});

router.get('/transactions', (req, res) => {
  const { assetType, tradeType } = req.query;

  let query = `
    SELECT t.*, h.name AS holding_name
    FROM transactions t
    LEFT JOIN holdings h
      ON h.symbol = t.symbol AND h.asset_type = t.asset_type AND h.user_id = t.user_id
    WHERE t.user_id = ?
  `;
  const params = [req.ownerId];

  if (assetType && assetType !== 'all') {
    query += ' AND t.asset_type = ?';
    params.push(assetType);
  }
  if (tradeType && tradeType !== 'all') {
    query += ' AND t.trade_type = ?';
    params.push(tradeType);
  }
  query += ' ORDER BY t.trade_date DESC, t.id DESC';

  const transactions = db.prepare(query).all(...params);

  const rows = transactions.map((t) => [
    t.trade_date,
    t.symbol,
    t.holding_name || '',
    ASSET_TYPE_LABELS[t.asset_type] || t.asset_type,
    t.trade_type === 'buy' ? '매수' : '매도',
    t.quantity,
    t.price,
    t.realized_pnl !== null ? t.realized_pnl : '',
  ]);

  const csv = buildCsv(
    ['날짜', '종목코드', '종목명', '구분(시장)', '구분(매수/매도)', '수량', '단가', '실현손익(원)'],
    rows
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolionote_transactions.csv"');
  res.send(csv);
});

module.exports = router;