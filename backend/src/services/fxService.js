const FX_API_URL = 'https://open.er-api.com/v6/latest/USD';

async function getUsdKrwRate() {
  const res = await fetch(FX_API_URL);

  if (!res.ok) {
    throw new Error(`환율 조회 실패 (${res.status})`);
  }

  const data = await res.json();
  const rate = data?.rates?.KRW;

  if (!rate) {
    throw new Error('환율 응답에 KRW 값이 없습니다.');
  }

  return rate;
}

module.exports = { getUsdKrwRate };