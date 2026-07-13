const { getUsdKrwRate } = require('./fxService');

let cachedRate = 1400;
let lastUpdatedAt = null;

async function refreshExchangeRate() {
  try {
    const rate = await getUsdKrwRate();
    cachedRate = rate;
    lastUpdatedAt = new Date();
  } catch (err) {
    console.error('환율 갱신 실패, 기존 캐시 값을 계속 사용합니다:', err.message);
  }
}

function getCachedUsdKrwRate() {
  return cachedRate;
}

function getLastUpdatedAt() {
  return lastUpdatedAt;
}

function startExchangeRateRefresher() {
  refreshExchangeRate();
  setInterval(refreshExchangeRate, 60 * 60 * 1000);
}

module.exports = {
  getCachedUsdKrwRate,
  refreshExchangeRate,
  getLastUpdatedAt,
  startExchangeRateRefresher,
};