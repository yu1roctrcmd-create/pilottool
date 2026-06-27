import type { Account, Stock, ExchangeRateMap } from '../types'
import { totalDividend, totalAcquisitionValue, acquisitionYield, fmt, fmtPct } from '../utils/calc'

interface Props {
  accounts: Account[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  stocks: Stock[]
  rates: ExchangeRateMap
  taxAdjusted: boolean
}

export default function AccountSlider({ accounts, selectedId, onSelect, stocks, rates, taxAdjusted }: Props) {
  const allDiv = totalDividend(stocks, rates, taxAdjusted)
  const allAcq = totalAcquisitionValue(stocks)
  const allYield = acquisitionYield(stocks, rates, taxAdjusted)

  return (
    <div className="account-slider flex overflow-x-auto gap-3 px-4 pb-1 mt-2">
      {/* All groups card */}
      <div
        className={`account-slide w-72 rounded-2xl p-5 cursor-pointer flex-shrink-0 transition-all ${
          selectedId === null ? 'ring-2 ring-white/40' : 'opacity-80'
        }`}
        style={{ background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)' }}
        onClick={() => onSelect(null)}
      >
        <div className="flex items-center gap-1 mb-3">
          <span className="text-xs text-gray-300 bg-black/20 px-2 py-0.5 rounded-full">全グループの総計</span>
          <span className="text-xs text-gray-400 ml-1">🔢 {accounts.length}</span>
        </div>
        <div className="text-xs text-gray-300">総計年間配当金：</div>
        <div className="text-3xl font-bold mt-1">
          {fmt(allDiv)}<span className="text-base font-normal ml-1">円</span>
        </div>
        <div className="text-sm text-gray-300 mt-1">取得利回り：{fmtPct(allYield)}</div>
        <div className="text-sm text-gray-400 mt-2">取得額：{fmt(allAcq)} 円</div>
      </div>

      {/* Individual account cards */}
      {accounts.map(acc => {
        const accStocks = stocks.filter(s => s.account_id === acc.id)
        const div = totalDividend(accStocks, rates, taxAdjusted)
        const acq = totalAcquisitionValue(accStocks)
        const yld = acquisitionYield(accStocks, rates, taxAdjusted)
        return (
          <div
            key={acc.id}
            className={`account-slide w-72 rounded-2xl p-5 cursor-pointer flex-shrink-0 transition-all ${
              selectedId === acc.id ? 'ring-2 ring-white/40' : 'opacity-80'
            }`}
            style={{ background: `linear-gradient(135deg, ${acc.color}cc 0%, ${acc.color}66 100%)` }}
            onClick={() => onSelect(acc.id)}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{acc.name}</span>
              <span className="text-gray-300 text-xs">✏️</span>
            </div>
            <div className="text-xs text-gray-200">年間配当金：</div>
            <div className="text-3xl font-bold mt-1">
              {fmt(div)}<span className="text-base font-normal ml-1">円</span>
            </div>
            <div className="text-sm text-gray-200 mt-1">取得利回り：{fmtPct(yld)}</div>
            <div className="text-sm text-gray-300 mt-2">取得額：{fmt(acq)} 円</div>
          </div>
        )
      })}
    </div>
  )
}
