const STOOQ_URL = 'https://stooq.com/q/l/?s=%5Eixic&f=sd2t2ohlcv&h&e=csv';

async function getNasdaqIndex() {
  const res = await fetch(STOOQ_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`나스닥 지수 조회 실패 (${res.status})`);
  }

  const text = await res.text();
  const lines = text.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('나스닥 지수 응답 형식이 예상과 다릅니다.');
  }

  const columns = lines[1].split(',');
  const close = Number(columns[6]);

  if (!close) {
    throw new Error('나스닥 지수 응답에 종가 값이 없습니다.');
  }

  return { price: close };
}

module.exports = { getNasdaqIndex };