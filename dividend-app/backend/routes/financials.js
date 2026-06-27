const express = require('express');
const router = express.Router();
const { db } = require('../database');

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1時間

const UA = 'Mozilla/5.0';

function isJP(ticker) {
  return /^\d+$/.test(ticker);
}

// IRBank CSV取得・パース
async function fetchIRBankCSV(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`IRBank CSV ${res.status}: ${url}`);
  const text = await res.text();
  return text.replace(/^﻿/, ''); // BOM除去
}

// CSVをセクション別にパース
// IRBank CSVは複数セクション（業績・財務・配当）が1ファイルに入っている
function parseIRBankCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = {};
  let currentSection = null;
  let headers = null;

  for (const line of lines) {
    // 会社名行（"2914 日本たばこ産業" のようなもの）をスキップ
    if (line.startsWith('"') && !line.includes(',')) continue;

    // セクション名（ヘッダーの前行）
    if (!line.includes(',') && line !== '') {
      currentSection = line;
      sections[currentSection] = [];
      headers = null;
      continue;
    }

    if (currentSection === null) continue;

    const cols = line.split(',');

    // ヘッダー行（最初の列が "年度" または "年"）
    if (!headers) {
      headers = cols;
      sections[currentSection].headers = headers;
      sections[currentSection].rows = [];
      continue;
    }

    // データ行（年度が "YYYY/MM" 形式）
    if (/^\d{4}\/\d{2}/.test(cols[0])) {
      const row = {};
      headers.forEach((h, i) => {
        const v = cols[i]?.trim();
        row[h] = (v === '-' || v === undefined || v === '') ? null : v;
      });
      sections[currentSection].rows.push(row);
    }
  }

  return sections;
}

// 数値に変換（null安全）
function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// 日本株: IRBank CSVから取得
async function fetchJPFinancials(ticker) {
  const baseUrl = `https://f.irbank.net/files/${ticker}`;

  const [plCSV, divCSV, allCSV] = await Promise.all([
    fetchIRBankCSV(`${baseUrl}/fy-profit-and-loss.csv`).catch(() => null),
    fetchIRBankCSV(`${baseUrl}/fy-stock-dividend.csv`).catch(() => null),
    fetchIRBankCSV(`${baseUrl}/fy-data-all.csv`).catch(() => null),
  ]);

  // 業績データ（売上・営業利益・EPS等）
  let plRows = [];
  if (plCSV) {
    const sections = parseIRBankCSV(plCSV);
    plRows = sections['業績']?.rows || [];
  }

  // 配当データ（DPS・配当性向）
  let divRows = [];
  if (divCSV) {
    const sections = parseIRBankCSV(divCSV);
    divRows = sections['配当']?.rows || [];
  }

  // BPS（PBR計算用）
  let bpsMap = {};
  if (allCSV) {
    const sections = parseIRBankCSV(allCSV);
    const finRows = sections['財務']?.rows || [];
    finRows.forEach(r => {
      const yr = r['年度']?.slice(0, 4);
      if (yr && r['BPS']) bpsMap[yr] = toNum(r['BPS']);
    });
  }

  // 配当マップ（年 → DPS, 配当性向）
  const divMap = {};
  divRows.forEach(r => {
    const yr = r['年度']?.slice(0, 4);
    if (yr) divMap[yr] = { dps: toNum(r['一株配当']), payoutRatio: toNum(r['配当性向']) };
  });

  // 年別データを組み合わせ（予想行は除く、直近5年）
  const years = plRows
    .filter(r => r['年度'] && !/予想/.test(r['年度']))
    .slice(-5) // 直近5年
    .map(r => {
      const yr = r['年度']?.slice(0, 4);
      const div = divMap[yr] || {};
      const revenue = toNum(r['売上高']);
      const eps = toNum(r['EPS']);
      const dps = div.dps ?? null;
      return {
        year: r['年度'],       // 例: "2024/12"
        forecast: revenue === null && eps !== null, // 予想行フラグ
        revenue,
        operatingIncome: toNum(r['営業利益']),
        netIncome:       toNum(r['純利益']),
        eps,
        roe:             toNum(r['ROE']),
        roa:             toNum(r['ROA']),
        dps,
        payoutRatio: div.payoutRatio
          ?? ((eps && dps) ? Math.round(dps / eps * 1000) / 10 : null),
        bps: bpsMap[yr] ?? null,
      };
    });

  // 最新年のデータで現在指標を計算
  const latest = years[years.length - 1];
  // BPSは最新の非null値を使う（予想年はBPS無しのことが多い）
  const latestWithBPS = [...years].reverse().find(y => y.bps !== null);
  const stock = db.stocks.find(s => s.ticker === ticker);
  const currentPrice = stock?.current_price ?? null;

  const per = (currentPrice && latest?.eps)
    ? Math.round(currentPrice / latest.eps * 10) / 10
    : null;
  const pbr = (currentPrice && latestWithBPS?.bps)
    ? Math.round(currentPrice / latestWithBPS.bps * 100) / 100
    : null;
  const dividendYield = (currentPrice && latest?.dps)
    ? Math.round(latest.dps / currentPrice * 1000) / 10  // %
    : null;
  const latestDPS = latest?.dps ?? null;
  // 配当性向: CSVにあれば使用、なければEPS/DPSから計算
  const latestPayoutRatio = latest?.payoutRatio
    ?? ((latest?.eps && latest?.dps) ? Math.round(latest.dps / latest.eps * 1000) / 10 : null);

  return {
    source: 'irbank',
    years,
    current: {
      price:         currentPrice,
      per,
      pbr,
      eps:           latest?.eps ?? null,
      dividendYield, // %
      payoutRatio:   latestPayoutRatio,
      dividendRate:  latestDPS,
    },
  };
}

router.get('/:ticker', async (req, res) => {
  const { ticker } = req.params;

  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return res.json(cached.data);
  }

  // 日本株のみ対応
  if (!isJP(ticker)) {
    return res.json({
      source: 'none',
      years: [],
      current: { price: null, per: null, pbr: null, eps: null, dividendYield: null, payoutRatio: null, dividendRate: null },
    });
  }

  try {
    const data = await fetchJPFinancials(ticker);
    if (data.years.length > 0) {
      cache.set(ticker, { at: Date.now(), data });
    }
    res.json(data);
  } catch (err) {
    console.error(`Financials error [${ticker}]:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
