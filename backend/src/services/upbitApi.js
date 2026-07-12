// Upbit 시세(Ticker) 조회 - 공개 API라 별도 인증키 없이 사용 가능
const UPBIT_TICKER_URL = 'https://api.upbit.com/v1/ticker';

// markets: ['KRW-BTC', 'KRW-ETH', ...] 형태의 배열
// 반환: { 'KRW-BTC': 91234000, 'KRW-ETH': ... } 형태의 맵
async function getTickerPrices(markets) {
  if (!markets || markets.length === 0) {
    return {};
  }

  const url = `${UPBIT_TICKER_URL}?markets=${markets.join(',')}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upbit 시세 조회 실패 (${res.status}): ${text}`);
  }

  const data = await res.json();
  const priceMap = {};
  data.forEach((item) => {
    priceMap[item.market] = item.trade_price;
  });

  return priceMap;
}

module.exports = { getTickerPrices };