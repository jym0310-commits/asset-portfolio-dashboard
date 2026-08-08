const { db } = require('../db');
const { toKRW } = require('../config');
const { snapshotNetWorth } = require('./priceRefreshService');

// 특정 보유 종목(holding)에 딸린 모든 거래내역(매수/매도)을 날짜순으로 다시 훑으면서
// 보유수량 / 평단가 / 각 매도 건의 실현손익을 처음부터 다시 계산합니다.
// 거래내역을 수정하거나 삭제한 뒤에는 항상 이 함수를 호출해서 데이터를 맞춰줘야 합니다.
// 매도 수량이 그 시점 보유수량보다 많아지면 NEGATIVE_QUANTITY 에러를 던지고 아무것도 바꾸지 않습니다.
function recalcHolding(holdingId, userId) {
  const holding = db.prepare('SELECT * FROM holdings WHERE id = ? AND user_id = ?').get(holdingId, userId);
  if (!holding) return;

  const txs = db
    .prepare(
      `SELECT * FROM transactions WHERE holding_id = ? AND user_id = ? ORDER BY trade_date ASC, id ASC`
    )
    .all(holdingId, userId);

  const updatePnl = db.prepare('UPDATE transactions SET realized_pnl = ? WHERE id = ?');

  let quantity = 0;
  let avgPrice = holding.avg_price;

  txs.forEach((t) => {
    if (t.trade_type === 'buy') {
      const newQuantity = quantity + t.quantity;
      avgPrice = newQuantity > 0 ? (quantity * avgPrice + t.quantity * t.price) / newQuantity : avgPrice;
      quantity = newQuantity;
    } else {
      if (t.quantity > quantity + 1e-9) {
        throw new Error('NEGATIVE_QUANTITY');
      }
      const profitInOriginalCurrency = (t.price - avgPrice) * t.quantity;
      const realizedPnlKRW = Math.round(toKRW(profitInOriginalCurrency, holding.currency));
      if (realizedPnlKRW !== t.realized_pnl) {
        updatePnl.run(realizedPnlKRW, t.id);
      }
      quantity -= t.quantity;
    }
  });

  db.prepare(`UPDATE holdings SET quantity = ?, avg_price = ?, updated_at = datetime('now') WHERE id = ?`).run(
    Math.max(quantity, 0),
    avgPrice,
    holdingId
  );

  snapshotNetWorth(userId);
}

module.exports = { recalcHolding };
