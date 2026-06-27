const express = require('express');
const router = express.Router();
const { db, write } = require('../database');

router.get('/', (req, res) => {
  res.json(db.stocks);
});

router.post('/', (req, res) => {
  const f = req.body;
  const id = db._seq.stock++;
  const stock = {
    id,
    account_id: f.account_id,
    ticker: f.ticker,
    name: f.name,
    sector: f.sector || '',
    category: f.category || 'その他',
    account_type: f.account_type || '特定口座',
    currency: f.currency || 'JPY',
    current_price: f.current_price || 0,
    purchase_price: f.purchase_price || 0,
    purchase_rate: f.purchase_rate || 1,
    dividend_per_share: f.dividend_per_share || 0,
    shares: f.shares || 0,
    ex_dividend_months: f.ex_dividend_months || [],
    payment_months: f.payment_months || [],
    exclude_from_yield: f.exclude_from_yield ?? false,
    created_at: new Date().toISOString(),
  };
  db.stocks.push(stock);
  write();
  res.json(stock);
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const f = req.body;
  const idx = db.stocks.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.stocks[idx] = {
    ...db.stocks[idx],
    account_id: f.account_id,
    ticker: f.ticker,
    name: f.name,
    sector: f.sector || '',
    category: f.category || 'その他',
    account_type: f.account_type || '特定口座',
    currency: f.currency || 'JPY',
    current_price: f.current_price || 0,
    purchase_price: f.purchase_price || 0,
    purchase_rate: f.purchase_rate || 1,
    dividend_per_share: f.dividend_per_share || 0,
    shares: f.shares || 0,
    ex_dividend_months: f.ex_dividend_months || [],
    payment_months: f.payment_months || [],
    exclude_from_yield: f.exclude_from_yield ?? false,
  };
  write();
  res.json(db.stocks[idx]);
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.stocks = db.stocks.filter(s => s.id !== id);
  write();
  res.json({ success: true });
});

module.exports = router;
