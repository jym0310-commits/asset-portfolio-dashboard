require('dotenv').config();

const FRED_API_KEY = process.env.FRED_API_KEY;
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/releases/dates';

const RELEASE_NAME_KO = {
  'Employment Situation': '고용동향',
  'Consumer Price Index': '소비자물가지수(CPI)',
  'Producer Price Index': '생산자물가지수(PPI)',
  'Gross Domestic Product': 'GDP(국내총생산)',
  'Existing Home Sales': '기존주택 매매건수',
  'New Residential Sales': '신규주택 판매',
  'New Residential Construction': '신규 주택착공',
  'Unemployment Insurance Weekly Claims Report': '신규실업수당청구건수',
  'Personal Income and Outlays': '개인소득 및 소비지출',
  'Advance Monthly Sales for Retail and Food Services': '소매판매(속보치)',
  'Industrial Production and Capacity Utilization': '산업생산·설비가동률',
  'Housing Starts': '주택착공건수',
  'ISM Manufacturing Report On Business': 'ISM 제조업지수',
  'Consumer Confidence Survey': '소비자신뢰지수',
  'University of Michigan Surveys of Consumers': '미시간대 소비자심리지수',
};

function translateReleaseName(name) {
  const matched = Object.keys(RELEASE_NAME_KO).find((en) => name.includes(en));
  return matched ? `${RELEASE_NAME_KO[matched]} 발표` : null;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

async function getUpcomingEconomicEvents(daysAhead = 14) {
  if (!FRED_API_KEY) {
    throw new Error('.env 파일에 FRED_API_KEY가 설정되어 있지 않습니다.');
  }

  const today = new Date();
  const end = new Date();
  end.setDate(end.getDate() + daysAhead);

  const params = new URLSearchParams({
    realtime_start: formatDate(today),
    realtime_end: formatDate(end),
    include_release_dates_with_no_data: 'false',
    file_type: 'json',
    api_key: FRED_API_KEY,
    sort_order: 'asc',
    limit: '1000',
  });

  const res = await fetch(`${FRED_BASE_URL}?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`FRED API 조회 실패 (${res.status})`);
  }

  const data = await res.json();
  const rows = data.release_dates || [];

  const events = [];
  rows.forEach((r) => {
    const title = translateReleaseName(r.release_name);
    if (title) {
      events.push({ date: r.date, title });
    }
  });

  const unique = Array.from(new Map(events.map((e) => [`${e.date}_${e.title}`, e])).values());
  unique.sort((a, b) => a.date.localeCompare(b.date));

  return unique;
}

module.exports = { getUpcomingEconomicEvents };