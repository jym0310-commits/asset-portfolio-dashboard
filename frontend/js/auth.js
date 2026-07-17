const AUTH_API_BASE = '/api/auth';

/* ---------------------------------------------------------
   로그인 페이지 (login.html) 전용 로직
--------------------------------------------------------- */
function setupAuthPage() {
  const loginTabBtn = document.getElementById('loginTabBtn');
  const signupTabBtn = document.getElementById('signupTabBtn');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');

  loginTabBtn.addEventListener('click', () => {
    loginTabBtn.classList.add('active');
    signupTabBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  });

  signupTabBtn.addEventListener('click', () => {
    signupTabBtn.classList.add('active');
    loginTabBtn.classList.remove('active');
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  setupTermsAgreement();

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('loginError');
    errorEl.classList.add('hidden');

    const formData = new FormData(loginForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch(`${AUTH_API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || '로그인에 실패했습니다.';
        errorEl.classList.remove('hidden');
        return;
      }

      window.location.href = 'index.html';
    } catch (err) {
      errorEl.textContent = '서버와 통신 중 오류가 발생했습니다.';
      errorEl.classList.remove('hidden');
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('signupError');
    errorEl.classList.add('hidden');

    const requiredCheckboxes = Array.from(document.querySelectorAll('.terms-required'));
    if (!requiredCheckboxes.every((cb) => cb.checked)) {
      errorEl.textContent = '필수 약관에 동의해주세요.';
      errorEl.classList.remove('hidden');
      return;
    }

    const formData = new FormData(signupForm);
    const payload = Object.fromEntries(formData.entries());
    payload.terms_agreed = true;

    try {
      const res = await fetch(`${AUTH_API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || '회원가입에 실패했습니다.';
        errorEl.classList.remove('hidden');
        return;
      }

      window.location.href = 'index.html';
    } catch (err) {
      errorEl.textContent = '서버와 통신 중 오류가 발생했습니다.';
      errorEl.classList.remove('hidden');
    }
  });
}

// "전체 동의" 체크박스와 개별 필수약관 체크박스를 서로 연동하고,
// 필수약관에 전부 동의해야만 회원가입 버튼이 눌리도록 만듭니다.
function setupTermsAgreement() {
  const agreeAll = document.getElementById('agreeAllCheckbox');
  const requiredCheckboxes = Array.from(document.querySelectorAll('.terms-required'));
  const submitBtn = document.getElementById('signupSubmitBtn');

  function updateSubmitState() {
    const allChecked = requiredCheckboxes.every((cb) => cb.checked);
    submitBtn.disabled = !allChecked;
    agreeAll.checked = allChecked;
  }

  agreeAll.addEventListener('change', () => {
    requiredCheckboxes.forEach((cb) => {
      cb.checked = agreeAll.checked;
    });
    updateSubmitState();
  });

  requiredCheckboxes.forEach((cb) => {
    cb.addEventListener('change', updateSubmitState);
  });
}

/* ---------------------------------------------------------
   대시보드(index.html) 전용 로직 — 로그인 여부 확인 + 상단 사용자 표시줄
--------------------------------------------------------- */
async function requireAuthOrRedirect() {
  try {
    const res = await fetch(`${AUTH_API_BASE}/me`);
    if (!res.ok) {
      window.location.href = 'login.html';
      return null;
    }
    return await res.json();
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
}

function setupUserBar(user) {
  const nameEl = document.getElementById('currentUserName');
  if (nameEl) {
    nameEl.textContent = user.display_name || user.email;
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch(`${AUTH_API_BASE}/logout`, { method: 'POST' });
      window.location.href = 'login.html';
    });
  }
}

if (document.getElementById('loginForm')) {
  document.addEventListener('DOMContentLoaded', setupAuthPage);
}