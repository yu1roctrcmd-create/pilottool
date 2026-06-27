const express = require('express');
const router = express.Router();
const { db, write } = require('../database');

// --- ヘルパー ---
function ensureHistory() {
  if (!db.history) db.history = [];
  if (!db.goals) db.goals = { dividend: null, asset: null };
}

function getRates() {
  const rates = { JPY: 1 };
  (db.exchange_rates || []).forEach(r => { rates[r.currency] = r.rate; });
  return rates;
}

function calcSnapshot() {
  const rates = getRates();
  let dividendTotal = 0;
  let assetTotal = 0;
  const byAccount = {};

  (db.stocks || []).forEach(stock => {
    const rate = rates[stock.currency] ?? 1;
    const div = Math.round(stock.dividend_per_share * stock.shares * rate);
    const asset = Math.round(stock.current_price * stock.shares * rate);
    dividendTotal += div;
    assetTotal += asset;

    const aid = String(stock.account_id);
    if (!byAccount[aid]) byAccount[aid] = { dividend: 0, asset: 0 };
    byAccount[aid].dividend += div;
    byAccount[aid].asset += asset;
  });

  return {
    dividend_total: Math.round(dividendTotal),
    asset_total: Math.round(assetTotal),
    by_account: byAccount,
  };
}

// スナップショット保存（外部からも呼び出せるように export）
function saveSnapshot() {
  ensureHistory();
  const today = new Date().toISOString().split('T')[0];
  const snap = calcSnapshot();

  // 同日のエントリを上書き
  db.history = db.history.filter(h => h.date !== today);
  db.history.push({ date: today, ...snap });

  // 日付順にソート・最大365件
  db.history.sort((a, b) => a.date.localeCompare(b.date));
  if (db.history.length > 365) db.history = db.history.slice(-365);

  write();
  console.log(`[history] スナップショット保存: ${today} 配当=${snap.dividend_total} 資産=${snap.asset_total}`);
  return { date: today, ...snap };
}

// POST /api/history/snapshot
router.post('/snapshot', (req, res) => {
  try {
    const result = saveSnapshot();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/history
router.get('/', (req, res) => {
  ensureHistory();
  res.json(db.history);
});

// GET /api/history/goals
router.get('/goals', (req, res) => {
  ensureHistory();
  res.json(db.goals);
});

// PUT /api/history/goals
router.put('/goals', (req, res) => {
  ensureHistory();
  const { dividend, asset } = req.body;
  if (dividend !== undefined) db.goals.dividend = dividend === '' ? null : Number(dividend);
  if (asset !== undefined) db.goals.asset = asset === '' ? null : Number(asset);
  write();
  res.json(db.goals);
});

module.exports = router;
module.exports.saveSnapshot = saveSnapshot;
