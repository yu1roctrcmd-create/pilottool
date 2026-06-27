import { useState, useEffect, useCallback } from 'react'
import { api } from './api/client'
import type { Account, Stock, ExchangeRateMap } from './types'
import { groupBy, monthlyDividendByStock, calcStock, fmt, shortName, totalCurrentValue, totalDividend } from './utils/calc'
import AccountSlider from './components/AccountSlider'
import StockCard from './components/StockCard'
import StockModal from './components/StockModal'
import AccountModal from './components/AccountModal'
import DonutChart from './components/charts/DonutChart'
import MonthlyChart from './components/charts/MonthlyChart'
import TrendView from './components/TrendView'
import TradingViewHeatmap from './components/charts/TradingViewHeatmap'
import PortfolioHeatmap from './components/charts/PortfolioHeatmap'

type Tab = '全体表示' | '月別表示' | 'ヒートマップ' | '推移'
type ChartMode = '銘柄別' | 'セクター別' | '景気影響度別' | 'ゲイン種別'
type ValueMode = '配当金ベース' | '保有資産ベース'
type MonthMode = '権利確定月' | '支払い月'

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [rates, setRates] = useState<ExchangeRateMap>({ JPY: 1 })
  const [rateInfo, setRateInfo] = useState<{ usd: number; updatedAt: string } | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [taxAdjusted, setTaxAdjusted] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('全体表示')
  const [chartMode, setChartMode] = useState<ChartMode>('銘柄別')
  const [valueMode, setValueMode] = useState<ValueMode>('配当金ベース')
  const [monthMode, setMonthMode] = useState<MonthMode>('権利確定月')
  const [showStock, setShowStock] = useState(false)
  const [editStock, setEditStock] = useState<Stock | null>(null)
  const [showAccount, setShowAccount] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [priceUpdating, setPriceUpdating] = useState(false)
  const [priceLastUpdate, setPriceLastUpdate] = useState<string | null>(null)
  const [dividendIncreases, setDividendIncreases] = useState<Record<string, boolean>>({})

  // JP銘柄のIRBankデータからDPS前年比を検出（バックグラウンド）
  const fetchDividendIncreases = useCallback(async (stks: Stock[]) => {
    const jpStocks = stks.filter(s => s.currency === 'JPY' && /^\d+$/.test(s.ticker))
    const results: Record<string, boolean> = {}
    await Promise.all(jpStocks.map(async s => {
      try {
        const data = await api.financials.get(s.ticker)
        const validYears = data.years.filter(y => !y.forecast && y.dps !== null)
        if (validYears.length >= 2) {
          const latest = validYears[validYears.length - 1].dps ?? 0
          const prev   = validYears[validYears.length - 2].dps ?? 0
          if (latest > prev && prev > 0) results[s.ticker] = true
        }
      } catch { /* 取得失敗は無視 */ }
    }))
    setDividendIncreases(results)
  }, [])

  const reload = useCallback(async () => {
    const [accs, stks, rateData, priceStatus] = await Promise.all([
      api.accounts.list(),
      api.stocks.list(),
      api.exchangeRates.get(),
      api.prices.status(),
    ])
    setAccounts(accs)
    setStocks(stks)
    const map: ExchangeRateMap = { JPY: 1, ...rateData.map }
    setRates(map)
    const usdRate = rateData.rates.find(r => r.currency === 'USD')
    if (usdRate) setRateInfo({ usd: usdRate.rate, updatedAt: usdRate.updated_at })
    if (priceStatus.last_update) setPriceLastUpdate(priceStatus.last_update)
    setLoading(false)
    fetchDividendIncreases(stks)
  }, [fetchDividendIncreases])

  useEffect(() => { reload() }, [reload])

  const filtered = selectedId === null ? stocks : stocks.filter(s => s.account_id === selectedId)

  const GAIN_COLORS = { income: '#22c55e', capital: '#f97316' }

  const dividendChartData = (() => {
    if (chartMode === '銘柄別') {
      return filtered.map(s => ({
        name: shortName(s),
        fullName: s.name,
        value: Math.round(calcStock(s, rates, taxAdjusted).annual_dividend_jpy),
      })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
    }
    if (chartMode === 'セクター別') return groupBy(filtered, rates, taxAdjusted, s => s.sector || '未分類')
    if (chartMode === 'ゲイン種別') {
      const income = filtered.filter(s => !s.exclude_from_yield)
      const capital = filtered.filter(s => s.exclude_from_yield)
      return [
        { name: 'インカムゲイン', value: Math.round(totalDividend(income, rates, taxAdjusted)), color: GAIN_COLORS.income },
        { name: 'キャピタルゲイン', value: Math.round(totalDividend(capital, rates, taxAdjusted)), color: GAIN_COLORS.capital },
      ].filter(d => d.value > 0)
    }
    return groupBy(filtered, rates, taxAdjusted, s => s.category)
  })()

  const assetChartData = (() => {
    if (chartMode === '銘柄別') {
      return filtered.map(s => ({
        name: shortName(s),
        fullName: s.name,
        value: Math.round(calcStock(s, rates, false).current_value),
      })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
    }
    if (chartMode === 'セクター別') {
      const groups: Record<string, number> = {}
      filtered.forEach(s => {
        const key = s.sector || '未分類'
        groups[key] = (groups[key] || 0) + Math.round(calcStock(s, rates, false).current_value)
      })
      return Object.entries(groups).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
    }
    if (chartMode === 'ゲイン種別') {
      const income = filtered.filter(s => !s.exclude_from_yield)
      const capital = filtered.filter(s => s.exclude_from_yield)
      return [
        { name: 'インカムゲイン', value: Math.round(totalCurrentValue(income, rates)), color: GAIN_COLORS.income },
        { name: 'キャピタルゲイン', value: Math.round(totalCurrentValue(capital, rates)), color: GAIN_COLORS.capital },
      ].filter(d => d.value > 0)
    }
    const groups: Record<string, number> = {}
    filtered.forEach(s => {
      const key = s.category
      groups[key] = (groups[key] || 0) + Math.round(calcStock(s, rates, false).current_value)
    })
    return Object.entries(groups).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  })()

  const chartData = valueMode === '配当金ベース' ? dividendChartData : assetChartData
  const { rows: monthRows, tickers: monthTickers } = monthlyDividendByStock(filtered, rates, taxAdjusted, monthMode === '支払い月')

  const handleRefresh = async () => {
    setRefreshing(true)
    setPriceUpdating(true)
    // 為替レートと株価を同時更新
    const [rateData] = await Promise.all([
      api.exchangeRates.refresh(),
    ])
    const map: ExchangeRateMap = { JPY: 1, ...rateData.map }
    setRates(map)
    const usdRate = rateData.rates.find(r => r.currency === 'USD')
    if (usdRate) setRateInfo({ usd: usdRate.rate, updatedAt: usdRate.updated_at })
    setRefreshing(false)

    // 株価更新（時間がかかるので別途）
    const result = await api.prices.update()
    setPriceLastUpdate(result.timestamp)
    setPriceUpdating(false)
    // 最新株価で再読み込み
    await reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="text-gray-400 text-sm">読み込み中…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-10 pb-3">
        <button
          onClick={() => setShowAccount(true)}
          className="w-9 h-9 flex items-center justify-center text-gray-300 text-xl"
        >☰</button>
        <span className="text-2xl">🐷</span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing || priceUpdating}
            className={`text-gray-300 text-lg transition-transform disabled:opacity-50 ${(refreshing || priceUpdating) ? 'animate-spin' : ''}`}
            title="株価・為替レートを更新"
          >↻</button>
          <button
            onClick={() => { setEditStock(null); setShowStock(true) }}
            className="w-9 h-9 flex items-center justify-center bg-blue-600 rounded-full text-white font-bold text-lg"
          >+</button>
        </div>
      </div>

      {/* Account Slider */}
      <AccountSlider
        accounts={accounts}
        selectedId={selectedId}
        onSelect={setSelectedId}
        stocks={stocks}
        rates={rates}
        taxAdjusted={taxAdjusted}
      />

      {/* Toggles */}
      <div className="flex items-center gap-5 px-5 mt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-400">税引き後表示</span>
          <div
            className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors ${taxAdjusted ? 'bg-red-500' : 'bg-gray-700'}`}
            onClick={() => setTaxAdjusted(v => !v)}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${taxAdjusted ? 'translate-x-5' : ''}`} />
          </div>
        </label>
        <div className="ml-auto flex flex-col items-end gap-0.5">
          {rateInfo && (
            <span className="text-xs text-gray-600">USD/JPY {rateInfo.usd.toFixed(2)}</span>
          )}
          {priceUpdating && (
            <span className="text-xs text-blue-400">株価更新中…</span>
          )}
          {!priceUpdating && priceLastUpdate && (
            <span className="text-xs text-gray-700">株価 {priceLastUpdate}</span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex mx-4 mt-4 bg-[#1c1c1e] rounded-xl overflow-hidden">
        {(['全体表示', '月別表示', 'ヒートマップ', '推移'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activeTab === t ? 'bg-[#2c2c2e] text-white' : 'text-gray-500'}`}
          >{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-3">
        {activeTab === '全体表示' && (
          <div>
            <div className="flex items-center justify-between px-4 flex-wrap gap-y-2">
              <div className="flex gap-2 flex-wrap">
                {(['銘柄別', 'セクター別', '景気影響度別', 'ゲイン種別'] as ChartMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${chartMode === m ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'}`}
                  >{m}</button>
                ))}
              </div>
              <div className="flex bg-[#1c1c1e] rounded-lg overflow-hidden border border-gray-700 text-xs">
                {(['配当金ベース', '保有資産ベース'] as ValueMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setValueMode(m)}
                    className={`px-3 py-1 transition-colors ${valueMode === m ? 'bg-[#2c2c2e] text-white' : 'text-gray-500'}`}
                  >{m}</button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <DonutChart
                data={chartData}
                taxAdjusted={valueMode === '配当金ベース' ? taxAdjusted : false}
                centerLabel={valueMode === '配当金ベース' ? '年間配当金' : '保有資産総額'}
              />
            </div>
          </div>
        )}

        {activeTab === '月別表示' && (
          <div className="px-4">
            <div className="flex gap-2 mb-3">
              {(['権利確定月', '支払い月'] as MonthMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMonthMode(m)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${monthMode === m ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'}`}
                >{m}</button>
              ))}
            </div>
            <MonthlyChart rows={monthRows} tickers={monthTickers} />
          </div>
        )}

        {activeTab === 'ヒートマップ' && (
          <div className="space-y-0">
            {/* 保有銘柄ヒートマップ */}
            <div className="px-4">
              <PortfolioHeatmap stocks={filtered} rates={rates} />
            </div>
            {/* 市場ヒートマップ */}
            <div className="border-t border-white/10 pt-4">
              <TradingViewHeatmap />
            </div>
          </div>
        )}

        {activeTab === '推移' && (
          <TrendView accounts={accounts} />
        )}
      </div>

      {/* Stock list */}
      <div className="px-4 mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-300">銘柄一覧 ({filtered.length})</h3>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600 text-sm">
            <div className="text-4xl mb-3">📈</div>
            <p>銘柄を追加してください</p>
            <button
              onClick={() => { setEditStock(null); setShowStock(true) }}
              className="mt-4 px-6 py-2.5 bg-blue-600 rounded-xl text-sm font-medium"
            >+ 銘柄を追加</button>
          </div>
        )}
        {filtered.map(s => (
          <StockCard
            key={s.id}
            stock={s}
            account={accounts.find(a => a.id === s.account_id)}
            rates={rates}
            taxAdjusted={taxAdjusted}
            dividendIncreased={dividendIncreases[s.ticker] ?? false}
            onEdit={() => { setEditStock(s); setShowStock(true) }}
          />
        ))}
      </div>

      {/* Modals */}
      {showStock && (
        <StockModal
          stock={editStock}
          accounts={accounts}
          rates={rates}
          onClose={() => setShowStock(false)}
          onSave={async data => {
            if (editStock) await api.stocks.update(editStock.id, data)
            else await api.stocks.create(data)
            setShowStock(false)
            reload()
          }}
          onDelete={editStock ? async () => {
            await api.stocks.delete(editStock.id)
            setShowStock(false)
            reload()
          } : undefined}
        />
      )}

      {showAccount && (
        <AccountModal
          accounts={accounts}
          onClose={() => setShowAccount(false)}
          onCreate={async data => { await api.accounts.create(data); reload() }}
          onUpdate={async (id, data) => { await api.accounts.update(id, data); reload() }}
          onDelete={async id => {
            await api.accounts.delete(id)
            if (selectedId === id) setSelectedId(null)
            reload()
          }}
        />
      )}
    </div>
  )
}
