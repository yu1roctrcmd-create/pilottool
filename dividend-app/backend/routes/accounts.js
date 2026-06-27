const express = require('express');
const router = express.Router();
const { db, write } = require('../database');

router.get('/', (req, res) => {
  res.json(db.accounts);
});

router.post('/', (req, res) => {
  const { name, color } = req.body;
  const id = db._seq.account++;
  const account = { id, name, color: color || '#6366f1', created_at: new Date().toISOString() };
  db.accounts.push(account);
  write();
  res.json(account);
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, color } = req.body;
  const idx = db.accounts.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.accounts[idx] = { ...db.accounts[idx], name, color };
  write();
  res.json(db.accounts[idx]);
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.accounts = db.accounts.filter(a => a.id !== id);
  db.stocks = db.stocks.filter(s => s.account_id !== id);
  write();
  res.json({ success: true });
});

module.exports = router;
