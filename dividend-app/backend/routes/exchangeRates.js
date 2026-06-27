const express = require('express');
const router = express.Router();
const { db, write } = require('../database');

async function fetchAndSaveRates() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=JPY');
    const data = await res.json();
    if (data.rates?.JPY) {
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const existing = db.exchange_rates.find(r => r.currency === 'USD');
      if (existing) {
        existing.rate = data.rates.JPY;
        existing.updated_at = now;
      } else {
        db.exchange_rates.push({ currency: 'USD', rate: data.rates.JPY, updated_at: now });
      }
      write();
      console.log(`USD/JPY: ${data.rates.JPY}`);
    }
  } catch (err) {
    console.error('Exchange rate fetch failed:', err.message);
  }
}

router.get('/', (req, res) => {
  const map = { JPY: 1 };
  db.exchange_rates.forEach(r => { map[r.currency] = r.rate; });
  res.json({ rates: db.exchange_rates, map });
});

router.post('/refresh', async (req, res) => {
  await fetchAndSaveRates();
  const map = { JPY: 1 };
  db.exchange_rates.forEach(r => { map[r.currency] = r.rate; });
  res.json({ rates: db.exchange_rates, map });
});

module.exports = router;
module.exports.fetchAndSaveRates = fetchAndSaveRates;
