import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { NewsItem } from '../api/client'

interface Props {
  ticker: string
  name: string
}

export default function StockNews({ ticker, name }: Props) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.news.get(ticker, name)
      .then(setNews)
      .catch(() => setNews([]))
      .finally(() => setLoading(false))
  }, [ticker, name])

  if (loading) {
    return (
      <div className="pt-2 pb-1 text-xs text-gray-600 text-center animate-pulse">
        ニュース取得中…
      </div>
    )
  }

  if (news.length === 0) {
    return (
      <div className="pt-2 pb-1 text-xs text-gray-600 text-center">
        ニュースが見つかりませんでした
      </div>
    )
  }

  return (
    <div className="pt-2 space-y-2">
      {news.map((item, i) => (
        <a
          key={i}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="block bg-[#111] rounded-xl px-3 py-2.5 hover:bg-[#222] transition-colors"
        >
          <div className="text-xs text-gray-200 leading-snug mb-1.5 line-clamp-2">
            {item.title}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-600 truncate">{item.source}</span>
            <span className="text-[10px] text-gray-700 flex-shrink-0">{item.pubDate}</span>
          </div>
        </a>
      ))}
    </div>
  )
}
