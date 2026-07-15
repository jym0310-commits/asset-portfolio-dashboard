// transactions.js - 거래 이력 페이지 로직
const API_BASE = '/api';

function formatKRW(value) {
  return Math.round(value).toLocaleString('ko-KR');
}

function formatPrice(value, currency) {
  if (currency === 'USD') {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${formatKRW(value)}원`;
}

async function loadTransactions() {
  const assetType = document.getElementById('assetTypeFilter').value;
  const q = assetType ? `?assetType=${encodeURIComponent(assetType)}` : '';
  try {
    const res = await fetch(`${API_BASE}/transactions/history${q}`);
    if (!res.ok) throw new Error('거래 이력 API 오류');
    const rows = await res.json();
    renderTable(rows);
  } catch (err) {
    console.error(err);
    const tbody = document.querySelector('#txTable tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-text">불러오기 실패</td></tr>`;
  }
}

function renderTable(rows) {
  const tbody = document.querySelector('#txTable tbody');
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search));
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-text">조회된 거래가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered
    .map((r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.symbol)}</td>
        <td>${r.trade_type === 'buy' ? '매수' : '매도'}</td>
        <td>${Number(r.quantity).toLocaleString()}</td>
        <td>${formatPrice(r.price, r.currency || 'KRW')}</td>
        <td>${r.realized_pnl !== null && r.realized_pnl !== undefined ? formatKRW(r.realized_pnl) + '원' : '-'}</td>
        <td>${(r.trade_date || r.created_at || '').slice(0, 10)}</td>
      </tr>
    `)
    .join('');
}

function escapeHtml(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

document.getElementById('assetTypeFilter').addEventListener('change', loadTransactions);
document.getElementById('searchInput').addEventListener('input', loadTransactions);

loadTransactions();
