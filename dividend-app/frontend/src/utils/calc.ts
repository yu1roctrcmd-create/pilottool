import type { Stock, ExchangeRateMap, StockCalc } from '../types'

// 日本株の略称マップ
const JP_SHORT: Record<string, string> = {
  '2914': 'JT',
  '5020': 'ENEOS',
  '8306': '三菱UFJ',
  '8804': '東京建物',
  '5401': '日本製鉄',
  '5411': 'JFE',
  '9434': 'ソフトバンク',
  '5019': '出光興産',
  '8001': '伊藤忠',
  '8151': '東洋テクニカ',
}

export function shortName(stock: Stock): string {
  // US株: ティッカーをそのまま使用
  if (/^[A-Z]+$/.test(stock.ticker)) return stock.ticker
  // 日本株: マップ優先
  if (JP_SHORT[stock.ticker]) return JP_SHORT[stock.ticker]
  // フォールバック: よくある語尾を除去して短縮
  return stock.name
    .replace(/ホールディングス|ホールディング/g, 'HD')
    .replace(/フィナンシャルグループ|フィナンシャルG/g, 'FG')
    .replace(/テクノロジーズ|テクノロジー/g, 'Tech')
    .replace(/インターナショナル/g, 'Intl')
    .replace(/商事$|産業$|興産$|グループ$/g, '')
    .slice(0, 8)
}

export function calcStock(stock: Stock, rates: ExchangeRateMap, taxAdjusted: boolean): StockCalc {
  const rate = rates[stock.currency] ?? 1
  const current_price_jpy = stock.current_price * rate
  const acquisition_value = stock.purchase_price * stock.shares
  const current_value = current_price_jpy * stock.shares
  const gain_loss_pct = acquisition_value > 0
    ? ((current_value - acquisition_value) / acquisition_value) * 100
    : 0
  const raw_annual = stock.dividend_per_share * stock.shares * rate
  const isNisa = stock.account_type?.includes('NISA') ?? false
  const annual_dividend_jpy = (taxAdjusted && !isNisa)
    ? raw_annual * (1 - 0.20315)
    : raw_annual
  const current_yield_pct = stock.current_price > 0
    ? (stock.dividend_per_share / stock.current_price) * 100
    : 0
  const acquisition_yield_pct = acquisition_value > 0
    ? (annual_dividend_jpy / acquisition_value) * 100
    : 0

  return { current_price_jpy, acquisition_value, current_value, gain_loss_pct, annual_dividend_jpy, current_yield_pct, acquisition_yield_pct }
}

export function totalDividend(stocks: Stock[], rates: ExchangeRateMap, taxAdjusted: boolean): number {
  return stocks.reduce((sum, s) => sum + calcStock(s, rates, taxAdjusted).annual_dividend_jpy, 0)
}

export function totalAcquisitionValue(stocks: Stock[]): number {
  return stocks.reduce((sum, s) => sum + s.purchase_price * s.shares, 0)
}

export function totalCurrentValue(stocks: Stock[], rates: ExchangeRateMap): number {
  return stocks.reduce((sum, s) => sum + calcStock(s, rates, false).current_value, 0)
}

export function acquisitionYield(stocks: Stock[], rates: ExchangeRateMap, taxAdjusted: boolean): number {
  // exclude_from_yield フラグが立っている銘柄を除外して利回りを計算
  const included = stocks.filter(s => !s.exclude_from_yield)
  const div = totalDividend(included, rates, taxAdjusted)
  const acq = totalAcquisitionValue(included)
  return acq > 0 ? (div / acq) * 100 : 0
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('ja-JP')
}

export function fmtPct(n: number, d = 2): string {
  return n.toFixed(d) + '%'
}

export function groupBy(
  stocks: Stock[],
  rates: ExchangeRateMap,
  taxAdjusted: boolean,
  key: (s: Stock) => string
): { name: string; value: number }[] {
  const map = new Map<string, number>()
  stocks.forEach(s => {
    const k = key(s) || '未分類'
    const div = calcStock(s, rates, taxAdjusted).annual_dividend_jpy
    map.set(k, (map.get(k) || 0) + div)
  })
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
}

export function monthlyDividend(
  stocks: Stock[],
  rates: ExchangeRateMap,
  taxAdjusted: boolean,
  usePayment: boolean
): { month: number; value: number }[] {
  const monthly = Array(12).fill(0)
  stocks.forEach(s => {
    const months = usePayment ? s.payment_months : s.ex_dividend_months
    if (months.length === 0) return
    const perMonth = calcStock(s, rates, taxAdjusted).annual_dividend_jpy / months.length
    months.forEach(m => { monthly[m - 1] += perMonth })
  })
  return monthly.map((value, i) => ({ month: i + 1, value: Math.round(value) }))
}

export interface MonthlyStockEntry {
  ticker: string
  name: string
  value: number
  color: string
  currency?: string
  valueOriginal?: number  // 原通貨建て金額（外貨銘柄のみ）
}

export interface MonthlyBreakdown {
  month: number
  total: number
  stocks: MonthlyStockEntry[]
  // recharts 用: { [ticker]: value }
  [key: string]: unknown
}

const CHART_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  '#14b8a6','#f43f5e','#84cc16','#a78bfa',
]

export function monthlyDividendByStock(
  stocks: Stock[],
  rates: ExchangeRateMap,
  taxAdjusted: boolean,
  usePayment: boolean
): { rows: MonthlyBreakdown[]; tickers: { ticker: string; name: string; color: string; key: string }[] } {
  // 配当のある銘柄だけ対象
  const divStocks = stocks.filter(s => s.dividend_per_share > 0)

  // ticker→color マッピング
  const tickerColorMap = new Map<string, string>()
  divStocks.forEach((s, i) => {
    const key = `${s.ticker}_${s.id}`
    if (!tickerColorMap.has(key)) {
      tickerColorMap.set(key, CHART_COLORS[tickerColorMap.size % CHART_COLORS.length])
    }
  })

  const rows: MonthlyBreakdown[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    total: 0,
    stocks: [],
  }))

  divStocks.forEach((s, idx) => {
    const months = usePayment ? s.payment_months : s.ex_dividend_months
    if (months.length === 0) return
    const annualDiv = calcStock(s, rates, taxAdjusted).annual_dividend_jpy
    const perMonth = annualDiv / months.length
    const color = CHART_COLORS[idx % CHART_COLORS.length]
    const key = `${s.ticker}_${s.id}`

    const isForeign = s.currency !== 'JPY'
    const perMonthOriginal = isForeign
      ? (s.dividend_per_share * s.shares) / months.length
      : undefined

    months.forEach(m => {
      const row = rows[m - 1]
      row.total += perMonth
      row.stocks.push({
        ticker: s.ticker,
        name: s.name,
        value: Math.round(perMonth),
        color,
        currency: isForeign ? s.currency : undefined,
        valueOriginal: perMonthOriginal !== undefined ? Math.round(perMonthOriginal * 100) / 100 : undefined,
      })
      ;(row as any)[key] = Math.round(perMonth)
    })
  })

  rows.forEach(r => { r.total = Math.round(r.total) })

  const tickers = divStocks.map((s, idx) => ({
    ticker: s.ticker,
    name: s.name,
    color: CHART_COLORS[idx % CHART_COLORS.length],
    key: `${s.ticker}_${s.id}`,
  }))

  return { rows, tickers }
}
