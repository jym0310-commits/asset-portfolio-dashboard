const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { sendPasswordResetEmail } = require('../services/emailService');

// POST /api/auth/signup - 회원가입
router.post('/signup', (req, res) => {
  const { email, password, display_name, terms_agreed } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호는 필수입니다.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  if (terms_agreed !== true) {
    return res.status(400).json({ error: '필수 약관(이용약관, 개인정보 수집·이용)에 동의해야 가입할 수 있습니다.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      `INSERT INTO users (email, password_hash, display_name, terms_agreed_at) VALUES (?, ?, ?, datetime('now'))`
    )
    .run(email, passwordHash, display_name || null);

  req.session.userId = result.lastInsertRowid;

  res.status(201).json({
    id: result.lastInsertRowid,
    email,
    display_name: display_name || null,
  });
});

// POST /api/auth/login - 로그인
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호는 필수입니다.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  req.session.userId = user.id;

  res.json({ id: user.id, email: user.email, display_name: user.display_name });
});

// POST /api/auth/logout - 로그아웃
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: '로그아웃 중 오류가 발생했습니다.' });
    }
    res.clearCookie('connect.sid');
    res.json({ loggedOut: true });
  });
});

// GET /api/auth/me - 현재 로그인한 사용자 정보
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  const user = db
    .prepare('SELECT id, email, display_name FROM users WHERE id = ?')
    .get(req.session.userId);

  if (!user) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  res.json(user);
});

// POST /api/auth/forgot-password - 비밀번호 재설정 링크 요청
// 가입 여부와 상관없이 항상 같은 응답을 줍니다 (이메일 존재 여부를 외부에서 추측 못 하게 하기 위함).
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: '이메일을 입력해주세요.' });
  }

  const genericMessage = '가입된 이메일이면 재설정 링크를 보내드렸어요. 메일함(스팸함 포함)을 확인해주세요.';

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (user) {
    // 원문 토큰은 이메일로만 보내고, DB에는 해시값만 저장합니다 (비밀번호와 같은 원리).
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1시간 뒤 만료

    db.prepare(
      `UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?`
    ).run(tokenHash, expiresAt, user.id);

    try {
      await sendPasswordResetEmail(user.email, rawToken);
    } catch (err) {
      console.error('비밀번호 재설정 이메일 발송 실패:', err.message);
      // 이메일 발송에 실패해도, 존재 여부가 드러나지 않도록 사용자에게는 동일한 성공 메시지를 줍니다.
    }
  }

  res.json({ message: genericMessage });
});

// POST /api/auth/reset-password - 이메일로 받은 토큰으로 비밀번호 재설정
router.post('/reset-password', (req, res) => {
  const { email, token, new_password } = req.body;

  if (!email || !token || !new_password) {
    return res.status(400).json({ error: 'email, token, new_password는 필수입니다.' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.reset_token_hash || !user.reset_token_expires) {
    return res.status(400).json({ error: '재설정 링크가 유효하지 않아요. 다시 요청해주세요.' });
  }

  if (new Date(user.reset_token_expires).getTime() < Date.now()) {
    return res.status(400).json({ error: '재설정 링크가 만료됐어요. 다시 요청해주세요.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (tokenHash !== user.reset_token_hash) {
    return res.status(400).json({ error: '재설정 링크가 유효하지 않아요. 다시 요청해주세요.' });
  }

  const newPasswordHash = bcrypt.hashSync(new_password, 10);
  db.prepare(
    `UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?`
  ).run(newPasswordHash, user.id);

  res.json({ success: true });
});

module.exports = router;