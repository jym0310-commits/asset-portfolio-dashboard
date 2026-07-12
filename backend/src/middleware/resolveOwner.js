const { db } = require('../db');

function resolveOwner(req, res, next) {
  const activeOwnerId = req.session.activePortfolioOwnerId || req.session.userId;

  if (activeOwnerId === req.session.userId) {
    req.ownerId = req.session.userId;
    return next();
  }

  const share = db
    .prepare(
      `SELECT * FROM portfolio_shares WHERE owner_user_id = ? AND shared_with_user_id = ?`
    )
    .get(activeOwnerId, req.session.userId);

  if (!share) {
    req.session.activePortfolioOwnerId = null;
    req.ownerId = req.session.userId;
    return next();
  }

  req.ownerId = activeOwnerId;
  next();
}

module.exports = { resolveOwner };