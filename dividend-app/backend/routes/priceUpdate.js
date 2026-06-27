const express = require('express');
const router = express.Router();
const { db, write } = require('../database');

// Yahoo Finance から株価取得
async function fetchPrice(symbol) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      currency: meta.currency,
    };
  } catch {
    return null;
  }
}

// 銘柄ごとに Yahoo Finance シンボルを解決
function toYahooSymbol(stock) {
  if (stock.currency === 'JPY' && !stock.ticker.match(/^[A-Z]+$/)) {
    // 日本株: 数字コード → .T を付加
    return `${stock.ticker}.T`;
  }
  // US株はそのまま
  return stock.ticker;
}

async function updateAllPrices() {
  const stocks = db.stocks;
  let updated = 0;
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  for (const stock of stocks) {
    // PayPay証券のJPY建て株（NVDA, TSLA）は日本円建てなのでスキップ
    if (stock.ticker === 'NVDA' || (stock.ticker === 'TSLA' && stock.currency === 'JPY')) {
      continue;
    }

    const symbol = toYahooSymbol(stock);
    const result = await fetchPrice(symbol);

    if (result && result.price) {
      const idx = db.stocks.findIndex(s => s.id === stock.id);
      if (idx !== -1) {
        db.stocks[idx].current_price = result.price;
        if (result.previousClose) db.stocks[idx].previous_close = result.previousClose;
        updated++;
        const chg = result.previousClose
          ? ((result.price - result.previousClose) / result.previousClose * 100).toFixed(2)
          : '—';
        console.log(`  ${stock.ticker}: ${result.price} ${result.currency} (前日比 ${chg}%)`);
      }
    } else {
      console.log(`  ${stock.ticker} (${symbol}): 取得失敗`);
    }

    // レート制限回避のため少し待つ
    await new Promise(r => setTimeout(r, 300));
  }

  if (updated > 0) {
    db.last_price_update = now;
    write();
    // 株価更新後にヒストリースナップショットを保存
    try {
      const { saveSnapshot } = require('./history');
      saveSnapshot();
    } catch (e) {
      console.error('[history] スナップショット保存失敗:', e.message);
    }
  }

  console.log(`株価更新完了: ${updated}/${stocks.length}件 (${now})`);
  return { updated, total: stocks.length, timestamp: now };
}

router.get('/status', (req, res) => {
  res.json({
    last_update: db.last_price_update || null,
    stock_count: db.stocks.length,
  });
});

router.post('/update', async (req, res) => {
  console.log('手動株価更新開始...');
  const result = await updateAllPrices();
  res.json(result);
});

module.exports = router;
module.exports.updateAllPrices = updateAllPrices;
