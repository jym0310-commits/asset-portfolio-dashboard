// API는 같은 서버(Express)에서 정적 파일과 함께 서빙되므로 상대경로만 써도 됩니다.
const API_BASE = '/api';

const CATEGORY_COLORS = {
  cash: '#a855f7',
  realEstate: '#ec4899',
  crypto: '#22d3ee',
  stock: '#eab308',
  insurance: '#22c55e',
};

const CATEGORY_LABELS = {
  cash: '현금',
  realEstate: '부동산',
  crypto: '코인',
  stock: '주식',
  insurance: '보험',
};

const SECTOR_COLORS = {
  '배당주': '#3b82f6',
  '기술주': '#f43f5e',
  'S&P500': '#eab308',
  '미분류': '#6b7280',
};

function formatKRW(value) {
  return Math.round(value).toLocaleString('ko-KR');
}

function formatPrice(value, currency) {
  if (currency === 'USD') {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${formatKRW(value)}원`;
}

// 사용자가 입력한 텍스트(계좌명, 종목명 등)를 화면에 그릴 때 스크립트가 실행되지 않도록 이스케이프합니다.
// 공유 기능이 있어서, 다른 사람이 입력한 이름이 내 화면에도 그려질 수 있어 특히 중요합니다.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 각 테이블의 행 데이터를 id로 찾아쓰기 위한 캐시입니다.
// (수정/매도 버튼에서 데이터를 JSON으로 통째로 onclick 속성에 박아넣으면
//  이름에 작은따옴표가 섞였을 때 속성이 깨지면서 스크립트가 삽입될 수 있어, 이 방식으로 피합니다.)
let cashRowCache = {};
let realEstateRowCache = {};
let cryptoRowCache = {};
let holdingsRowCache = {};

/* ---------------------------------------------------------
   차트 인스턴스 (재렌더링 시 destroy 후 재생성하기 위해 보관)
--------------------------------------------------------- */
let allocationChartInstance = null;
let growthChartInstance = null;
let sectorChartInstance = null;
let stockGrowthChartInstance = null;
let stockDetailChartInstance = null;
let stockDetailCurrentRow = null;

/* ---------------------------------------------------------
   상단 요약 카드 + 자산 배분 도넛차트
--------------------------------------------------------- */
/* ---------------------------------------------------------
   상단 시장 지표 티커 (코스피/나스닥/환율/비트코인)
--------------------------------------------------------- */
async function loadMarketTicker() {
  try {
    const res = await fetch('/api/market/overview');
    if (!res.ok) throw new Error('market overview API 응답 오류');
    const data = await res.json();

    renderTickerItem('tickerKospi', data.kospi, (v) =>
      v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
    renderTickerItem(
      'tickerNasdaq',
      data.nasdaq,
      (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      false
    );
    renderTickerItem(
      'tickerUsdKrw',
      data.usdKrw,
      (v) => `${v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`,
      false
    );
    renderTickerItem('tickerBitcoin', data.bitcoin, (v) => `${formatKRW(v)}원`, false);
  } catch (err) {
    console.error('시장 지표 로딩 실패:', err);
  }
}

function renderTickerItem(elementId, info, formatValue, showChange = true) {
  const container = document.getElementById(elementId);
  const valueEl = container.querySelector('.ticker-value');
  const changeEl = container.querySelector('.ticker-change');

  if (!info || info.status !== 'ok') {
    valueEl.textContent = '조회 실패';
    changeEl.textContent = '-';
    changeEl.className = 'ticker-change';
    if (info?.error) {
      console.error(`[${elementId}] 시장 지표 조회 실패:`, info.error);
    }
    return;
  }

  valueEl.textContent = formatValue(info.price);

  if (!showChange || info.change === undefined || info.change === null || Number.isNaN(Number(info.change))) {
    changeEl.textContent = '-';
    changeEl.className = 'ticker-change';
    return;
  }

  const change = Number(info.change);
  const changeRate = Number(info.changeRate);
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '-';
  const sign = change > 0 ? '+' : '';
  changeEl.textContent = `${arrow}${Math.abs(change).toFixed(2)} (${sign}${changeRate.toFixed(2)}%)`;
  changeEl.className = `ticker-change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`;
}

async function loadEconomicCalendar() {
  const valueEl = document.querySelector('#tickerCalendar .ticker-value-calendar');
  try {
    const res = await fetch('/api/economic-calendar?days=14');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '경제일정 API 응답 오류');
    }
    const events = await res.json();

    if (events.length === 0) {
      valueEl.textContent = '예정된 발표 없음';
      valueEl.title = '';
      return;
    }

    const preview = events
      .slice(0, 2)
      .map((e) => {
        const [, month, day] = e.date.split('-');
        return `${Number(month)}/${Number(day)} ${e.title}`;
      })
      .join(' · ');

    const extra = events.length > 2 ? ` 외 ${events.length - 2}건` : '';
    valueEl.textContent = `${preview}${extra}`;
    valueEl.title = events
      .map((e) => {
        const [, month, day] = e.date.split('-');
        return `${Number(month)}/${Number(day)} ${e.title}`;
      })
      .join('\n');
  } catch (err) {
    console.error('경제일정 로딩 실패:', err);
    valueEl.textContent = '불러오기 실패';
    valueEl.title = err.message;
  }
}

/* ---------------------------------------------------------
   연도별 재무 목표
--------------------------------------------------------- */
function setupGoalYearSelect() {
  const select = document.getElementById('goalYearSelect');
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 2; y <= currentYear + 20; y++) {
    years.push(y);
  }
  select.innerHTML = years.map((y) => `<option value="${y}">${y}년</option>`).join('');
  select.value = String(currentYear);
}

// 입력창에 숫자를 입력하는 동안 실시간으로 콤마(1,000단위 구분자)를 붙여줍니다.
function setupGoalInputFormatting() {
  const input = document.getElementById('goalTargetInput');
  input.addEventListener('input', () => {
    const digitsOnly = input.value.replace(/[^0-9]/g, '');
    input.value = digitsOnly ? Number(digitsOnly).toLocaleString('ko-KR') : '';
  });
}

function parseGoalInputValue() {
  const input = document.getElementById('goalTargetInput');
  return Number(input.value.replace(/[^0-9]/g, ''));
}

async function loadFinancialGoal() {
  const select = document.getElementById('goalYearSelect');
  const year = select.value;
  const input = document.getElementById('goalTargetInput');
  const fillEl = document.getElementById('goalProgressFill');
  const textEl = document.getElementById('goalProgressText');

  try {
    const res = await fetch(`${API_BASE}/financial-goals/${year}`);
    if (!res.ok) throw new Error('재무목표 API 응답 오류');
    const data = await res.json();

    input.value = data.target_amount ? Math.round(data.target_amount).toLocaleString('ko-KR') : '';

    if (!data.target_amount) {
      fillEl.style.width = '0%';
      textEl.innerHTML = `현재 자산 <span class="goal-highlight">${formatKRW(data.current_total)}원</span> · 목표를 설정해주세요.`;
      return;
    }

    const rate = Math.max(0, data.progress_rate);
    fillEl.style.width = `${Math.min(rate, 100)}%`;

    if (data.remaining_amount <= 0) {
      textEl.innerHTML = `🎉 목표 달성! 현재 <span class="goal-highlight">${formatKRW(data.current_total)}원</span> (목표 ${formatKRW(data.target_amount)}원, ${rate}%)`;
    } else {
      textEl.innerHTML = `현재 <span class="goal-highlight">${formatKRW(data.current_total)}원</span> / 목표 ${formatKRW(data.target_amount)}원 (${rate}%) · 남은 금액 <span class="goal-highlight">${formatKRW(data.remaining_amount)}원</span>`;
    }
  } catch (err) {
    console.error('재무목표 로딩 실패:', err);
  }
}

async function saveFinancialGoal() {
  const select = document.getElementById('goalYearSelect');
  const year = select.value;
  const targetAmount = parseGoalInputValue();

  if (!targetAmount || targetAmount <= 0) {
    alert('목표 금액을 입력해주세요.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/financial-goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, target_amount: targetAmount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '저장 중 오류가 발생했습니다.');
      return;
    }
    loadFinancialGoal();
  } catch (err) {
    console.error('재무목표 저장 실패:', err);
  }
}

async function loadSummary() {
  try {
    const res = await fetch(`${API_BASE}/summary`);
    if (!res.ok) throw new Error('summary API 응답 오류');
    const data = await res.json();

    document.getElementById('cashValue').innerHTML =
      `${formatKRW(data.cash)}<span class="unit">원</span>`;
    document.getElementById('realEstateValue').innerHTML =
      `${formatKRW(data.realEstate)}<span class="unit">원</span>`;
    document.getElementById('cryptoValue').innerHTML =
      `${formatKRW(data.crypto)}<span class="unit">원</span>`;
    document.getElementById('stockValue').innerHTML =
      `${formatKRW(data.stock)}<span class="unit">원</span>`;

    renderChangeBadge('cashChange', data.changes?.cash);
    renderChangeBadge('realEstateChange', data.changes?.realEstate);
    renderChangeBadge('cryptoChange', data.changes?.crypto);
    renderChangeBadge('stockChange', data.changes?.stock);

    renderAllocationChart(data);
  } catch (err) {
    console.error('요약 카드 로딩 실패:', err);
  }
}

function renderChangeBadge(elementId, changeInfo) {
  const el = document.getElementById(elementId);
  if (!changeInfo || changeInfo.change === null || changeInfo.change === undefined) {
    el.textContent = '-';
    el.className = 'change';
    return;
  }

  const { change, changeRate } = changeInfo;
  if (change === 0) {
    el.textContent = `- (0%)`;
    el.className = 'change';
    return;
  }

  const arrow = change > 0 ? '▲' : '▼';
  el.textContent = `${arrow}${formatKRW(Math.abs(change))} (${Math.abs(changeRate)}%)`;
  el.className = `change ${change > 0 ? 'up' : 'down'}`;
}

function renderAllocationChart(summary) {
  const ctx = document.getElementById('allocationChart');
  const entries = ['cash', 'realEstate', 'crypto', 'stock', 'insurance']
    .map((key) => ({ key, value: summary[key] }))
    .filter((e) => e.value > 0);

  const total = entries.reduce((sum, e) => sum + e.value, 0);

  const centerTextPlugin = {
    id: 'allocationCenterText',
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = '600 13px sans-serif';
      ctx.fillStyle = '#9a9aa8';
      ctx.fillText('자산 합계', centerX, centerY - 14);

      ctx.font = '700 22px sans-serif';
      ctx.fillStyle = '#f5f5f7';
      ctx.fillText(`${formatKRW(total)}원`, centerX, centerY + 12);

      ctx.restore();
    },
  };

  if (allocationChartInstance) {
    allocationChartInstance.destroy();
  }
  allocationChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map((e) => {
        const pct = total > 0 ? ((e.value / total) * 100).toFixed(1) : 0;
        return `${CATEGORY_LABELS[e.key]} ${pct}%`;
      }),
      datasets: [
        {
          data: entries.map((e) => e.value),
          backgroundColor: entries.map((e) => CATEGORY_COLORS[e.key]),
          borderColor: '#16161f',
          borderWidth: 2,
        },
      ],
    },
    plugins: [centerTextPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#f5f5f7', boxWidth: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
              const name = CATEGORY_LABELS[entries[context.dataIndex].key];
              return `${name}: ${formatKRW(context.raw)}원 (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ---------------------------------------------------------
   월별 자산 성장 추이 (스택 막대그래프)
--------------------------------------------------------- */
async function loadNetWorthHistory(days = 365) {
  try {
    const res = await fetch(`${API_BASE}/net-worth-history?days=${days}`);
    if (!res.ok) throw new Error('net-worth-history API 응답 오류');
    const rows = await res.json();
    renderGrowthChart(rows);
  } catch (err) {
    console.error('자산 성장 추이 로딩 실패:', err);
  }
}

function renderGrowthChart(rows) {
  const ctx = document.getElementById('growthChart');

  if (growthChartInstance) {
    growthChartInstance.destroy();
  }
  growthChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.snapshot_date),
      datasets: [
        { label: CATEGORY_LABELS.cash, data: rows.map((r) => r.cash_total), backgroundColor: CATEGORY_COLORS.cash },
        { label: CATEGORY_LABELS.stock, data: rows.map((r) => r.stock_total), backgroundColor: CATEGORY_COLORS.stock },
        { label: CATEGORY_LABELS.realEstate, data: rows.map((r) => r.real_estate_total), backgroundColor: CATEGORY_COLORS.realEstate },
        { label: CATEGORY_LABELS.crypto, data: rows.map((r) => r.crypto_total), backgroundColor: CATEGORY_COLORS.crypto },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: '#9a9aa8', maxTicksLimit: 12 }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#9a9aa8' }, grid: { color: '#262633' } },
      },
      plugins: {
        legend: { labels: { color: '#f5f5f7' } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatKRW(context.raw)}원`,
          },
        },
      },
    },
  });
}

/* ---------------------------------------------------------
   현금 / 부동산 / 코인 테이블 (추가·수정·삭제 버튼 포함)
--------------------------------------------------------- */
async function loadCashTable() {
  try {
    const res = await fetch(`${API_BASE}/cash`);
    if (!res.ok) throw new Error('cash API 응답 오류');
    const rows = await res.json();

    cashRowCache = {};
    rows.forEach((r) => {
      cashRowCache[r.id] = r;
    });

    const tbody = document.querySelector('#cashTable tbody');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-text">데이터가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.account_name)}</td>
          <td>${escapeHtml(r.currency)}</td>
          <td>${formatKRW(r.balance)}</td>
          <td class="action-cell">
            <button class="btn btn-sm btn-edit" onclick="openCashForm(cashRowCache[${r.id}])">수정</button>
            <button class="btn btn-sm btn-danger" onclick="deleteCash(${r.id})">삭제</button>
          </td>
        </tr>`
      )
      .join('');
  } catch (err) {
    console.error('현금 테이블 로딩 실패:', err);
  }
}

async function loadRealEstateTable() {
  try {
    const res = await fetch(`${API_BASE}/real-estate`);
    if (!res.ok) throw new Error('real-estate API 응답 오류');
    const rows = await res.json();

    realEstateRowCache = {};
    rows.forEach((r) => {
      realEstateRowCache[r.id] = r;
    });

    const tbody = document.querySelector('#realEstateTable tbody');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-text">데이터가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.item_name)}</td>
          <td>${escapeHtml(r.currency)}</td>
          <td>${formatKRW(r.balance)}</td>
          <td class="action-cell">
            <button class="btn btn-sm btn-edit" onclick="openRealEstateForm(realEstateRowCache[${r.id}])">수정</button>
            <button class="btn btn-sm btn-danger" onclick="deleteRealEstate(${r.id})">삭제</button>
          </td>
        </tr>`
      )
      .join('');
  } catch (err) {
    console.error('부동산 테이블 로딩 실패:', err);
  }
}

async function loadCryptoTable() {
  try {
    const res = await fetch(`${API_BASE}/holdings?type=crypto`);
    if (!res.ok) throw new Error('holdings(crypto) API 응답 오류');
    const rows = await res.json();

    cryptoRowCache = {};
    rows.forEach((r) => {
      cryptoRowCache[r.id] = r;
    });

    const tbody = document.querySelector('#cryptoTable tbody');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-text">데이터가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.currency)}</td>
          <td>${formatKRW(r.current_total_krw)}</td>
          <td class="action-cell">
            <button class="btn btn-sm btn-ghost" onclick="openStockDetailChart(cryptoRowCache[${r.id}])">차트</button>
            <button class="btn btn-sm btn-primary" onclick="openSellForm(cryptoRowCache[${r.id}])">매도</button>
            <button class="btn btn-sm btn-edit" onclick="openHoldingForm(cryptoRowCache[${r.id}])">수정</button>
            <button class="btn btn-sm btn-danger" onclick="deleteHolding(${r.id})">삭제</button>
          </td>
        </tr>`
      )
      .join('');
  } catch (err) {
    console.error('코인 테이블 로딩 실패:', err);
  }
}

async function loadHoldingsTable(filters = {}) {
  try {
    const { market = 'all', institution = 'all' } = filters;
    const params = new URLSearchParams();
    if (institution !== 'all') params.set('institution', institution);

    let rows = [];
    if (market === 'all') {
      const [domesticRes, overseasRes] = await Promise.all([
        fetch(`${API_BASE}/holdings?type=domestic_stock&${params.toString()}`),
        fetch(`${API_BASE}/holdings?type=overseas_stock&${params.toString()}`),
      ]);
      if (!domesticRes.ok || !overseasRes.ok) throw new Error('holdings API 응답 오류');
      const domestic = await domesticRes.json();
      const overseas = await overseasRes.json();
      rows = [...domestic, ...overseas];
    } else {
      const res = await fetch(`${API_BASE}/holdings?type=${market}&${params.toString()}`);
      if (!res.ok) throw new Error('holdings API 응답 오류');
      rows = await res.json();
    }

    rows.sort((a, b) => b.current_total_krw - a.current_total_krw);

    holdingsRowCache = {};
    rows.forEach((r) => {
      holdingsRowCache[r.id] = r;
    });

    const tbody = document.querySelector('#holdingsTable tbody');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-text">보유 종목이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((r) => {
        const profitClass = r.profit_rate >= 0 ? 'value-up' : 'value-down';
        const sign = r.profit_rate >= 0 ? '+' : '';
        return `<tr>
          <td>${escapeHtml(r.name)}<span class="symbol-sub">${escapeHtml(r.symbol)}${r.institution ? ' · ' + escapeHtml(r.institution) : ''}</span></td>
          <td class="${profitClass}">
            ${sign}${r.profit_rate}%
            <span class="profit-amount">${sign}${formatKRW(r.profit_krw)}원</span>
          </td>
          <td>${formatPrice(r.current_price, r.currency)}</td>
          <td>${formatKRW(r.current_total_krw)}원</td>
          <td>${r.quantity.toLocaleString('ko-KR')}주</td>
          <td class="action-cell">
            <button class="btn btn-sm btn-ghost" onclick="openStockDetailChart(holdingsRowCache[${r.id}])">차트</button>
            <button class="btn btn-sm btn-primary" onclick="openSellForm(holdingsRowCache[${r.id}])">매도</button>
            <button class="btn btn-sm btn-edit" onclick="openHoldingForm(holdingsRowCache[${r.id}])">수정</button>
            <button class="btn btn-sm btn-danger" onclick="deleteHolding(${r.id})">삭제</button>
          </td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    console.error('보유 종목 테이블 로딩 실패:', err);
  }
}

/* ---------------------------------------------------------
   섹터별 도넛차트 / 주식 평가금액 추이 / 매도실현손익 / 총보유현황
--------------------------------------------------------- */
async function loadSectorChart(filters = {}) {
  try {
    const { market = 'all', institution = 'all' } = filters;
    const params = new URLSearchParams({ market, institution });
    const res = await fetch(`${API_BASE}/holdings/sector-breakdown?${params.toString()}`);
    if (!res.ok) throw new Error('sector-breakdown API 응답 오류');
    const rows = await res.json();

    const ctx = document.getElementById('sectorChart');
    if (sectorChartInstance) {
      sectorChartInstance.destroy();
    }
    sectorChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: rows.map((r) => `${r.sector} (${r.ratio}%)`),
        datasets: [
          {
            data: rows.map((r) => r.value),
            backgroundColor: rows.map((r) => SECTOR_COLORS[r.sector] || '#9a9aa8'),
            borderColor: '#16161f',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#f5f5f7', boxWidth: 12, padding: 12 } },
          tooltip: {
            callbacks: {
              label: (context) => `${formatKRW(context.raw)}원`,
            },
          },
        },
      },
    });
  } catch (err) {
    console.error('섹터 차트 로딩 실패:', err);
  }
}

async function loadStockGrowthChart(days = 365) {
  try {
    const res = await fetch(`${API_BASE}/net-worth-history?days=${days}`);
    if (!res.ok) throw new Error('net-worth-history API 응답 오류');
    const rows = await res.json();

    const ctx = document.getElementById('stockGrowthChart');
    if (stockGrowthChartInstance) {
      stockGrowthChartInstance.destroy();
    }
    stockGrowthChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: rows.map((r) => r.snapshot_date),
        datasets: [
          {
            label: '주식 평가금액',
            data: rows.map((r) => r.stock_total),
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.25)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#9a9aa8', maxTicksLimit: 10 }, grid: { display: false } },
          y: { ticks: { color: '#9a9aa8' }, grid: { color: '#262633' } },
        },
        plugins: {
          legend: { labels: { color: '#f5f5f7' } },
          tooltip: {
            callbacks: {
              label: (context) => `${formatKRW(context.raw)}원`,
            },
          },
        },
      },
    });
  } catch (err) {
    console.error('주식 성장 추이 차트 로딩 실패:', err);
  }
}

async function loadRealizedPnl(filters = {}) {
  try {
    const { market = 'all' } = filters;
    const yearSelect = document.getElementById('realizedPnlYearSelect');
    const year = yearSelect && yearSelect.value ? yearSelect.value : new Date().getFullYear();
    const res = await fetch(`${API_BASE}/holdings/realized-pnl?year=${year}&market=${market}`);
    if (!res.ok) throw new Error('realized-pnl API 응답 오류');
    const data = await res.json();

    const el = document.getElementById('realizedPnlValue');
    el.textContent = `${data.realized_pnl >= 0 ? '+' : ''}${formatKRW(data.realized_pnl)}원`;
    el.className = `stat-value ${data.realized_pnl >= 0 ? 'value-up' : 'value-down'}`;
  } catch (err) {
    console.error('매도 실현손익 로딩 실패:', err);
  }
}

async function loadRealizedPnlYears() {
  const select = document.getElementById('realizedPnlYearSelect');
  const currentYear = new Date().getFullYear().toString();
  try {
    const res = await fetch(`${API_BASE}/transactions/sell-years`);
    if (!res.ok) throw new Error('sell-years API 응답 오류');
    const years = await res.json();
    select.innerHTML = years.map((y) => `<option value="${y}">${y}년</option>`).join('');
  } catch (err) {
    console.error('매도 실현손익 연도 목록 로딩 실패:', err);
    select.innerHTML = `<option value="${currentYear}">${currentYear}년</option>`;
  }
}

async function loadStockSummary(filters = {}) {
  try {
    const { market = 'all', institution = 'all' } = filters;
    const params = new URLSearchParams({ market, institution });
    const res = await fetch(`${API_BASE}/holdings/stock-summary?${params.toString()}`);
    if (!res.ok) throw new Error('stock-summary API 응답 오류');
    const data = await res.json();

    document.getElementById('stockSummaryTotal').textContent = `${formatKRW(data.current_total)}원`;
    const profitEl = document.getElementById('stockSummaryProfit');
    const sign = data.profit >= 0 ? '+' : '';
    profitEl.textContent = `${sign}${formatKRW(data.profit)}원 (${sign}${data.profit_rate}%)`;
    profitEl.className = `stat-subvalue ${data.profit >= 0 ? 'value-up' : 'value-down'}`;
  } catch (err) {
    console.error('주식 총보유현황 로딩 실패:', err);
  }
}

async function loadInstitutionOptions() {
  try {
    const res = await fetch(`${API_BASE}/holdings/institutions`);
    if (!res.ok) throw new Error('institutions API 응답 오류');
    const institutions = await res.json();

    const select = document.getElementById('institutionFilter');
    const currentValue = select.value;
    select.innerHTML = '<option value="all">전체</option>';
    institutions.forEach((inst) => {
      const opt = document.createElement('option');
      opt.value = inst;
      opt.textContent = inst;
      select.appendChild(opt);
    });
    if (institutions.includes(currentValue)) {
      select.value = currentValue;
    }
  } catch (err) {
    console.error('증권사 목록 로딩 실패:', err);
  }
}

function getCurrentFilters() {
  return {
    market: document.getElementById('marketFilter').value,
    institution: document.getElementById('institutionFilter').value,
  };
}

function reloadFilteredSections() {
  const filters = getCurrentFilters();
  loadSectorChart(filters);
  loadStockSummary(filters);
  loadRealizedPnl(filters);
  loadHoldingsTable(filters);
}

function setupFilterListeners() {
  document.getElementById('marketFilter').addEventListener('change', reloadFilteredSections);
  document.getElementById('institutionFilter').addEventListener('change', reloadFilteredSections);
}

/* ---------------------------------------------------------
   전체 데이터 갱신 (추가/수정/삭제 후 호출)
--------------------------------------------------------- */
async function refreshAll() {
  loadSummary();
  loadCashTable();
  loadRealEstateTable();
  loadCryptoTable();
  loadNetWorthHistory(Number(document.getElementById('growthRangeSelect').value));
  loadStockGrowthChart(Number(document.getElementById('stockGrowthRangeSelect').value));
  await loadInstitutionOptions();
  reloadFilteredSections();
}

/* ---------------------------------------------------------
   공통 모달 (추가/수정 폼)
--------------------------------------------------------- */
const modalEl = document.getElementById('formModal');
const modalTitleEl = document.getElementById('modalTitle');
const modalBodyEl = document.getElementById('modalBody');
const modalFormEl = document.getElementById('modalForm');
let modalSubmitHandler = null;

function openModal(title, fieldsHtml, onSubmit) {
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = fieldsHtml;
  modalSubmitHandler = onSubmit;
  modalEl.classList.remove('hidden');
}

function closeModal() {
  modalEl.classList.add('hidden');
  modalSubmitHandler = null;
}

modalFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (modalSubmitHandler) {
    const formData = new FormData(modalFormEl);
    await modalSubmitHandler(formData);
  }
});

document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

/* ---------------------------------------------------------
   현금 계좌 추가/수정/삭제
--------------------------------------------------------- */
function openCashForm(row) {
  const isEdit = !!row;
  const fieldsHtml = `
    <div class="form-field">
      <label>계좌명</label>
      <input name="account_name" required value="${isEdit ? escapeHtml(row.account_name) : ''}">
    </div>
    <div class="form-field">
      <label>기관</label>
      <input name="institution" value="${isEdit ? escapeHtml(row.institution || '') : ''}">
    </div>
    <div class="form-field">
      <label>통화</label>
      <input name="currency" required value="${isEdit ? escapeHtml(row.currency) : 'KRW'}">
    </div>
    <div class="form-field">
      <label>잔액</label>
      <input name="balance" type="number" step="1" required value="${isEdit ? row.balance : 0}">
    </div>
  `;

  openModal(isEdit ? '현금 계좌 수정' : '현금 계좌 추가', fieldsHtml, async (formData) => {
    const payload = Object.fromEntries(formData.entries());
    payload.balance = Number(payload.balance);

    const url = isEdit ? `${API_BASE}/cash/${row.id}` : `${API_BASE}/cash`;
    const method = isEdit ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    closeModal();
    refreshAll();
  });
}

async function deleteCash(id) {
  if (!confirm('이 현금 계좌를 삭제하시겠습니까?')) return;
  await fetch(`${API_BASE}/cash/${id}`, { method: 'DELETE' });
  refreshAll();
}

/* ---------------------------------------------------------
   부동산 추가/수정/삭제
--------------------------------------------------------- */
function openRealEstateForm(row) {
  const isEdit = !!row;
  const fieldsHtml = `
    <div class="form-field">
      <label>항목명</label>
      <input name="item_name" required value="${isEdit ? escapeHtml(row.item_name) : ''}">
    </div>
    <div class="form-field">
      <label>통화</label>
      <input name="currency" required value="${isEdit ? escapeHtml(row.currency) : 'KRW'}">
    </div>
    <div class="form-field">
      <label>잔액</label>
      <input name="balance" type="number" step="1" required value="${isEdit ? row.balance : 0}">
    </div>
  `;

  openModal(isEdit ? '부동산 항목 수정' : '부동산 항목 추가', fieldsHtml, async (formData) => {
    const payload = Object.fromEntries(formData.entries());
    payload.balance = Number(payload.balance);

    const url = isEdit ? `${API_BASE}/real-estate/${row.id}` : `${API_BASE}/real-estate`;
    const method = isEdit ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    closeModal();
    refreshAll();
  });
}

async function deleteRealEstate(id) {
  if (!confirm('이 부동산 항목을 삭제하시겠습니까?')) return;
  await fetch(`${API_BASE}/real-estate/${id}`, { method: 'DELETE' });
  refreshAll();
}

/* ---------------------------------------------------------
   보유 종목(주식/코인) 추가/수정/삭제
--------------------------------------------------------- */
function openHoldingForm(row, defaultAssetType) {
  const isEdit = !!row;
  const assetType = isEdit ? row.asset_type : (defaultAssetType || 'domestic_stock');
  const today = new Date().toISOString().slice(0, 10);

  const exchangeOptions = [
    { value: '', label: '선택 안함' },
    { value: 'NAS', label: 'NAS (나스닥)' },
    { value: 'NYS', label: 'NYS (뉴욕)' },
    { value: 'AMS', label: 'AMS (아멕스)' },
  ];
  const currentExchange = isEdit ? (row.exchange || '') : '';

  const currencyOptions = ['KRW', 'USD'];
  const currentCurrency = isEdit ? row.currency : (assetType === 'overseas_stock' ? 'USD' : 'KRW');

  const fieldsHtml = `
    <div class="form-field">
      <label>종목코드 (symbol)</label>
      <input name="symbol" required value="${isEdit ? escapeHtml(row.symbol) : ''}" ${isEdit ? 'readonly' : ''}>
      <p class="field-hint" id="symbolHint"></p>
    </div>
    <div class="form-field">
      <label>종목명</label>
      <input name="name" required value="${isEdit ? escapeHtml(row.name) : ''}">
    </div>
    <div class="form-field">
      <label>구분</label>
      <select name="asset_type" id="assetTypeSelect" ${isEdit ? 'disabled' : ''}>
        <option value="domestic_stock" ${assetType === 'domestic_stock' ? 'selected' : ''}>국내 주식</option>
        <option value="overseas_stock" ${assetType === 'overseas_stock' ? 'selected' : ''}>해외 주식</option>
        <option value="crypto" ${assetType === 'crypto' ? 'selected' : ''}>코인</option>
      </select>
    </div>
    <div class="form-field">
      <label>매수일 (자산 변화 추적 시작 기준)</label>
      <input name="purchase_date" type="date" required value="${isEdit ? (row.purchase_date || today) : today}">
    </div>
    <div class="form-field">
      <label>섹터 (선택, 예: 배당주/기술주/S&P500)</label>
      <input name="sector" value="${isEdit ? escapeHtml(row.sector || '') : ''}">
    </div>
    <div class="form-field">
      <label>증권사/거래소 (한국투자증권 등)</label>
      <input name="institution" value="${isEdit ? escapeHtml(row.institution || '') : ''}">
    </div>
    <div class="form-field">
      <label>해외거래소 코드 (해외주식만)</label>
      <select name="exchange" id="exchangeSelect">
        ${exchangeOptions
          .map(
            (o) =>
              `<option value="${o.value}" ${o.value === currentExchange ? 'selected' : ''}>${o.label}</option>`
          )
          .join('')}
      </select>
    </div>
    <div class="form-field">
      <label>수량</label>
      <input name="quantity" type="number" step="any" required value="${isEdit ? row.quantity : 0}">
    </div>
    <div class="form-field">
      <label>평단가 (매수 원가)</label>
      <input name="avg_price" type="number" step="any" required value="${isEdit ? row.avg_price : 0}">
    </div>
    <div class="form-field">
      <label>통화</label>
      <select name="currency" id="currencySelect" required>
        ${currencyOptions
          .map((c) => `<option value="${c}" ${c === currentCurrency ? 'selected' : ''}>${c}</option>`)
          .join('')}
      </select>
    </div>
  `;

  openModal(isEdit ? '보유 종목 수정' : '보유 종목 추가', fieldsHtml, async (formData) => {
    const payload = Object.fromEntries(formData.entries());
    payload.quantity = Number(payload.quantity);
    payload.avg_price = Number(payload.avg_price);
    if (isEdit) {
      payload.asset_type = row.asset_type; // 수정 시 구분은 변경 불가(select disabled라 폼에 안 실려서 직접 추가)
    }

    const url = isEdit ? `${API_BASE}/holdings/${row.id}` : `${API_BASE}/holdings`;
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '저장 중 오류가 발생했습니다.');
      return;
    }

    const data = await res.json().catch(() => ({}));
    closeModal();

    if (!isEdit && data.merged) {
      alert(
        `이미 보유중인 종목이라 합산했어요.\n합산 후 수량: ${data.quantity}\n합산 후 평단가: ${data.avg_price}`
      );
    }

    refreshAll();
  });

  // 종목 구분(국내/해외/코인)에 따라 종목코드 입력 힌트를 다르게 보여줍니다.
  const assetTypeSelect = document.getElementById('assetTypeSelect');
  const symbolHint = document.getElementById('symbolHint');

  function updateSymbolHint() {
    const v = assetTypeSelect.value;
    if (v === 'domestic_stock') {
      symbolHint.textContent = '국내 주식: 종목코드 6자리 (예: 005930)';
    } else if (v === 'overseas_stock') {
      symbolHint.textContent = '해외 주식: 티커 심볼 (예: GOOGL, AAPL)';
    } else if (v === 'crypto') {
      symbolHint.textContent =
        '코인: "KRW-" 접두사를 꼭 붙여주세요 (예: KRW-BTC, KRW-ETH). "BTC"만 입력하면 시세를 못 가져와요.';
    }
  }

  updateSymbolHint();
  assetTypeSelect.addEventListener('change', updateSymbolHint);
}

async function deleteHolding(id) {
  if (!confirm('이 보유 종목을 삭제하시겠습니까?')) return;
  await fetch(`${API_BASE}/holdings/${id}`, { method: 'DELETE' });
  refreshAll();
}

/* ---------------------------------------------------------
   포트폴리오 공유 / 전환
--------------------------------------------------------- */
async function loadPortfolioSwitcher() {
  const select = document.getElementById('portfolioSwitchSelect');
  try {
    const [sharedRes, activeRes] = await Promise.all([
      fetch('/api/shares/shared-with-me'),
      fetch('/api/shares/active'),
    ]);
    const shared = await sharedRes.json();
    const active = await activeRes.json();

    const options = [`<option value="me">내 포트폴리오</option>`];
    shared.forEach((s) => {
      options.push(
        `<option value="${s.owner_id}">${escapeHtml(s.display_name || s.email)}님의 포트폴리오</option>`
      );
    });
    select.innerHTML = options.join('');
    select.value = active.isOwn ? 'me' : String(active.ownerId);
  } catch (err) {
    console.error('포트폴리오 목록 로딩 실패:', err);
  }
}

async function switchPortfolio(value) {
  const ownerId = value === 'me' ? null : Number(value);
  try {
    const res = await fetch('/api/shares/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '포트폴리오 전환 중 오류가 발생했습니다.');
      return;
    }
    // 화면 전체를 다시 불러오는 게 가장 안전해서 새로고침합니다.
    window.location.reload();
  } catch (err) {
    console.error('포트폴리오 전환 실패:', err);
  }
}

function openShareModal() {
  const fieldsHtml = `
    <div class="form-field">
      <label>공유할 사람 이메일</label>
      <input name="email" type="email" required placeholder="example@email.com">
    </div>
    <div id="shareListContainer" class="share-list"></div>
  `;

  openModal('포트폴리오 공유', fieldsHtml, async (formData) => {
    const email = formData.get('email');

    const res = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || '공유 중 오류가 발생했습니다.');
      return;
    }

    modalFormEl.reset();
    renderShareList();
  });

  renderShareList();
}

async function renderShareList() {
  const container = document.getElementById('shareListContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/shares/my-shares');
    const rows = await res.json();

    if (rows.length === 0) {
      container.innerHTML = '<p class="loading-text">아직 공유한 사람이 없어요.</p>';
      return;
    }

    container.innerHTML = rows
      .map(
        (r) => `<div class="share-item">
          <span>${escapeHtml(r.display_name || r.email)}</span>
          <button type="button" class="btn btn-sm btn-danger" onclick="revokeShare(${r.id})">취소</button>
        </div>`
      )
      .join('');
  } catch (err) {
    console.error('공유 목록 로딩 실패:', err);
  }
}

async function revokeShare(id) {
  if (!confirm('공유를 취소하시겠습니까?')) return;
  await fetch(`/api/shares/${id}`, { method: 'DELETE' });
  renderShareList();
}

/* ---------------------------------------------------------
   매도 등록
--------------------------------------------------------- */
function openSellForm(row) {
  const today = new Date().toISOString().slice(0, 10);

  const fieldsHtml = `
    <div class="form-field">
      <label>종목</label>
      <input value="${escapeHtml(row.name)} (${escapeHtml(row.symbol)})" disabled>
    </div>
    <div class="form-field">
      <label>보유 수량</label>
      <input value="${row.quantity}" disabled>
    </div>
    <div class="form-field">
      <label>매도 수량</label>
      <input name="quantity" type="number" step="any" min="0" max="${row.quantity}" required value="${row.quantity}">
    </div>
    <div class="form-field">
      <label>매도 단가 (${escapeHtml(row.currency)})</label>
      <input name="price" type="number" step="any" required value="${row.current_price}">
    </div>
    <div class="form-field">
      <label>매도 일자</label>
      <input name="trade_date" type="date" required value="${today}">
    </div>
  `;

  openModal(`매도 등록 - ${row.name}`, fieldsHtml, async (formData) => {
    const payload = Object.fromEntries(formData.entries());
    payload.holding_id = row.id;
    payload.quantity = Number(payload.quantity);
    payload.price = Number(payload.price);

    const res = await fetch(`${API_BASE}/transactions/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '매도 등록 중 오류가 발생했습니다.');
      return;
    }

    const data = await res.json();
    closeModal();
    alert(
      `매도가 등록됐어요.\n실현손익: ${data.realized_pnl >= 0 ? '+' : ''}${formatKRW(data.realized_pnl)}원\n남은 수량: ${data.remaining_quantity}`
    );
    refreshAll();
  });
}

/* ---------------------------------------------------------
   종목별 상세 가격 차트
--------------------------------------------------------- */
function openStockDetailChart(row) {
  stockDetailCurrentRow = row;
  document.getElementById('chartModalTitle').textContent = `${row.name} (${row.symbol})`;
  document.getElementById('chartModal').classList.remove('hidden');

  const days = Number(document.getElementById('stockDetailRangeSelect').value);
  loadStockDetailChart(row, days);
}

function closeStockDetailChart() {
  document.getElementById('chartModal').classList.add('hidden');
  if (stockDetailChartInstance) {
    stockDetailChartInstance.destroy();
    stockDetailChartInstance = null;
  }
  stockDetailCurrentRow = null;
}

async function loadStockDetailChart(row, days) {
  try {
    const params = new URLSearchParams({ assetType: row.asset_type, days });
    const res = await fetch(`${API_BASE}/holdings/${encodeURIComponent(row.symbol)}/price-history?${params.toString()}`);
    if (!res.ok) throw new Error('price-history API 응답 오류');
    const rows = await res.json();

    const ctx = document.getElementById('stockDetailChart');
    if (stockDetailChartInstance) {
      stockDetailChartInstance.destroy();
    }

    if (rows.length === 0) {
      stockDetailChartInstance = null;
      ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
      return;
    }

    stockDetailChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: rows.map((r) => r.date),
        datasets: [
          {
            label: '종가',
            data: rows.map((r) => r.close_price),
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#9a9aa8', maxTicksLimit: 10 }, grid: { display: false } },
          y: { ticks: { color: '#9a9aa8' }, grid: { color: '#262633' } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => formatPrice(context.raw, row.currency),
            },
          },
        },
      },
    });
  } catch (err) {
    console.error('종목 상세 차트 로딩 실패:', err);
  }
}


/* ---------------------------------------------------------
   거래내역(매수/매도) 히스토리
--------------------------------------------------------- */
function openTransactionHistory() {
  document.getElementById('txHistoryModal').classList.remove('hidden');
  loadTransactionHistory();
}

function closeTransactionHistory() {
  document.getElementById('txHistoryModal').classList.add('hidden');
}

async function loadTransactionHistory() {
  const tbody = document.querySelector('#txHistoryTable tbody');
  const tradeType = document.getElementById('txTypeFilter').value;
  const assetType = document.getElementById('txAssetTypeFilter').value;

  const params = new URLSearchParams();
  if (tradeType !== 'all') params.set('tradeType', tradeType);
  if (assetType !== 'all') params.set('assetType', assetType);

  try {
    const res = await fetch(`${API_BASE}/transactions?${params.toString()}`);
    if (!res.ok) throw new Error('거래내역 API 응답 오류');
    const rows = await res.json();

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-text">거래내역이 없어요.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((t) => {
        const currency = t.asset_type === 'overseas_stock' ? 'USD' : 'KRW';
        const isBuy = t.trade_type === 'buy';
        const badge = isBuy
          ? '<span class="trade-type-badge buy">매수</span>'
          : '<span class="trade-type-badge sell">매도</span>';
        const displayName = t.holding_name ? escapeHtml(t.holding_name) : escapeHtml(t.symbol);
        const pnlCell =
          t.trade_type === 'sell' && t.realized_pnl !== null
            ? `<span class="${t.realized_pnl >= 0 ? 'value-up' : 'value-down'}">${t.realized_pnl >= 0 ? '+' : ''}${formatKRW(t.realized_pnl)}원</span>`
            : '-';

        return `<tr>
          <td>${t.trade_date}</td>
          <td>${displayName}<span class="symbol-sub">${escapeHtml(t.symbol)}</span></td>
          <td>${badge}</td>
          <td>${t.quantity.toLocaleString('ko-KR')}</td>
          <td>${formatPrice(t.price, currency)}</td>
          <td>${pnlCell}</td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    console.error('거래내역 로딩 실패:', err);
    tbody.innerHTML = '<tr><td colspan="6" class="loading-text">불러오지 못했어요.</td></tr>';
  }
}

/* ---------------------------------------------------------
   초기화
--------------------------------------------------------- */
async function refreshLivePrices() {
  const btn = document.getElementById('refreshPricesBtn');
  const originalText = btn.textContent;
  btn.textContent = '새로고침 중...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/holdings/refresh-prices`, { method: 'POST' });
    const data = await res.json();

    renderRefreshResults(data.results);

    const now = new Date();
    document.getElementById('lastRefreshedAt').textContent =
      `마지막 새로고침: ${now.toLocaleString('ko-KR')}`;

    const failed = data.results.filter((r) => r.status === 'error');
    if (failed.length > 0) {
      console.error('일부 종목 시세 갱신 실패:', failed);
    }

    await refreshAll();
  } catch (err) {
    console.error('시세 새로고침 실패:', err);
    alert('시세 새로고침 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function renderRefreshResults(results) {
  const panel = document.getElementById('refreshResultsPanel');
  const body = document.getElementById('refreshResultsBody');
  const toggleBtn = document.getElementById('toggleRefreshResultsBtn');
  const tbody = document.querySelector('#refreshResultsTable tbody');

  panel.classList.remove('hidden');
  body.classList.remove('hidden');
  toggleBtn.textContent = '접기';

  tbody.innerHTML = results
    .map((r) => {
      if (r.status === 'ok') {
        return `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.symbol)}</td>
          <td>${formatPrice(r.price, r.currency)}</td>
          <td class="value-up">성공</td>
        </tr>`;
      }
      return `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.symbol)}</td>
        <td>-</td>
        <td class="value-down" title="${escapeHtml(r.error || '')}">실패</td>
      </tr>`;
    })
    .join('');
}

function setupRefreshResultsToggle() {
  const toggleBtn = document.getElementById('toggleRefreshResultsBtn');
  const body = document.getElementById('refreshResultsBody');

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = body.classList.toggle('hidden');
    toggleBtn.textContent = isCollapsed ? '펼치기' : '접기';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuthOrRedirect();
  if (!user) return; // 로그인 안 되어있으면 이미 login.html로 이동됨
  setupUserBar(user);
  await loadPortfolioSwitcher();

  document.getElementById('portfolioSwitchSelect').addEventListener('change', (e) => {
    switchPortfolio(e.target.value);
  });
  document.getElementById('shareBtn').addEventListener('click', openShareModal);

  loadMarketTicker();
  loadEconomicCalendar();
  loadSummary();
  setupGoalYearSelect();
  setupGoalInputFormatting();
  loadFinancialGoal();
  loadNetWorthHistory();
  loadCashTable();
  loadRealEstateTable();
  loadCryptoTable();
  loadStockGrowthChart();

  await loadInstitutionOptions();
  await loadRealizedPnlYears();
  setupFilterListeners();
  reloadFilteredSections();

  document.getElementById('addCashBtn').addEventListener('click', () => openCashForm(null));
  document.getElementById('addRealEstateBtn').addEventListener('click', () => openRealEstateForm(null));
  document.getElementById('addCryptoBtn').addEventListener('click', () => openHoldingForm(null, 'crypto'));
  document.getElementById('addStockBtn').addEventListener('click', () => openHoldingForm(null, 'domestic_stock'));
  document.getElementById('refreshPricesBtn').addEventListener('click', refreshLivePrices);
  document.getElementById('txHistoryBtn').addEventListener('click', openTransactionHistory);
  document.getElementById('txHistoryCloseBtn').addEventListener('click', closeTransactionHistory);
  document.getElementById('txTypeFilter').addEventListener('change', loadTransactionHistory);
  document.getElementById('txAssetTypeFilter').addEventListener('change', loadTransactionHistory);
  document.getElementById('exportHoldingsBtn').addEventListener('click', exportHoldingsCsv);
 document.getElementById('exportTxHistoryBtn').addEventListener('click', exportTransactionsCsv);

  setupRefreshResultsToggle();

  document.getElementById('growthRangeSelect').addEventListener('change', (e) => {
    loadNetWorthHistory(Number(e.target.value));
  });

  document.getElementById('goalYearSelect').addEventListener('change', loadFinancialGoal);
  document.getElementById('goalSaveBtn').addEventListener('click', saveFinancialGoal);

  document.getElementById('chartModalCloseBtn').addEventListener('click', closeStockDetailChart);
  document.getElementById('stockDetailRangeSelect').addEventListener('change', (e) => {
    if (stockDetailCurrentRow) {
      loadStockDetailChart(stockDetailCurrentRow, Number(e.target.value));
    }
  });

  document.getElementById('stockGrowthRangeSelect').addEventListener('change', (e) => {
    loadStockGrowthChart(Number(e.target.value));
  });

  document.getElementById('realizedPnlYearSelect').addEventListener('change', () => {
    loadRealizedPnl(getCurrentFilters());
  });
});

/* ---------------------------------------------------------
   CSV 내보내기
--------------------------------------------------------- */
function exportHoldingsCsv() {
  window.location.href = `${API_BASE}/export/holdings`;
}

function exportTransactionsCsv() {
  const tradeType = document.getElementById('txTypeFilter').value;
  const assetType = document.getElementById('txAssetTypeFilter').value;
  const params = new URLSearchParams();
  if (tradeType !== 'all') params.set('tradeType', tradeType);
  if (assetType !== 'all') params.set('assetType', assetType);
  window.location.href = `${API_BASE}/export/transactions?${params.toString()}`;
}