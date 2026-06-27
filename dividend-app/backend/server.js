const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const accountsRouter = require('./routes/accounts');
const stocksRouter = require('./routes/stocks');
const exchangeRatesRouter = require('./routes/exchangeRates');
const priceUpdateRouter = require('./routes/priceUpdate');
const financialsRouter = require('./routes/financials');
const historyRouter = require('./routes/history');
const newsRouter = require('./routes/news');
const { saveSnapshot } = require('./routes/history');
const { fetchAndSaveRates } = require('./routes/exchangeRates');
const { updateAllPrices } = require('./routes/priceUpdate');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// TradingView ヒートマップ HTML 配信
app.get('/api/heatmap', (req, res) => {
  const market = req.query.market || 'NI225'
  const config = JSON.stringify({
    exchanges: [],
    dataSource: market,
    grouping: 'sector',
    blockSize: 'market_cap_basic',
    blockColor: 'change',
    locale: 'ja',
    symbolUrl: '',
    colorTheme: 'dark',
    hasTopBar: false,
    isDataSetEnabled: false,
    isZoomEnabled: true,
    hasSymbolTooltip: true,
    isMonoSize: false,
    width: '100%',
    height: 420,
  })
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Cache-Control', 'no-store')
  res.send(`<!DOCTYPE html>
<html>
<head>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden}</style>
</head>
<body>
<div class="tradingview-widget-container" style="height:420px;width:100%">
<script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js" async>${config}<\/script>
</div>
</body>
</html>`)
})

app.use('/api/accounts', accountsRouter);
app.use('/api/stocks', stocksRouter);
app.use('/api/exchange-rates', exchangeRatesRouter);
app.use('/api/prices', priceUpdateRouter);
app.use('/api/financials', financialsRouter);
app.use('/api/history', historyRouter);
app.use('/api/news', newsRouter);

// 起動時: スナップショット保存（現在のデータで即時）
try { saveSnapshot(); } catch (e) { console.error('起動時スナップショット失敗:', e.message); }

// 起動時: 為替レート取得 → 2分後に株価取得（Yahoo Financeレート制限回避）
fetchAndSaveRates().then(() => {
  setTimeout(() => {
    console.log('起動時 株価更新開始...');
    updateAllPrices();
  }, 120000);
});

// 1時間ごとに為替レートを更新
cron.schedule('0 * * * *', fetchAndSaveRates);

// 平日 9:00〜15:30 の間、30分ごとに株価更新（日本市場）
cron.schedule('*/30 9-15 * * 1-5', () => {
  console.log('[cron] 株価自動更新...');
  updateAllPrices();
});

// 平日 22:30〜翌4:00 の間、30分ごとに株価更新（US市場）
cron.schedule('*/30 22-23 * * 1-5', () => {
  console.log('[cron] US株価自動更新...');
  updateAllPrices();
});
cron.schedule('*/30 0-4 * * 2-6', () => {
  console.log('[cron] US株価自動更新（深夜）...');
  updateAllPrices();
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
