import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { fmt } from '../../utils/calc'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6']

interface DataItem {
  name: string
  fullName?: string
  value: number
  color?: string
}

interface Props {
  data: DataItem[]
  taxAdjusted: boolean
  centerLabel?: string
}

export default function DonutChart({ data, taxAdjusted, centerLabel = '年間配当金' }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0)

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        銘柄を追加してください
      </div>
    )
  }

  // スライス内ラベル: 略称 + %
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.05) return null
    const RADIAN = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    const pctStr = `${(percent * 100).toFixed(0)}%`
    const showName = percent >= 0.1 // 10%以上なら名前も表示

    return (
      <text textAnchor="middle" dominantBaseline="central">
        {showName && (
          <tspan x={x} y={y - 7} fill="white" fontSize={10} fontWeight="bold">
            {name}
          </tspan>
        )}
        <tspan x={x} y={showName ? y + 7 : y} fill="white" fontSize={showName ? 10 : 11}>
          {pctStr}
        </tspan>
      </text>
    )
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={68}
            outerRadius={108}
            dataKey="value"
            labelLine={false}
            label={renderLabel}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff' }}
            labelStyle={{ color: '#fff' }}
            itemStyle={{ color: '#fff' }}
            formatter={(v: number, _: string, entry: any) => [
              `¥${fmt(v)}`,
              entry.payload.fullName || entry.payload.name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* 中央テキスト */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-xs text-gray-400">{centerLabel}</div>
        <div className="text-base font-bold">¥{fmt(total)}</div>
        {taxAdjusted && <div className="text-xs text-gray-500">税引き後</div>}
      </div>

      {/* 凡例: 略称 + フルネーム */}
      <div className="px-4 mt-2 space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: d.color ?? COLORS[i % COLORS.length] }}
            />
            <span className="text-xs font-medium text-white flex-shrink-0 whitespace-nowrap">{d.name}</span>
            {d.fullName && d.fullName !== d.name && (
              <span className="text-xs text-gray-500 truncate">{d.fullName}</span>
            )}
            <span className="text-xs text-gray-400 ml-auto flex-shrink-0">¥{fmt(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
