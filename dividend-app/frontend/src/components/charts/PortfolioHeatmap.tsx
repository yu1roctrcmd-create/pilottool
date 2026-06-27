import { Treemap, ResponsiveContainer } from 'recharts'
import type { Stock, ExchangeRateMap } from '../../types'
import { calcStock, shortName } from '../../utils/calc'

interface Props {
  stocks: Stock[]
  rates: ExchangeRateMap
}

// 前日比 → TradingView風カラー
function gainColor(pct: number): string {
  if (pct >= 3)    return '#0a5c2e'
  if (pct >= 1.5)  return '#0d7a3e'
  if (pct >= 0.5)  return '#1a9c52'
  if (pct >= -0.5) return '#3a3a3a'
  if (pct >= -1.5) return '#a83232'
  if (pct >= -3)   return '#c0392b'
  return '#641e16'
}

// カスタムセル（TradingViewライクなデザイン）
const CustomContent = (props: any) => {
  const { x, y, width, height, name, pct, pctStr, fullName } = props
  if (width < 10 || height < 10) return null

  const fontSize = width < 50 ? 8 : width < 80 ? 9 : 10
  const showPct = height > 22
  const showName = height > 14 && width > 24

  return (
    <g>
      <rect
        x={x + 1} y={y + 1}
        width={width - 2} height={height - 2}
        fill={gainColor(pct)}
        stroke="#0a0a0a"
        strokeWidth={2}
        rx={3}
      />
      {showName && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showPct ? -5 : 1)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={fontSize}
          fontWeight="600"
          style={{ userSelect: 'none' }}
        >
          {name}
        </text>
      )}
      {showPct && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showName ? 8 : 1)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.75)"
          fontSize={fontSize - 1}
          style={{ userSelect: 'none' }}
        >
          {pctStr}
        </text>
      )}
      <title>{`${fullName}\n損益: ${pctStr}`}</title>
    </g>
  )
}

export default function PortfolioHeatmap({ stocks, rates }: Props) {
  const data = stocks
    .map(s => {
      const c = calcStock(s, rates, false)
      if (c.current_value <= 0) return null
      // 前日比（previous_close があれば使用、なければ 0%）
      const dayPct = (s.previous_close && s.previous_close > 0)
        ? (s.current_price - s.previous_close) / s.previous_close * 100
        : 0
      return {
        name: shortName(s),
        fullName: s.name,
        size: Math.round(c.current_value),
        pct: dayPct,
        pctStr: `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}%`,
        hasPrevClose: !!s.previous_close,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.size - a!.size) as {
      name: string; fullName: string; size: number; pct: number; pctStr: string; hasPrevClose: boolean
    }[]

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        銘柄を追加してください
      </div>
    )
  }

  const hasPrevClose = data.some(d => d.hasPrevClose)

  // 凡例データ（前日比スケール）
  const legend = [
    { label: '+3%以上', color: '#0a5c2e' },
    { label: '+1〜3%', color: '#1a9c52' },
    { label: '±0.5%',  color: '#3a3a3a' },
    { label: '-1〜3%', color: '#a83232' },
    { label: '-3%以下', color: '#641e16' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-gray-500">保有銘柄ヒートマップ（前日比・評価額）</span>
        {!hasPrevClose && (
          <span className="text-[10px] text-yellow-600">↻ 更新で前日比を反映</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <Treemap
          data={data}
          dataKey="size"
          content={<CustomContent />}
        />
      </ResponsiveContainer>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
        {legend.map(l => (
          <div key={l.label} className="flex items-center gap-1 text-[10px] text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  )
}
