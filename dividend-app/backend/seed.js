// 保有資産 一括登録スクリプト
const BASE = 'http://localhost:3001/api';

async function post(path, data) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  console.log(`POST ${path} →`, json.id || json.name || JSON.stringify(json));
  return json;
}

// 取得時レート（全US株共通）
const RATE = 156.67;
// JPY換算: USD × RATE
const toJpy = (usd) => Math.round(usd * RATE);

async function main() {
  console.log('=== 口座作成 ===');
  const acc = {};
  acc.son  = await post('/accounts', { name: '息子口座（春斗/楽天）', color: '#22c55e' });
  acc.wife = await post('/accounts', { name: '妻口座（楽天）',        color: '#8b5cf6' });
  acc.husb = await post('/accounts', { name: '夫口座（楽天）',        color: '#3b82f6' });
  acc.moo  = await post('/accounts', { name: 'moomoo証券',            color: '#f97316' });
  acc.pay  = await post('/accounts', { name: 'PayPay証券',            color: '#ec4899' });

  console.log('\n=== 息子口座（楽天/春斗） ===');
  const SON = acc.son.id;
  await post('/stocks', {
    account_id: SON, ticker: '2914', name: '日本たばこ産業', sector: '食料品',
    category: 'ディフェンシブ', account_type: '特定口座', currency: 'JPY',
    shares: 200, purchase_price: 5640, current_price: 5769,
    dividend_per_share: 194, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: SON, ticker: '5020', name: 'ENEOSホールディングス', sector: '石油・石炭製品',
    category: '景気敏感', account_type: '特定口座', currency: 'JPY',
    shares: 200, purchase_price: 468, current_price: 1290,
    dividend_per_share: 22, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: SON, ticker: '8306', name: '三菱UFJフィナンシャルG', sector: '銀行業',
    category: '景気敏感', account_type: '特定口座', currency: 'JPY',
    shares: 200, purchase_price: 1620, current_price: 2807,
    dividend_per_share: 41, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: SON, ticker: '8804', name: '東京建物', sector: '不動産業',
    category: '景気敏感', account_type: '特定口座', currency: 'JPY',
    shares: 100, purchase_price: 1570, current_price: 3475,
    dividend_per_share: 47, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: SON, ticker: '5401', name: '日本製鉄', sector: '鉄鋼',
    category: '景気敏感', account_type: '特定口座', currency: 'JPY',
    shares: 100, purchase_price: 638, current_price: 571,
    dividend_per_share: 140, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: SON, ticker: '5411', name: 'JFEホールディングス', sector: '鉄鋼',
    category: '景気敏感', account_type: '特定口座', currency: 'JPY',
    shares: 100, purchase_price: 1760, current_price: 1765,
    dividend_per_share: 60, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: SON, ticker: '9434', name: 'ソフトバンク', sector: '情報・通信業',
    category: 'ディフェンシブ', account_type: '特定口座', currency: 'JPY',
    shares: 300, purchase_price: 212, current_price: 220,
    dividend_per_share: 86, ex_dividend_months: [3,9], payment_months: [6,12],
  });

  console.log('\n=== 妻口座（楽天） ===');
  const WIFE = acc.wife.id;
  await post('/stocks', {
    account_id: WIFE, ticker: '2914', name: '日本たばこ産業', sector: '食料品',
    category: 'ディフェンシブ', account_type: '旧NISA', currency: 'JPY',
    shares: 7, purchase_price: 3851, current_price: 5769,
    dividend_per_share: 194, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: '5019', name: '出光興産', sector: '石油・石炭製品',
    category: '景気敏感', account_type: '旧NISA', currency: 'JPY',
    shares: 3, purchase_price: 1147, current_price: 1341,
    dividend_per_share: 120, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: '8001', name: '伊藤忠商事', sector: '卸売業',
    category: '景気敏感', account_type: '旧NISA', currency: 'JPY',
    shares: 5, purchase_price: 1210, current_price: 2010,
    dividend_per_share: 100, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: '8151', name: '東洋テクニカ', sector: '卸売業',
    category: 'ディフェンシブ', account_type: '旧NISA', currency: 'JPY',
    shares: 2, purchase_price: 1685, current_price: 1785,
    dividend_per_share: 70, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: '9434', name: 'ソフトバンク', sector: '情報・通信業',
    category: 'ディフェンシブ', account_type: '旧NISA', currency: 'JPY',
    shares: 100, purchase_price: 200, current_price: 220,
    dividend_per_share: 86, ex_dividend_months: [3,9], payment_months: [6,12],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: 'TSLA', name: 'テスラ', sector: '自動車',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 17, purchase_price: toJpy(330.85), purchase_rate: RATE, current_price: 428.35,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: 'GOOG', name: 'アルファベット クラスC', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 1, purchase_price: toJpy(315.00), purchase_rate: RATE, current_price: 397.05,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: 'ASTS', name: 'ASTスペースモバイル', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 7, purchase_price: toJpy(74.52), purchase_rate: RATE, current_price: 75.05,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: 'SOFI', name: 'ソーファイ・テクノロジーズ', sector: '金融業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 36, purchase_price: toJpy(27.56), purchase_rate: RATE, current_price: 15.75,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: WIFE, ticker: 'IONQ', name: 'IonQ INC', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 128, purchase_price: toJpy(46.89), purchase_rate: RATE, current_price: 49.24,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });

  console.log('\n=== 夫口座（楽天） ===');
  const HUSB = acc.husb.id;
  await post('/stocks', {
    account_id: HUSB, ticker: 'GOOG', name: 'アルファベット クラスC', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 2, purchase_price: toJpy(303.31), purchase_rate: RATE, current_price: 397.05,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: HUSB, ticker: 'BTI', name: 'ブリティッシュ・アメリカン・タバコ', sector: 'タバコ',
    category: 'ディフェンシブ', account_type: '旧NISA', currency: 'USD',
    shares: 39, purchase_price: toJpy(29.09), purchase_rate: RATE, current_price: 58.28,
    dividend_per_share: 3.16, ex_dividend_months: [2,5,8,11], payment_months: [3,6,9,12],
  });
  await post('/stocks', {
    account_id: HUSB, ticker: 'JMIA', name: 'ジュミア・テクノロジーズ', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 3, purchase_price: toJpy(11.50), purchase_rate: RATE, current_price: 7.77,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: HUSB, ticker: 'ZETA', name: 'ゼータ・グローバル・ホールディングス', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 40, purchase_price: toJpy(20.47), purchase_rate: RATE, current_price: 17.14,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: HUSB, ticker: 'SOFI', name: 'ソーファイ・テクノロジーズ', sector: '金融業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 23, purchase_price: toJpy(23.78), purchase_rate: RATE, current_price: 15.75,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: HUSB, ticker: 'IONQ', name: 'IonQ INC', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 96, purchase_price: toJpy(44.37), purchase_rate: RATE, current_price: 49.24,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });

  console.log('\n=== moomoo証券 ===');
  const MOO = acc.moo.id;
  await post('/stocks', {
    account_id: MOO, ticker: 'DEFT', name: 'ディファイ・テクノロジーズ', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'USD',
    shares: 63, purchase_price: toJpy(0.99), purchase_rate: RATE, current_price: 0.95,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });

  console.log('\n=== PayPay証券 ===');
  const PAY = acc.pay.id;
  // 評価額÷現在値 で実際の保有株数を計算
  await post('/stocks', {
    account_id: PAY, ticker: 'NVDA', name: 'NVIDIA', sector: '情報・通信業',
    category: 'その他', account_type: '特定口座', currency: 'JPY',
    shares: parseFloat((10561 / 19521).toFixed(4)),
    purchase_price: 5545, current_price: 19521,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });
  await post('/stocks', {
    account_id: PAY, ticker: 'TSLA', name: 'TESLA（PayPay）', sector: '自動車',
    category: 'その他', account_type: '特定口座', currency: 'JPY',
    shares: parseFloat((6783 / 36560).toFixed(4)),
    purchase_price: 32340, current_price: 36560,
    dividend_per_share: 0, ex_dividend_months: [], payment_months: [],
  });

  console.log('\n✅ 登録完了！');

  // サマリー確認
  const stocks = await (await fetch(BASE + '/stocks')).json();
  console.log(`\n登録銘柄数: ${stocks.length}件`);
  const accs = await (await fetch(BASE + '/accounts')).json();
  console.log('口座:', accs.map(a => a.name).join(', '));
}

main().catch(console.error);
