const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/my-shares', (req, res) => {
  const rows = db
    .prepare(
      `SELECT ps.id, u.id AS user_id, u.email, u.display_name
       FROM portfolio_shares ps
       JOIN users u ON u.id = ps.shared_with_user_id
       WHERE ps.owner_user_id = ?
       ORDER BY ps.created_at DESC`
    )
    .all(req.session.userId);
  res.json(rows);
});

router.get('/shared-with-me', (req, res) => {
  const rows = db
    .prepare(
      `SELECT ps.id, u.id AS owner_id, u.email, u.display_name
       FROM portfolio_shares ps
       JOIN users u ON u.id = ps.owner_user_id
       WHERE ps.shared_with_user_id = ?
       ORDER BY ps.created_at DESC`
    )
    .all(req.session.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'email은 필수입니다.' });
  }

  const target = db.prepare('SELECT id, email, display_name FROM users WHERE email = ?').get(email);
  if (!target) {
    return res.status(404).json({ error: '가입되지 않은 이메일입니다.' });
  }

  if (target.id === req.session.userId) {
    return res.status(400).json({ error: '자기 자신에게는 공유할 수 없습니다.' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO portfolio_shares (owner_user_id, shared_with_user_id, permission) VALUES (?, ?, 'edit')`
      )
      .run(req.session.userId, target.id);

    res.status(201).json({
      id: result.lastInsertRowid,
      email: target.email,
      display_name: target.display_name,
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: '이미 이 사람과 공유중입니다.' });
    }
    res.status(500).json({ error: '공유 중 오류가 발생했습니다.' });
  }
});

router.delete('/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM portfolio_shares WHERE id = ? AND owner_user_id = ?');
  const result = stmt.run(req.params.id, req.session.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '해당 공유를 찾을 수 없습니다.' });
  }
  res.json({ deleted: true });
});

router.post('/switch', (req, res) => {
  const { ownerId } = req.body;

  if (!ownerId || Number(ownerId) === req.session.userId) {
    req.session.activePortfolioOwnerId = null;
    return res.json({ ownerId: req.session.userId, isOwn: true });
  }

  const share = db
    .prepare(`SELECT * FROM portfolio_shares WHERE owner_user_id = ? AND shared_with_user_id = ?`)
    .get(ownerId, req.session.userId);

  if (!share) {
    return res.status(403).json({ error: '해당 포트폴리오에 접근할 권한이 없습니다.' });
  }

  req.session.activePortfolioOwnerId = Number(ownerId);
  res.json({ ownerId: Number(ownerId), isOwn: false });
});

router.get('/active', (req, res) => {
  const activeOwnerId = req.session.activePortfolioOwnerId || req.session.userId;
  const isOwn = activeOwnerId === req.session.userId;

  const owner = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(activeOwnerId);

  res.json({
    ownerId: activeOwnerId,
    isOwn,
    ownerLabel: owner ? owner.display_name || owner.email : null,
  });
});

module.exports = router;