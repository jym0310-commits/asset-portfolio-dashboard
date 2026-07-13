const { getCachedUsdKrwRate } = require('./services/exchangeRateService');

function toKRW(amount, currency) {
  if (currency === 'KRW') return amount;
  if (currency === 'USD') return amount * getCachedUsdKrwRate();
  return amount;
}

module.exports = { toKRW };