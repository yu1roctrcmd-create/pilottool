import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { fmt } from '../../utils/calc'
import type { MonthlyBreakdown } from '../../utils/calc'

interface TickerInfo {
  ticker: string
  name: string
  color: string
  key: string
}

interface Props {
  rows: MonthlyBreakdown[]
  tickers: TickerInfo[]
}

// 配当金額の高い順に並べたカスタムツールチップ
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  // value > 0 のエントリを金額の高い順にソート
  const sorted = [...payload]
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = sorted.reduce((s, p) => s + p.value, 0)

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', minWidth: 180 }}>
      <p style={{ color: '#fff', fontWeight: 600, marginBottom: 6, fontSize: 13 }}>{label}月</p>
      {sorted.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <span style={{ color: '#9ca3af', fontSize: 11, width: 36, flexShrink: 0 }}>{p.name.split('_')[0]}</span>
          <span style={{ color: '#e5e7eb', fontSize: 11, marginLeft: 'auto' }}>¥{fmt(p.value)}</span>
        </div>
      ))}
      {sorted.length > 1 && (
        <div style={{ borderTop: '1px solid #333', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#6b7280', fontSize: 11 }}>合計</span>
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>¥{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

export default function MonthlyChart({ rows, tickers }: Props) {
  const avg = rows.reduce((s, d) => s + d.total, 0) / 12
  const total = rows.reduce((s, d) => s + d.total, 0)
  const max = Math.max(...rows.map(d => d.total), 1)

  return (
    <div>
      {/* 積み上げ棒グラフ */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="month"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, max * 1.3]} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={avg} stroke="#4b5563" strokeDasharray="4 4" />
          {tickers.map(t => (
            <Bar
              key={t.key}
              dataKey={t.key}
              stackId="a"
              fill={t.color}
              radius={tickers[tickers.length - 1].key === t.key ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* 凡例 */}
      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 mt-2">
          {tickers.map(t => (
            <div key={t.key} className="flex items-center gap-1 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: t.color }} />
              <span>{t.ticker}</span>
            </div>
          ))}
        </div>
      )}

      {/* 月別内訳テーブル */}
      <div className="mt-4 space-y-2">
        {rows.filter(r => r.total > 0).map(r => (
          <div key={r.month} className="bg-[#161616] rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">{r.month}月</span>
              <span className="text-sm font-bold text-white">¥{fmt(r.total)}</span>
            </div>
            <div className="space-y-1">
              {r.stocks.sort((a, b) => b.value - a.value).map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-xs text-gray-600 w-10 flex-shrink-0">{s.ticker}</span>
                  <span className="text-xs text-gray-400 flex-1 truncate">{s.name}</span>
                  <div className="text-right">
                    <div className="text-xs text-gray-300">¥{fmt(s.value)}</div>
                    {s.currency && s.valueOriginal !== undefined && (
                      <div className="text-xs text-gray-600">{s.valueOriginal.toFixed(2)} {s.currency}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {rows.every(r => r.total === 0) && (
          <div className="text-center py-8 text-gray-600 text-sm">
            権利確定月・支払い月を設定してください
          </div>
        )}
      </div>

      <div className="flex justify-between text-xs text-gray-600 mt-3 px-1">
        <span>月平均：¥{fmt(avg)}</span>
        <span>年間合計：¥{fmt(total)}</span>
      </div>
    </div>
  )
}
