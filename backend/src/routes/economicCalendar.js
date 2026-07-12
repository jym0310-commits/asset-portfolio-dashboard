const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { getUpcomingEconomicEvents } = require('../services/fredService');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const days = parseInt(req.query.days, 10) || 14;
  try {
    const events = await getUpcomingEconomicEvents(days);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;