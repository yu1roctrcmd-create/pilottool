const express = require('express');
const router = express.Router();

async function fetchNewsRSS(query, locale) {
  const { hl, gl, ceid } = locale
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}&num=10`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return []
    const xml = await res.text()

    const items = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1]
      const title   = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/))?.[1] ?? ''
      const link    = (block.match(/<link>(.*?)<\/link>/))?.[1] ?? ''
      const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] ?? ''
      const source  = (block.match(/<source[^>]*>(.*?)<\/source>/))?.[1] ?? ''

      // Googleニュース経由のリダイレクトURLを元記事URLに変換
      const articleLink = link.includes('news.google.com')
        ? link.replace(/^.*?url=/, '')
        : link

      if (title) {
        items.push({
          title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"),
          link: articleLink,
          pubDate: pubDate ? new Date(pubDate).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
          source: source.replace(/&amp;/g, '&'),
        })
      }
      if (items.length >= 8) break
    }
    return items
  } catch (e) {
    console.error('[news] 取得失敗:', e.message)
    return []
  }
}

// GET /api/news/:ticker?name=銘柄名
router.get('/:ticker', async (req, res) => {
  const { ticker } = req.params
  const { name } = req.query
  const isJP = /^\d+$/.test(ticker)

  let items
  if (isJP) {
    // 日本株: 会社名で検索
    const query = name ? `${name} 株式` : `${ticker} 株式`
    items = await fetchNewsRSS(query, { hl: 'ja', gl: 'JP', ceid: 'JP:ja' })
  } else {
    // 米国株: ティッカーと会社名で検索
    const query = name ? `${ticker} ${name}` : `${ticker} stock`
    items = await fetchNewsRSS(query, { hl: 'ja', gl: 'JP', ceid: 'JP:ja' })
  }

  res.json(items)
})

module.exports = router
