import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { api } from '../api/client'
import type { HistoryEntry, Goals } from '../api/client'
import type { Account } from '../types'
import { fmt } from '../utils/calc'

type TrendMode = 'dividend' | 'asset'
type Period = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'

const PERIODS: { label: string; key: Period }[] = [
  { label: '1週間', key: '1W' },
  { label: '1ヶ月', key: '1M' },
  { label: '3ヶ月', key: '3M' },
  { label: '6ヶ月', key: '6M' },
  { label: '年初来', key: 'YTD' },
  { label: '1年', key: '1Y' },
  { label: '全期間', key: 'ALL' },
]

function filterByPeriod(history: HistoryEntry[], period: Period): HistoryEntry[] {
  if (history.length === 0) return []
  const today = new Date()
  let cutoff: Date | null = null

  if (period === '1W') { cutoff = new Date(today); cutoff.setDate(today.getDate() - 7) }
  else if (period === '1M') { cutoff = new Date(today); cutoff.setMonth(today.getMonth() - 1) }
  else if (period === '3M') { cutoff = new Date(today); cutoff.setMonth(today.getMonth() - 3) }
  else if (period === '6M') { cutoff = new Date(today); cutoff.setMonth(today.getMonth() - 6) }
  else if (period === 'YTD') { cutoff = new Date(today.getFullYear(), 0, 1) }
  else if (period === '1Y') { cutoff = new Date(today); cutoff.setFullYear(today.getFullYear() - 1) }
  else { return history }

  const cutoffStr = cutoff.toISOString().split('T')[0]
  const filtered = history.filter(h => h.date >= cutoffStr)
  return filtered.length > 0 ? filtered : [history[history.length - 1]]
}

function formatDate(date: string, period: Period): string {
  const d = new Date(date)
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (period === '1Y' || period === 'ALL') return `${d.getFullYear() % 100}/${m}`
  return `${m}/${day}`
}

function diffLabel(val: number, ref: number): { text: string; positive: boolean } {
  const diff = val - ref
  const pct = ref > 0 ? (diff / ref * 100) : 0
  const sign = diff >= 0 ? '+' : ''
  return {
    text: `${sign}${fmt(Math.round(diff))}円 (${sign}${pct.toFixed(2)}%)`,
    positive: diff >= 0,
  }
}

interface Props {
  accounts: Account[]
}

export default function TrendView({ accounts }: Props) {
  const [mode, setMode] = useState<TrendMode>('dividend')
  const [period, setPeriod] = useState<Period>('1W')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [goals, setGoals] = useState<Goals>({ dividend: null, asset: null })
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [showPeriods, setShowPeriods] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.history.list(), api.history.getGoals()])
      .then(([hist, g]) => {
        setHistory(hist)
        setGoals(g)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = filterByPeriod(history, period)
  const latest = filtered[filtered.length - 1]
  const total = latest ? (mode === 'dividend' ? latest.dividend_total : latest.asset_total) : 0

  // 比較: 1週間前・前日
  const weekAgoEntry = (() => {
    if (history.length < 2) return null
    const latestDate = latest?.date
    if (!latestDate) return null
    const cutoff = new Date(latestDate)
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    // 最も近い7日前エントリ
    const candidates = history.filter(h => h.date <= cutoffStr)
    return candidates.length > 0 ? candidates[candidates.length - 1] : null
  })()

  const prevDayEntry = (() => {
    if (filtered.length < 2) return null
    return filtered[filtered.length - 2]
  })()

  const weekAgoTotal = weekAgoEntry ? (mode === 'dividend' ? weekAgoEntry.dividend_total : weekAgoEntry.asset_total) : null
  const prevDayTotal = prevDayEntry ? (mode === 'dividend' ? prevDayEntry.dividend_total : prevDayEntry.asset_total) : null

  // チャートデータ
  const chartData = filtered.map(h => {
    const entry: Record<string, number | string> = { date: formatDate(h.date, period) }
    accounts.forEach(a => {
      const acc = h.by_account[String(a.id)]
      entry[String(a.id)] = acc ? (mode === 'dividend' ? acc.dividend : acc.asset) : 0
    })
    return entry
  })

  // 目標
  const currentGoal = mode === 'dividend' ? goals.dividend : goals.asset
  const progress = currentGoal && total > 0 ? Math.min((total / currentGoal) * 100, 100) : null
  const remaining = currentGoal ? currentGoal - total : null

  const formatGoalInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits === '') return ''
    return Number(digits).toLocaleString('ja-JP')
  }

  const handleSaveGoal = async () => {
    const val = goalInput.replace(/,/g, '')
    const num = val === '' ? null : Number(val)
    if (num !== null && isNaN(num)) return
    const updated = mode === 'dividend'
      ? await api.history.setGoals({ dividend: num ?? undefined })
      : await api.history.setGoals({ asset: num ?? undefined })
    setGoals(updated)
    setEditingGoal(false)
  }

  const currentPeriodLabel = PERIODS.find(p => p.key === period)?.label ?? '1週間'

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">読み込み中…</div>
  }

  return (
    <div className="px-4 pb-4">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-800 mb-4">
        {([['dividend', '配当金額推移'], ['asset', '資産評価額推移']] as [TrendMode, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              mode === key ? 'border-red-500 text-white' : 'border-transparent text-gray-500'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* 合計表示 */}
      <div className="text-center mb-4">
        <div className="text-xs text-gray-400 mb-1">
          {mode === 'dividend' ? '総計年間配当金：' : '総計資産評価額：'}
        </div>
        <div className="text-4xl font-bold tracking-tight">
          {fmt(total)}<span className="text-xl font-normal ml-1">円</span>
        </div>
        <div className="mt-2 space-y-0.5 text-sm">
          {weekAgoTotal !== null && (
            <div className={weekAgoTotal !== null ? (total - weekAgoTotal >= 0 ? 'text-blue-400' : 'text-red-400') : 'text-gray-500'}>
              1週間前比：{weekAgoTotal !== null ? diffLabel(total, weekAgoTotal).text : '—'}
            </div>
          )}
          {prevDayTotal !== null && (
            <div className={total - prevDayTotal >= 0 ? 'text-blue-400' : 'text-red-400'}>
              前日比：{diffLabel(total, prevDayTotal).text}
            </div>
          )}
          {weekAgoTotal === null && prevDayTotal === null && (
            <div className="text-gray-600 text-xs">データが蓄積されると比較が表示されます</div>
          )}
        </div>
      </div>

      {/* 目標 */}
      <div className="bg-[#1a1a1a] rounded-2xl p-4 mb-4">
        {editingGoal ? (
          <div>
            <div className="text-xs text-gray-400 mb-2">
              {mode === 'dividend' ? '年間配当金' : '資産評価額'}の目標を設定
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={goalInput}
                onChange={e => setGoalInput(formatGoalInput(e.target.value))}
                placeholder="例: 200,000"
                className="flex-1 bg-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveGoal}
                className="px-4 py-2 bg-blue-600 rounded-xl text-sm font-medium"
              >保存</button>
              <button
                onClick={() => setEditingGoal(false)}
                className="px-3 py-2 text-gray-500 text-sm"
              >✕</button>
            </div>
          </div>
        ) : currentGoal ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">
                {mode === 'dividend' ? '配当金' : '資産'}目標：¥{fmt(currentGoal)}
              </span>
              <button
                onClick={() => { setGoalInput(currentGoal ? currentGoal.toLocaleString('ja-JP') : ''); setEditingGoal(true) }}
                className="text-xs text-gray-600 hover:text-gray-400"
              >編集</button>
            </div>
            {/* プログレスバー */}
            <div className="w-full bg-[#2a2a2a] rounded-full h-3 overflow-hidden mb-2">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  progress! >= 100 ? 'bg-yellow-400' : progress! >= 75 ? 'bg-green-500' : progress! >= 50 ? 'bg-blue-500' : 'bg-blue-600'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className={progress! >= 100 ? 'text-yellow-400 font-bold' : 'text-gray-300'}>
                {progress! >= 100
                  ? '🎉 目標達成！'
                  : `あと ¥${fmt(Math.abs(remaining!))} (${progress!.toFixed(1)}%)`}
              </span>
              <span className="text-gray-600">{progress!.toFixed(1)}%</span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setGoalInput(''); setEditingGoal(true) }}

            className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-300 py-1"
          >
            <span className="text-lg">🎯</span>
            <span>{mode === 'dividend' ? '配当金' : '資産評価額'}の目標を設定してモチベーションアップ</span>
          </button>
        )}
      </div>

      {/* 表示期間 */}
      <div className="relative flex items-center justify-end mb-3">
        <button
          onClick={() => setShowPeriods(v => !v)}
          className="flex items-center gap-1 bg-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-white border border-gray-700"
        >
          {currentPeriodLabel} <span className="text-gray-400">⌄</span>
        </button>
        {showPeriods && (
          <div className="absolute right-0 top-8 bg-[#2a2a2a] rounded-xl shadow-lg z-20 overflow-hidden border border-gray-700 min-w-24">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => { setPeriod(p.key); setShowPeriods(false) }}
                className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  period === p.key ? 'text-white bg-white/10' : 'text-gray-400 hover:bg-white/5'
                }`}
              >{p.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* チャート */}
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-600 text-sm bg-[#1a1a1a] rounded-2xl">
          データがありません
        </div>
      ) : chartData.length === 1 ? (
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex flex-col items-center justify-center h-40">
          <div className="text-gray-500 text-sm">今日のデータを記録しました</div>
          <div className="text-xs text-gray-600 mt-1">毎日蓄積されると推移グラフが表示されます</div>
        </div>
      ) : (
        <div className="bg-[#161616] rounded-2xl p-2">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                {accounts.map(a => (
                  <linearGradient key={a.id} id={`grad-${a.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={a.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={a.color} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => v >= 10000 ? `${Math.round(v / 10000)}万` : String(v)}
                width={36}
              />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af', fontSize: 11 }}
                itemStyle={{ color: '#e5e7eb', fontSize: 11 }}
                formatter={(v: number, name: string) => {
                  const acc = accounts.find(a => String(a.id) === name)
                  return [`¥${fmt(v)}`, acc?.name ?? name]
                }}
              />
              {currentGoal && (
                <ReferenceLine
                  y={currentGoal}
                  stroke="#eab308"
                  strokeDasharray="4 4"
                  label={{ value: '目標', fill: '#eab308', fontSize: 10, position: 'insideTopRight' }}
                />
              )}
              {accounts.map(a => (
                <Area
                  key={a.id}
                  type="monotone"
                  dataKey={String(a.id)}
                  stackId="1"
                  stroke={a.color}
                  fill={`url(#grad-${a.id})`}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 口座別内訳 */}
      {latest && (
        <div className="mt-4 space-y-2">
          {accounts
            .map(a => ({
              account: a,
              val: latest.by_account[String(a.id)]
                ? (mode === 'dividend'
                    ? latest.by_account[String(a.id)].dividend
                    : latest.by_account[String(a.id)].asset)
                : 0
            }))
            .filter(x => x.val > 0)
            .sort((a, b) => b.val - a.val)
            .map(({ account, val }) => {
              const prev = prevDayEntry
                ? (mode === 'dividend'
                    ? prevDayEntry.by_account[String(account.id)]?.dividend
                    : prevDayEntry.by_account[String(account.id)]?.asset)
                : null
              const diff = prev != null ? val - prev : null

              return (
                <div key={account.id} className="bg-[#1a1a1a] rounded-xl px-4 py-3 flex items-center gap-3">
                  <div
                    className="w-1 h-8 rounded-full flex-shrink-0"
                    style={{ background: account.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400 truncate">{account.name}</div>
                    {diff != null && (
                      <div className={`text-xs ${diff >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                        前日比 {diff >= 0 ? '+' : ''}{fmt(diff)}円
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-bold text-white">
                    {mode === 'dividend' ? '年間配当：' : '評価額：'}
                    {fmt(val)}円
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
