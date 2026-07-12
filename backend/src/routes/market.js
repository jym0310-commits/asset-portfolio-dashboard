const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { getDomesticIndex, getOverseasPrice } = require('../services/kisApi');
const { getTickerPrices } = require('../services/upbitApi');
const { getUsdKrwRate } = require('../services/fxService');

router.use(requireAuth);

router.get('/overview', async (req, res) => {
  const result = {};

  try {
    const kospi = await getDomesticIndex('0001');
    result.kospi = { ...kospi, status: 'ok' };
  } catch (err) {
    result.kospi = { status: 'error', error: err.message };
  }

  try {
    // 나스닥 종합지수 자체는 무료로 안정적인 조회처가 마땅치 않아서,
    // 이미 검증된 한국투자증권 해외주식 API로 나스닥100을 대표하는 QQQ ETF 가격을 대신 보여줍니다.
    const price = await getOverseasPrice('QQQ', 'NAS');
    result.nasdaq = { price, status: 'ok' };
  } catch (err) {
    result.nasdaq = { status: 'error', error: err.message };
  }

  try {
    const rate = await getUsdKrwRate();
    result.usdKrw = { price: rate, status: 'ok' };
  } catch (err) {
    result.usdKrw = { status: 'error', error: err.message };
  }

  try {
    const priceMap = await getTickerPrices(['KRW-BTC']);
    const price = priceMap['KRW-BTC'];
    if (price) {
      result.bitcoin = { price, status: 'ok' };
    } else {
      result.bitcoin = { status: 'error', error: 'Upbit 응답에 시세가 없습니다.' };
    }
  } catch (err) {
    result.bitcoin = { status: 'error', error: err.message };
  }

  res.json(result);
});

module.exports = router;