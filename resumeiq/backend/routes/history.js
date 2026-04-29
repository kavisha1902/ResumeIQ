const express = require('express');
const authMiddleware = require('../middleware/auth');
const { History } = require('../utils/store');

const router = express.Router();

// ── GET /api/history ──────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const records = History.getByUserId(req.user.id);
  // Return list without full results for performance
  const list = records.map(({ results, ...meta }) => meta);
  res.json({ history: list });
});

// ── GET /api/history/:id ──────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  const records = History.getByUserId(req.user.id);
  const record = records.find(r => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found' });
  res.json(record);
});

// ── DELETE /api/history/:id ───────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  const deleted = History.delete(req.user.id, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Record not found' });
  res.json({ success: true });
});

module.exports = router;
