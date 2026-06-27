import { useState } from 'react'

// ティッカー → ドメイン マッピング（Clearbit ロゴ用）
const DOMAIN: Record<string, string> = {
  // 日本株
  '2914': 'jt.com',
  '5020': 'eneos.co.jp',
  '8306': 'mufg.jp',
  '8804': 'tatemono.co.jp',
  '5401': 'nipponsteel.com',
  '5411': 'jfe-holdings.co.jp',
  '9434': 'softbank.jp',
  '5019': 'idemitsu.com',
  '8001': 'itochu.co.jp',
  '8151': 'toyo-techno.co.jp',
  // US株
  'TSLA': 'tesla.com',
  'GOOG': 'abc.xyz',
  'NVDA': 'nvidia.com',
  'ASTS': 'ast-science.com',
  'SOFI': 'sofi.com',
  'IONQ': 'ionq.com',
  'ZETA': 'zetaglobal.com',
  'JMIA': 'jumia.com',
  'BTI':  'bat.com',
  'DEFT': 'deftechgroup.com',
}

// ティッカー → バッジ色
const COLORS = [
  '#3b82f6','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#06b6d4','#14b8a6','#6366f1',
]
function badgeColor(ticker: string) {
  let hash = 0
  for (const c of ticker) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return COLORS[Math.abs(hash) % COLORS.length]
}

// バッジ表示文字（銘柄名の先頭1〜2文字）
function initials(ticker: string, name: string): string {
  if (/^\d+$/.test(ticker)) {
    // 日本株: 社名の先頭1文字（カナ/漢字）
    return name.slice(0, 1)
  }
  return ticker.slice(0, 2)
}

interface Props {
  ticker: string
  name: string
  size?: number   // px
}

export default function StockLogo({ ticker, name, size = 36 }: Props) {
  const [failed, setFailed] = useState(false)

  const domain = DOMAIN[ticker]
  const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : null

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={ticker}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="rounded-lg object-contain bg-white flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }

  // フォールバック: 色付きイニシャルバッジ
  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-white"
      style={{
        width: size,
        height: size,
        background: badgeColor(ticker),
        fontSize: size * 0.38,
      }}
    >
      {initials(ticker, name)}
    </div>
  )
}
