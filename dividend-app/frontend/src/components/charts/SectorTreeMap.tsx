import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { fmt } from '../../utils/calc'

const COLORS = ['#f97316', '#eab308', '#06b6d4', '#8b5cf6', '#22c55e', '#ef4444', '#3b82f6', '#ec4899']

interface Props {
  data: { name: string; value: number }[]
}

const CustomContent = (props: any) => {
  const { x, y, width, height, name, value, index, root } = props
  if (width < 30 || height < 30) return null
  const total = root?.value || 1
  const pct = ((value / total) * 100).toFixed(1)
  const color = COLORS[index % COLORS.length]
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={4} />
      <text x={x + width / 2} y={y + height / 2 - 8} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold">
        {name}
      </text>
      <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="#fff" fontSize={12}>
        {pct}%
      </text>
    </g>
  )
}

export default function SectorTreeMap({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        データがありません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <Treemap
        data={data}
        dataKey="value"
        content={<CustomContent />}
      >
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
          formatter={(v: number) => [`¥${fmt(v)}`, '']}
        />
      </Treemap>
    </ResponsiveContainer>
  )
}
