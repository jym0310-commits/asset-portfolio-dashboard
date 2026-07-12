require('dotenv').config();

const isVirtual = String(process.env.KIS_IS_VIRTUAL).toLowerCase() === 'true';
const BASE_URL = isVirtual
  ? 'https://openapivts.koreainvestment.com:29443'
  : 'https://openapi.koreainvestment.com:9443';

const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenRequestPromise = null;

function assertCredentials() {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('.env 파일에 KIS_APP_KEY / KIS_APP_SECRET이 설정되어 있지 않습니다.');
  }
}

async function getAccessToken() {
  assertCredentials();

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  if (tokenRequestPromise) {
    return tokenRequestPromise;
  }

  tokenRequestPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: APP_KEY,
          appsecret: APP_SECRET,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`KIS 접근토큰 발급 실패 (${res.status}): ${text}`);
      }

      const data = await res.json();
      if (!data.access_token) {
        throw new Error(`KIS 접근토큰 응답이 올바르지 않습니다: ${JSON.stringify(data)}`);
      }

      cachedToken = data.access_token;
      tokenExpiresAt = Date.now() + (Number(data.expires_in) - 300) * 1000;

      return cachedToken;
    } finally {
      tokenRequestPromise = null;
    }
  })();

  return tokenRequestPromise;
}

async function getDomesticPrice(symbol) {
  const token = await getAccessToken();
  const url = `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${symbol}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'FHKST01010100',
    },
  });

  if (!res.ok) {
    throw new Error(`국내주식 시세 조회 실패 (${symbol}, ${res.status})`);
  }

  const data = await res.json();
  const price = Number(data?.output?.stck_prpr);
  if (!price) {
    throw new Error(`국내주식 시세 응답 형식이 예상과 다릅니다 (${symbol})`);
  }
  return price;
}

async function getOverseasPrice(symbol, exchange = 'NAS') {
  const token = await getAccessToken();
  const url = `${BASE_URL}/uapi/overseas-price/v1/quotations/price?AUTH=&EXCD=${exchange}&SYMB=${symbol}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'HHDFS00000300',
    },
  });

  if (!res.ok) {
    throw new Error(`해외주식 시세 조회 실패 (${symbol}, ${res.status})`);
  }

  const data = await res.json();
  const price = Number(data?.output?.last);
  if (!price) {
    throw new Error(`해외주식 시세 응답 형식이 예상과 다릅니다 (${symbol})`);
  }
  return price;
}

async function getDomesticIndex(indexCode = '0001') {
  const token = await getAccessToken();
  const url = `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=${indexCode}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'FHPUP02100000',
    },
  });

  if (!res.ok) {
    throw new Error(`국내 지수 조회 실패 (${indexCode}, ${res.status})`);
  }

  const data = await res.json();
  const price = Number(data?.output?.bstp_nmix_prpr);
  const change = Number(data?.output?.bstp_nmix_prdy_vrss);
  const changeRate = Number(data?.output?.bstp_nmix_prdy_ctrt);

  if (!price) {
    throw new Error(`국내 지수 응답 형식이 예상과 다릅니다 (${indexCode})`);
  }

  return { price, change, changeRate };
}

async function getOverseasIndex(symbol = 'COMP', exchange = 'NAS') {
  const token = await getAccessToken();
  const url = `${BASE_URL}/uapi/overseas-price/v1/quotations/price?AUTH=&EXCD=${exchange}&SYMB=${symbol}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'HHDFS00000300',
    },
  });

  if (!res.ok) {
    throw new Error(`해외 지수 조회 실패 (${symbol}, ${res.status})`);
  }

  const data = await res.json();
  const price = Number(data?.output?.last);
  const change = Number(data?.output?.diff);
  const changeRate = Number(data?.output?.rate);

  if (!price) {
    throw new Error(`해외 지수 응답 형식이 예상과 다릅니다 (${symbol})`);
  }

  return { price, change, changeRate };
}

module.exports = {
  getAccessToken,
  getDomesticPrice,
  getOverseasPrice,
  getDomesticIndex,
  getOverseasIndex,
};