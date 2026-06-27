import { useState } from 'react'

type Market = 'NI225' | 'AllJP' | 'SPX500' | 'NASDAQ'

const MARKETS: { key: Market; label: string }[] = [
  { key: 'NI225',  label: '日経225' },
  { key: 'AllJP',  label: '日本企業' },
  { key: 'SPX500', label: 'S&P 500' },
  { key: 'NASDAQ', label: 'NASDAQ' },
]

export default function TradingViewHeatmap() {
  const [state, setState] = useState<{ market: Market; ts: number }>({
    market: 'NI225',
    ts: Date.now(),
  })

  const select = (market: Market) => setState({ market, ts: Date.now() })

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-4">
        <span className="text-xs text-gray-500">市場ヒートマップ（前日比・時価総額）</span>
        <div className="flex bg-[#1c1c1e] rounded-lg overflow-hidden border border-gray-700">
          {MARKETS.map(m => (
            <button
              key={m.key}
              onClick={() => select(m.key)}
              className={`px-3 py-1 text-xs transition-colors ${
                state.market === m.key ? 'bg-[#2c2c2e] text-white' : 'text-gray-500'
              }`}
            >{m.label}</button>
          ))}
        </div>
      </div>
      <iframe
        key={`${state.market}-${state.ts}`}
        src={`/api/heatmap?market=${state.market}&_=${state.ts}`}
        width="100%"
        height="420"
        frameBorder="0"
        scrolling="no"
        style={{ display: 'block' }}
      />
    </div>
  )
}
