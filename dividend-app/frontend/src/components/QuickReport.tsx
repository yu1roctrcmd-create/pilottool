import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { FinancialsData } from '../api/client'

interface Props {
  ticker: string
}

// 億円表示
function fmtOku(v: number | null): string {
  if (v === null || v === undefined) return '—'
  const oku = v / 1e8
  if (Math.abs(oku) >= 10000) return `${(oku / 10000).toFixed(1)}兆`
  if (Math.abs(oku) >= 1000) return `${(oku / 1000).toFixed(1)}千億`
  return `${Math.round(oku)}億`
}

function fmtNum(v: number | null, dec = 1): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(dec)
}

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(1)}%`
}

// 年度表示を短縮（"2024/12" → "24/12"）
function shortYear(y: string): string {
  return y.replace(/^20/, '')
}

export default function QuickReport({ ticker }: Props) {
  const [data, setData] = useState<FinancialsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    api.financials.get(ticker)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [ticker])

  if (loading) {
    return (
      <div className="py-4 text-center text-xs text-gray-500 animate-pulse">
        データ取得中…
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-3 text-center text-xs text-red-400">
        データ取得失敗
      </div>
    )
  }

  if (!data || data.source === 'none') {
    return (
      <div className="py-3 text-center text-xs text-gray-500">
        日本株のみ対応
      </div>
    )
  }

  if (data.years.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-gray-500">
        データなし
      </div>
    )
  }

  const { years, current } = data

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-3">

      {/* 年別財務テーブル */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] min-w-[300px]">
          <thead>
            <tr>
              <th className="text-left text-gray-500 pb-1 pr-2 font-normal">年度</th>
              <th className="text-right text-gray-500 pb-1 pr-2 font-normal">売上</th>
              <th className="text-right text-gray-500 pb-1 pr-2 font-normal">営業利益</th>
              <th className="text-right text-gray-500 pb-1 pr-2 font-normal">EPS</th>
              <th className="text-right text-gray-500 pb-1 pr-2 font-normal">DPS</th>
              <th className="text-right text-gray-500 pb-1 pr-2 font-normal">配当性向</th>
              <th className="text-right text-gray-500 pb-1 pr-2 font-normal">ROE</th>
              <th className="text-right text-gray-500 pb-1 font-normal">ROA</th>
            </tr>
          </thead>
          <tbody>
            {years.map(y => (
              <tr key={y.year} className="border-t border-white/5">
                <td className="py-1 pr-2 text-gray-400 whitespace-nowrap">
                  {shortYear(y.year)}
                  {y.forecast && <span className="text-[9px] text-yellow-500 ml-1">予</span>}
                </td>
                <td className="py-1 pr-2 text-right text-gray-300">{fmtOku(y.revenue)}</td>
                <td className="py-1 pr-2 text-right text-gray-300">{fmtOku(y.operatingIncome)}</td>
                <td className="py-1 pr-2 text-right text-gray-300">{fmtNum(y.eps)}</td>
                <td className="py-1 pr-2 text-right text-gray-300">{fmtNum(y.dps, 0)}</td>
                <td className="py-1 pr-2 text-right text-gray-300">{fmtPct(y.payoutRatio)}</td>
                <td className="py-1 pr-2 text-right text-gray-300">{fmtPct(y.roe)}</td>
                <td className="py-1 text-right text-gray-300">{fmtPct(y.roa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 現在の指標グリッド */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'PER', value: current.per !== null ? `${fmtNum(current.per)}x` : '—' },
          { label: 'PBR', value: current.pbr !== null ? `${fmtNum(current.pbr, 2)}x` : '—' },
          { label: '配当利回', value: current.dividendYield !== null ? `${fmtNum(current.dividendYield)}%` : '—' },
          { label: '配当性向', value: fmtPct(current.payoutRatio) },
          { label: 'EPS', value: fmtNum(current.eps) },
          { label: '1株配', value: fmtNum(current.dividendRate, 0) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
            <div className="text-gray-500 text-[10px]">{label}</div>
            <div className="text-white text-xs font-medium mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-gray-600 text-right">
        出典: <a href={`https://irbank.net/${ticker}`} target="_blank" rel="noopener noreferrer"
          className="underline hover:text-gray-400">IRBank</a>
      </div>
    </div>
  )
}
