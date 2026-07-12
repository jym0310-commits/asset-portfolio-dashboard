// 임시 고정 환율입니다. 추후 실시간 환율 API로 교체 예정입니다.
const FX_RATE_USD_KRW = 1400;

function toKRW(amount, currency) {
  if (currency === 'KRW') return amount;
  if (currency === 'USD') return amount * FX_RATE_USD_KRW;
  return amount;
}

module.exports = { FX_RATE_USD_KRW, toKRW };
