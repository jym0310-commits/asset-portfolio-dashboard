const AUTH_API_BASE = '/api/auth';

/* ---------------------------------------------------------
   로그인 페이지 (login.html) 전용 로직
--------------------------------------------------------- */
function setupAuthPage() {
  const loginTabBtn = document.getElementById('loginTabBtn');
  const signupTabBtn = document.getElementById('signupTabBtn');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const forgotForm = document.getElementById('forgotForm');
  const forgotPasswordRow = document.getElementById('forgotPasswordRow');
  const authTabs = document.querySelector('.auth-tabs');

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

  document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    authTabs.classList.add('hidden');
    loginForm.classList.add('hidden');
    signupForm.classList.add('hidden');
    forgotPasswordRow.classList.add('hidden');
    forgotForm.classList.remove('hidden');
  });

  document.getElementById('backToLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    forgotForm.classList.add('hidden');
    authTabs.classList.remove('hidden');
    forgotPasswordRow.classList.remove('hidden');
    loginTabBtn.click();
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

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('forgotError');
    const successEl = document.getElementById('forgotSuccess');
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const formData = new FormData(forgotForm);
    const payload = Object.fromEntries(formData.entries());
    const submitBtn = forgotForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const res = await fetch(`${AUTH_API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || '요청 처리 중 오류가 발생했습니다.';
        errorEl.classList.remove('hidden');
        return;
      }

      successEl.textContent = data.message || '가입된 이메일이면 재설정 링크를 보내드렸어요. 메일함(스팸함 포함)을 확인해주세요.';
      successEl.classList.remove('hidden');
      forgotForm.reset();
    } catch (err) {
      errorEl.textContent = '서버와 통신 중 오류가 발생했습니다.';
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
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

/* ---------------------------------------------------------
   비밀번호 재설정 페이지 (reset-password.html) 전용 로직
--------------------------------------------------------- */
function setupResetPasswordPage() {
  const form = document.getElementById('resetForm');
  const errorEl = document.getElementById('resetError');
  const successEl = document.getElementById('resetSuccess');

  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const email = urlParams.get('email');

  if (!token || !email) {
    form.classList.add('hidden');
    errorEl.textContent = '유효하지 않은 재설정 링크예요. 이메일에 있는 링크를 다시 확인해주세요.';
    errorEl.classList.remove('hidden');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const formData = new FormData(form);
    const newPassword = formData.get('new_password');
    const newPasswordConfirm = formData.get('new_password_confirm');

    if (newPassword !== newPasswordConfirm) {
      errorEl.textContent = '두 비밀번호가 서로 달라요.';
      errorEl.classList.remove('hidden');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const res = await fetch(`${AUTH_API_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, new_password: newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || '비밀번호 재설정에 실패했습니다.';
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        return;
      }

      successEl.textContent = '비밀번호가 변경됐어요. 새 비밀번호로 로그인해주세요.';
      successEl.classList.remove('hidden');
      form.classList.add('hidden');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 2000);
    } catch (err) {
      errorEl.textContent = '서버와 통신 중 오류가 발생했습니다.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
}

if (document.getElementById('loginForm')) {
  document.addEventListener('DOMContentLoaded', setupAuthPage);
}

if (document.getElementById('resetForm')) {
  document.addEventListener('DOMContentLoaded', setupResetPasswordPage);
}