import { useState } from 'react'
import type { Stock, Account, ExchangeRateMap } from '../types'
import { calcStock, fmt, fmtPct } from '../utils/calc'
import QuickReport from './QuickReport'
import StockNews from './StockNews'
import StockLogo from './StockLogo'

const CATEGORY_COLOR: Record<string, string> = {
  'ディフェンシブ': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  '景気敏感': 'bg-red-500/20 text-red-300 border-red-500/30',
  'Tech': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'その他': 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

interface Props {
  stock: Stock
  account: Account | undefined
  rates: ExchangeRateMap
  taxAdjusted: boolean
  dividendIncreased?: boolean
  onEdit: () => void
}

export default function StockCard({ stock, account, rates, taxAdjusted, dividendIncreased = false, onEdit }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [newsOpen, setNewsOpen] = useState(false)
  const c = calcStock(stock, rates, taxAdjusted)
  const isForeign = stock.currency !== 'JPY'
  const rate = rates[stock.currency] ?? 1

  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-4 relative">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <StockLogo ticker={stock.ticker} name={stock.name} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://irbank.net/${stock.ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-base hover:text-blue-400 active:text-blue-300 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                {stock.name}
              </a>
            </div>
            <div className="flex items-center gap-1 mt-1 text-sm text-gray-400">
              <span>{stock.ticker}</span>
              {stock.account_type && (
                <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded ml-1">[{stock.account_type}]</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="text-gray-400 px-2 py-1 text-xl leading-none"
        >⋮</button>
        {menuOpen && (
          <div className="absolute right-4 top-10 bg-[#2a2a2a] rounded-xl shadow-lg z-10 overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); onEdit(); }}
              className="block w-full text-left px-5 py-3 text-sm hover:bg-white/10"
            >編集</button>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="flex gap-2 mt-2 flex-wrap">
        {account && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-gray-600 text-gray-300">
            {account.name}
          </span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLOR[stock.category] || CATEGORY_COLOR['その他']}`}>
          {stock.category}
        </span>
        {stock.exclude_from_yield ? (
          <span className="text-xs px-2 py-0.5 rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-400">
            キャピタルゲイン
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-400">
            インカムゲイン
          </span>
        )}
        {dividendIncreased && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-yellow-400/50 bg-yellow-400/10 text-yellow-400 font-medium">
            📈 増配
          </span>
        )}
      </div>

      {/* Price row */}
      <div className="mt-3 text-sm text-gray-300">
        <span className="text-white font-medium">
          〜 {stock.currency === 'JPY'
            ? `${stock.current_price.toLocaleString()} 円`
            : `${stock.current_price} ${stock.currency}`}
        </span>
        {isForeign && (
          <span className="text-gray-500 ml-2 text-xs">({fmt(c.current_price_jpy)}円)</span>
        )}
      </div>
      {isForeign && (
        <div className="text-xs text-gray-500">購入時レート：{stock.purchase_rate}円</div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
        <div className="text-gray-400">取得単価：<span className="text-white">{fmt(stock.purchase_price)} 円</span></div>
        <div className="text-right">
          <div className="text-gray-400">保有数：<span className="text-white">{stock.shares} 株</span></div>
        </div>
        <div className="text-gray-400">
          1株配当：<span className="text-white">
            {stock.dividend_per_share} {stock.currency === 'JPY' ? '円' : stock.currency}
          </span>
        </div>
        <div className="text-right">
          <div className="text-gray-400">取得額：<span className="text-white">{fmt(c.acquisition_value)} 円</span></div>
        </div>
        <div className="text-gray-400">現在利回り：<span className="text-white">{fmtPct(c.current_yield_pct)}</span></div>
        <div className="text-right">
          <div className="text-gray-400">評価額：
            <span className="text-white">{fmt(c.current_value)} 円</span>
          </div>
          <div className={`text-xs ${c.gain_loss_pct >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            ({c.gain_loss_pct >= 0 ? '+' : ''}{fmtPct(c.gain_loss_pct)})
          </div>
        </div>
        <div className="text-gray-400">取得利回り：<span className="text-white">{fmtPct(c.acquisition_yield_pct)}</span></div>
        <div className="text-right text-gray-400">
          年間配当：<span className="text-white">{fmt(c.annual_dividend_jpy)} 円</span>
          {isForeign && (
            <div className="text-xs text-gray-500">
              ({(stock.dividend_per_share * stock.shares).toFixed(2)} {stock.currency})
            </div>
          )}
        </div>
      </div>

      {/* Month badges */}
      {(stock.ex_dividend_months.length > 0 || stock.payment_months.length > 0) && (
        <div className="mt-2 flex gap-2 text-xs text-gray-500 flex-wrap">
          {stock.ex_dividend_months.length > 0 && (
            <span>権利確定：{stock.ex_dividend_months.map(m => `${m}月`).join('・')}</span>
          )}
          {stock.payment_months.length > 0 && (
            <span>支払：{stock.payment_months.map(m => `${m}月`).join('・')}</span>
          )}
        </div>
      )}

      {/* Quick Report accordion */}
      <button
        onClick={() => setReportOpen(v => !v)}
        className="mt-3 w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
      >
        <span className="font-medium">クイックレポート</span>
        <span className="text-base leading-none">{reportOpen ? '▲' : '▼'}</span>
      </button>
      {reportOpen && <QuickReport ticker={stock.ticker} />}

      {/* News accordion */}
      <button
        onClick={() => setNewsOpen(v => !v)}
        className="mt-2 w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
      >
        <span className="font-medium">関連ニュース</span>
        <span className="text-base leading-none">{newsOpen ? '▲' : '▼'}</span>
      </button>
      {newsOpen && <StockNews ticker={stock.ticker} name={stock.name} />}
    </div>
  )
}
