const AUTH_API_BASE = '/api/auth';

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

    const formData = new FormData(signupForm);
    const payload = Object.fromEntries(formData.entries());

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