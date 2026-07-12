// 로그인이 되어있지 않으면 요청을 막는 미들웨어입니다.
// 3~4단계에서 기존 API 라우트들에 이 미들웨어를 적용할 예정입니다.
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  next();
}

module.exports = { requireAuth };