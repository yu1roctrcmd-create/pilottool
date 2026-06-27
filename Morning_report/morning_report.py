#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
毎朝7時の市場レポート
- 米国市場（為替・金利・主要指数）
- ポートフォリオ銘柄の値動き
- 3種のグラフをHTML形式でGmailに送信
- Slack にテキストサマリーを通知
"""

import json
import os
import io
import re
import smtplib
import traceback
import urllib.request
import xml.etree.ElementTree as ET
from html import unescape
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from datetime import datetime

import pytz
import yfinance as yf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib import rcParams
import numpy as np

# ====== パス設定 ======
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, 'config.json')
LOG_PATH = os.path.join(SCRIPT_DIR, 'report.log')

# ====== 設定読み込み ======
with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
    config = json.load(f)

JST = pytz.timezone("Asia/Tokyo")

# ====== 日本語フォント設定（macOS） ======
import matplotlib.font_manager as fm
_fonts = {f.name for f in fm.fontManager.ttflist}
for _jp_font in ['Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'AppleGothic', 'Osaka']:
    if _jp_font in _fonts:
        rcParams['font.family'] = _jp_font
        break

rcParams['figure.dpi'] = 150
rcParams['savefig.dpi'] = 150
rcParams['axes.unicode_minus'] = False


# ============================================================
# データ取得
# ============================================================

def get_ticker_data(tickers: list) -> dict:
    """複数ティッカーの最新価格・前日比を取得"""
    results = {}
    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="5d")  # バッファを多めに
            hist = hist[hist['Close'].notna()]
            if len(hist) >= 2:
                price      = float(hist['Close'].iloc[-1])
                prev_close = float(hist['Close'].iloc[-2])
                change     = price - prev_close
                change_pct = (change / prev_close * 100) if prev_close != 0 else 0
                results[ticker] = {
                    'price': price,
                    'prev_close': prev_close,
                    'change': change,
                    'change_pct': change_pct,
                }
            elif len(hist) == 1:
                price = float(hist['Close'].iloc[-1])
                results[ticker] = {'price': price, 'prev_close': price,
                                   'change': 0, 'change_pct': 0}
        except Exception as e:
            results[ticker] = {'error': str(e)}
    return results


def get_historical_data(tickers: list, period: str = "30d") -> dict:
    """チャート用の履歴データを取得"""
    results = {}
    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period=period)
            if not hist.empty:
                results[ticker] = hist['Close'].dropna()
        except Exception as e:
            print(f"履歴データ取得失敗 {ticker}: {e}")
    return results


# ============================================================
# チャート生成
# ============================================================

def _save_fig(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def make_daily_change_chart(portfolio_data: dict, positions: list) -> bytes:
    """① 銘柄別 前日比（%）横棒グラフ"""
    rows = []
    seen = set()
    for pos in positions:
        tk = pos['ticker']
        if tk in seen:
            continue
        seen.add(tk)
        d = portfolio_data.get(tk, {})
        if 'change_pct' not in d:
            continue
        rows.append((tk, pos.get('name', tk), d['change_pct']))

    if not rows:
        return None

    # 変化率でソート
    rows.sort(key=lambda x: x[2])
    tickers  = [f"{r[0]}\n{r[1]}" for r in rows]
    changes  = [r[2] for r in rows]
    colors   = ['#00C176' if c >= 0 else '#FF4B4B' for c in changes]

    fig, ax = plt.subplots(figsize=(13, max(6, len(rows) * 0.55 + 2)))
    bars = ax.barh(range(len(rows)), changes, color=colors, height=0.6, alpha=0.88)

    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels(tickers, fontsize=9)
    ax.axvline(0, color='#888', linewidth=0.8, linestyle='--')
    ax.set_xlabel('前日比 (%)', fontsize=11)
    ax.set_title('ポートフォリオ　銘柄別　前日比', fontsize=14, fontweight='bold', pad=12)
    ax.grid(axis='x', alpha=0.3, linestyle=':')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.set_facecolor('#F8F9FA')

    for bar, chg in zip(bars, changes):
        sign = '+' if chg >= 0 else ''
        offset = max(abs(chg) * 0.02, 0.05)
        ax.text(chg + (offset if chg >= 0 else -offset),
                bar.get_y() + bar.get_height() / 2,
                f'{sign}{chg:.2f}%',
                va='center',
                ha='left' if chg >= 0 else 'right',
                fontsize=8, color='#222')

    plt.tight_layout()
    return _save_fig(fig)


def make_pnl_chart(portfolio_data: dict, positions: list, usdjpy: float) -> bytes:
    """② 含み損益率（取得価格比）横棒グラフ"""
    ticker_cost_jpy    = {}
    ticker_current_jpy = {}

    for pos in positions:
        tk       = pos['ticker']
        shares   = pos.get('shares', 0)
        currency = pos.get('currency', 'usd')
        avg_cost = pos.get('avg_cost', 0)

        d = portfolio_data.get(tk, {})
        if 'price' not in d or shares == 0 or avg_cost == 0:
            continue

        current_price = d['price']

        if currency == 'jpy':
            cost_jpy    = shares * avg_cost
            cur_jpy     = shares * current_price
        elif currency == 'usd':
            cost_jpy    = shares * avg_cost * usdjpy
            cur_jpy     = shares * current_price * usdjpy
        elif currency == 'jpy_usd':
            # avg_cost = 取得単価（JPY建て）、current_price = USD
            cost_jpy    = shares * avg_cost
            cur_jpy     = shares * current_price * usdjpy
        else:
            continue

        ticker_cost_jpy[tk]    = ticker_cost_jpy.get(tk, 0)    + cost_jpy
        ticker_current_jpy[tk] = ticker_current_jpy.get(tk, 0) + cur_jpy

    if not ticker_cost_jpy:
        return None

    rows = []
    for tk in ticker_cost_jpy:
        cost = ticker_cost_jpy[tk]
        cur  = ticker_current_jpy[tk]
        if cost == 0:
            continue
        pnl_pct = (cur - cost) / cost * 100
        pnl_jpy = cur - cost
        rows.append((tk, pnl_pct, pnl_jpy))

    rows.sort(key=lambda x: x[1])
    labels   = [r[0] for r in rows]
    pnl_pcts = [r[1] for r in rows]
    pnl_jpys = [r[2] for r in rows]
    colors   = ['#00C176' if p >= 0 else '#FF4B4B' for p in pnl_pcts]

    fig, ax = plt.subplots(figsize=(13, max(6, len(rows) * 0.55 + 2)))
    bars = ax.barh(range(len(rows)), pnl_pcts, color=colors, height=0.6, alpha=0.88)

    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels(labels, fontsize=10)
    ax.axvline(0, color='#888', linewidth=0.8, linestyle='--')
    ax.set_xlabel('含み損益率 (%)', fontsize=11)
    ax.set_title('ポートフォリオ　含み損益率（取得価格比）', fontsize=14, fontweight='bold', pad=12)
    ax.grid(axis='x', alpha=0.3, linestyle=':')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.set_facecolor('#F8F9FA')

    for bar, pct, jpy in zip(bars, pnl_pcts, pnl_jpys):
        sign = '+' if pct >= 0 else ''
        jpy_str = f'{sign}{jpy:,.0f}円'
        offset = max(abs(pct) * 0.02, 0.3)
        ax.text(pct + (offset if pct >= 0 else -offset),
                bar.get_y() + bar.get_height() / 2,
                f'{sign}{pct:.1f}%  ({jpy_str})',
                va='center',
                ha='left' if pct >= 0 else 'right',
                fontsize=8, color='#222')

    plt.tight_layout()
    return _save_fig(fig)


def make_forex_rate_chart(historical_data: dict) -> bytes:
    """③ USD/JPY・米10年金利・Gold　30日推移（2段構成）"""
    usdjpy_data = historical_data.get('JPY=X')
    tnx_data    = historical_data.get('^TNX')
    gold_data   = historical_data.get('GC=F')

    if usdjpy_data is None and tnx_data is None and gold_data is None:
        return None

    fig, (ax_top, ax_bot) = plt.subplots(
        2, 1, figsize=(13, 9),
        gridspec_kw={'height_ratios': [1, 1], 'hspace': 0.45},
        constrained_layout=False
    )
    fig.subplots_adjust(hspace=0.5)
    fig.patch.set_facecolor('#FFFFFF')

    # ---- 上段: USD/JPY ＋ 米10年金利 ----
    ax_top.set_facecolor('#F8F9FA')
    lines_top, labels_top = [], []

    if usdjpy_data is not None and len(usdjpy_data) > 0:
        dates = [d.to_pydatetime() for d in usdjpy_data.index]
        vals  = usdjpy_data.values
        l1, = ax_top.plot(dates, vals, color='#2196F3', linewidth=2.0, label='USD/JPY')
        ax_top.fill_between(dates, vals, alpha=0.08, color='#2196F3')
        ax_top.set_ylabel('USD/JPY（円）', color='#2196F3', fontsize=10)
        ax_top.tick_params(axis='y', labelcolor='#2196F3')
        lines_top.append(l1); labels_top.append('USD/JPY')

    if tnx_data is not None and len(tnx_data) > 0:
        ax_top2 = ax_top.twinx()
        dates2  = [d.to_pydatetime() for d in tnx_data.index]
        vals2   = tnx_data.values
        l2, = ax_top2.plot(dates2, vals2, color='#FF9800', linewidth=2.0,
                           linestyle='--', label='米10年金利')
        ax_top2.set_ylabel('米10年国債利回り（%）', color='#FF9800', fontsize=10)
        ax_top2.tick_params(axis='y', labelcolor='#FF9800')
        lines_top.append(l2); labels_top.append('米10年金利')

    ax_top.set_title('USD/JPY・米10年金利　30日推移', fontsize=13, fontweight='bold', pad=10)
    ax_top.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
    ax_top.xaxis.set_major_locator(mdates.WeekdayLocator(interval=1))
    plt.setp(ax_top.xaxis.get_majorticklabels(), rotation=45, ha='right', fontsize=8)
    ax_top.legend(lines_top, labels_top, loc='upper left', fontsize=9)
    ax_top.grid(alpha=0.3, linestyle=':')
    ax_top.spines['top'].set_visible(False)

    # ---- 下段: Gold（GC=F）----
    ax_bot.set_facecolor('#F8F9FA')

    if gold_data is not None and len(gold_data) > 0:
        dates3 = [d.to_pydatetime() for d in gold_data.index]
        vals3  = gold_data.values
        ax_bot.plot(dates3, vals3, color='#FFD700', linewidth=2.2, label='Gold（USD/oz）')
        ax_bot.fill_between(dates3, vals3, alpha=0.10, color='#FFD700')
        ax_bot.set_ylabel('Gold（USD/oz）', color='#B8860B', fontsize=10)
        ax_bot.tick_params(axis='y', labelcolor='#B8860B')
        ax_bot.legend(loc='upper left', fontsize=9)
    else:
        ax_bot.text(0.5, 0.5, 'Gold データなし', ha='center', va='center',
                    transform=ax_bot.transAxes, color='#999')

    ax_bot.set_title('Gold　30日推移', fontsize=13, fontweight='bold', pad=10)
    ax_bot.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
    ax_bot.xaxis.set_major_locator(mdates.WeekdayLocator(interval=1))
    plt.setp(ax_bot.xaxis.get_majorticklabels(), rotation=45, ha='right', fontsize=8)
    ax_bot.grid(alpha=0.3, linestyle=':')
    ax_bot.spines['top'].set_visible(False)
    ax_bot.spines['right'].set_visible(False)

    return _save_fig(fig)


# ============================================================
# ニュース取得（RSS）
# ============================================================

def get_news(num: int = 5) -> list:
    """主要RSSフィードから世界の政治経済ニュースを取得"""
    feeds = [
        ('Reuters',  'https://feeds.reuters.com/reuters/topNews'),
        ('BBC',      'https://feeds.bbci.co.uk/news/world/rss.xml'),
        ('CNBC',     'https://www.cnbc.com/id/100003114/device/rss/rss.html'),
        ('NYTimes',  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'),
    ]

    _tag_re  = re.compile(r'<[^>]+>')
    _sp_re   = re.compile(r'\s+')
    headers  = {
        'User-Agent': (
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        )
    }

    def clean(text: str) -> str:
        text = _tag_re.sub('', text)
        text = unescape(text)
        return _sp_re.sub(' ', text).strip()

    articles = []
    for source, url in feeds:
        if len(articles) >= num * 2:
            break
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = resp.read()
            root = ET.fromstring(raw)
            # RSS 2.0: root > channel > item
            channel = root.find('channel') or root
            for item in channel.findall('item')[:6]:
                title = clean(item.findtext('title', ''))
                link  = (item.findtext('link', '')
                         or item.findtext('{http://www.w3.org/2005/Atom}link', ''))
                desc  = clean(item.findtext('description', ''))[:120]
                if title:
                    articles.append({
                        'source':  source,
                        'title':   title,
                        'link':    link,
                        'summary': desc,
                    })
        except Exception as e:
            print(f"News RSS error ({source}): {e}")

    # 重複除去して上位 num 件を返す
    seen, result = set(), []
    for a in articles:
        key = a['title'][:40]
        if key not in seen:
            seen.add(key)
            result.append(a)
        if len(result) >= num:
            break
    return result


# ============================================================
# HTMLメール生成
# ============================================================

def _pct_color(pct: float) -> str:
    return '#00C176' if pct >= 0 else '#FF4B4B'


def _fmt_pct(pct: float) -> str:
    sign = '+' if pct >= 0 else ''
    color = _pct_color(pct)
    arrow = '▲' if pct >= 0 else '▼'
    return f'<span style="color:{color};font-weight:bold">{arrow}{sign}{pct:.2f}%</span>'


def _market_row(name: str, ticker: str, market_data: dict,
                price_fmt: str = '{:.2f}', suffix: str = '') -> str:
    d = market_data.get(ticker, {})
    if 'price' not in d:
        return f'<tr><td>{name}</td><td colspan="2" style="color:#999">データなし</td></tr>'
    price = d['price']
    pct   = d['change_pct']
    formatted = price_fmt.format(price) + suffix
    return (f'<tr><td>{name}</td>'
            f'<td style="text-align:right;font-weight:bold">{formatted}</td>'
            f'<td style="text-align:right">{_fmt_pct(pct)}</td></tr>')


def build_html_email(now: datetime, market_data: dict,
                     portfolio_data: dict, positions: list,
                     news_items: list = None) -> str:
    date_str = now.strftime('%Y年%m月%d日（%A）')

    # --- 為替 ---
    forex_rows = (
        _market_row('USD/JPY', 'JPY=X',    market_data, '{:.2f}', '円') +
        _market_row('EUR/JPY', 'EURJPY=X', market_data, '{:.2f}', '円')
    )
    # --- 金利 ---
    rate_rows = (
        _market_row('米10年国債', '^TNX', market_data, '{:.3f}', '%') +
        _market_row('米2年国債',  '^IRX', market_data, '{:.3f}', '%')
    )
    # --- 主要指数 ---
    index_rows = (
        _market_row('S&P 500',  '^GSPC', market_data, '{:,.2f}') +
        _market_row('NASDAQ',   '^IXIC', market_data, '{:,.2f}') +
        _market_row('ダウ平均', '^DJI',  market_data, '{:,.2f}') +
        _market_row('VIX',      '^VIX',  market_data, '{:.2f}')
    )
    # --- コモディティ ---
    commodity_rows = (
        _market_row('金（Gold）',       'GC=F',    market_data, '${:,.2f}') +
        _market_row('WTI原油',          'CL=F',    market_data, '${:.2f}') +
        _market_row('ビットコイン',     'BTC-USD', market_data, '${:,.0f}')
    )

    # --- ニュースセクション ---
    if news_items:
        items_html = ''
        for item in news_items:
            href    = f' href="{item["link"]}"' if item.get('link') else ''
            src_tag = f'<span class="src">{item["source"]}</span>'
            sum_tag = (f'<span class="sum">{item["summary"]}</span>'
                       if item.get('summary') else '')
            items_html += (
                f'<li><a{href} target="_blank">{item["title"]}</a>'
                f'{src_tag}{sum_tag}</li>'
            )
        news_html = (
            f'<div class="news">'
            f'<h3>🌍 世界の政治経済ニュース TOP5</h3>'
            f'<ol>{items_html}</ol>'
            f'</div>'
        )
    else:
        news_html = ''

    # --- ポートフォリオテーブル ---
    portfolio_rows = ''
    seen = set()
    for pos in positions:
        tk = pos['ticker']
        if tk in seen:
            continue
        seen.add(tk)
        d = portfolio_data.get(tk, {})
        if 'price' not in d:
            continue
        price = d['price']
        pct   = d['change_pct']
        is_jpy = pos.get('currency', 'usd') == 'jpy'
        cur_sym = '¥' if is_jpy else '$'
        price_fmt = f'{cur_sym}{price:,.0f}' if is_jpy else f'{cur_sym}{price:,.2f}'
        portfolio_rows += (
            f'<tr>'
            f'<td style="font-weight:bold">{tk}</td>'
            f'<td>{pos.get("name", tk)}</td>'
            f'<td style="text-align:right">{price_fmt}</td>'
            f'<td style="text-align:right">{_fmt_pct(pct)}</td>'
            f'</tr>'
        )

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  body {{ margin:0; padding:20px; background:#EEF0F4;
         font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif; color:#333; }}
  .wrap {{ max-width:760px; margin:0 auto; background:#fff;
           border-radius:14px; overflow:hidden;
           box-shadow:0 6px 30px rgba(0,0,0,.12); }}
  .hdr  {{ background:linear-gradient(135deg,#0d1b2a 0%,#1b2a4a 60%,#1a3a5c 100%);
           color:#fff; padding:32px; text-align:center; }}
  .hdr h1 {{ margin:0; font-size:22px; font-weight:300; letter-spacing:3px; }}
  .hdr p  {{ margin:6px 0 0; font-size:14px; opacity:.75; }}
  .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:0; }}
  .cell {{ padding:20px 24px; border-bottom:1px solid #f0f0f0; }}
  .cell:nth-child(odd)  {{ border-right:1px solid #f0f0f0; }}
  .cell h3 {{ font-size:13px; color:#1a3a5c; text-transform:uppercase;
              letter-spacing:1px; margin:0 0 12px;
              border-bottom:2px solid #1a3a5c; padding-bottom:6px; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  td {{ padding:6px 8px; border-bottom:1px solid #f5f5f5; }}
  tr:last-child td {{ border-bottom:none; }}
  tr:hover {{ background:#fafbfc; }}
  .ptable {{ padding:20px 24px; border-top:1px solid #f0f0f0; }}
  .ptable h3 {{ font-size:13px; color:#1a3a5c; text-transform:uppercase;
                letter-spacing:1px; margin:0 0 12px;
                border-bottom:2px solid #1a3a5c; padding-bottom:6px; }}
  .ptable table thead td {{ background:#f0f4f8; font-weight:bold; color:#555; }}
  .chart {{ padding:20px 24px; border-top:1px solid #f0f0f0; }}
  .chart h3 {{ font-size:13px; color:#1a3a5c; text-transform:uppercase;
               letter-spacing:1px; margin:0 0 12px;
               border-bottom:2px solid #1a3a5c; padding-bottom:6px; }}
  .chart img {{ width:100%; border-radius:8px; display:block; }}
  .footer {{ background:#f8f9fa; text-align:center; padding:14px;
             font-size:11px; color:#aaa; }}
  .news {{ padding:20px 24px; border-bottom:2px solid #e8ecf0;
           background:linear-gradient(180deg,#f7f9fc 0%,#fff 100%); }}
  .news h3 {{ font-size:13px; color:#1a3a5c; text-transform:uppercase;
              letter-spacing:1px; margin:0 0 14px;
              border-bottom:2px solid #1a3a5c; padding-bottom:6px; }}
  .news ol  {{ margin:0; padding-left:20px; }}
  .news li  {{ margin-bottom:10px; line-height:1.5; font-size:13px; }}
  .news a   {{ color:#1a3a5c; text-decoration:none; font-weight:bold; }}
  .news a:hover {{ text-decoration:underline; }}
  .news .src {{ display:inline-block; font-size:10px; color:#fff;
                background:#1a3a5c; border-radius:3px;
                padding:1px 6px; margin-left:6px; vertical-align:middle; }}
  .news .sum {{ display:block; font-size:11px; color:#777;
                margin-top:2px; }}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>📊 MORNING MARKET REPORT</h1>
    <p>{date_str}</p>
  </div>

  {news_html}

  <div class="grid">
    <div class="cell">
      <h3>💱 為替</h3>
      <table>{forex_rows}</table>
    </div>
    <div class="cell">
      <h3>📈 米国金利</h3>
      <table>{rate_rows}</table>
    </div>
    <div class="cell">
      <h3>🏛 主要指数</h3>
      <table>{index_rows}</table>
    </div>
    <div class="cell">
      <h3>🛢 コモディティ</h3>
      <table>{commodity_rows}</table>
    </div>
  </div>

  <div class="ptable">
    <h3>💼 ポートフォリオ　前日比</h3>
    <table>
      <thead>
        <tr>
          <td>ティッカー</td>
          <td>銘柄名</td>
          <td style="text-align:right">現在値</td>
          <td style="text-align:right">前日比</td>
        </tr>
      </thead>
      <tbody>{portfolio_rows}</tbody>
    </table>
  </div>

  <div class="chart">
    <h3>📊 銘柄別　前日比（%）</h3>
    <img src="cid:chart_daily_change" alt="daily change chart">
  </div>

  <div class="chart">
    <h3>💰 含み損益率（取得価格比）</h3>
    <img src="cid:chart_pnl" alt="pnl chart">
  </div>

  <div class="chart">
    <h3>📉 USD/JPY・米10年金利・Gold　30日推移</h3>
    <img src="cid:chart_forex" alt="forex chart">
  </div>

  <div class="footer">
    自動生成レポート　|　データソース: Yahoo Finance　|　{now.strftime('%Y/%m/%d %H:%M')} JST
  </div>
</div>
</body>
</html>"""
    return html


# ============================================================
# Gmail 送信
# ============================================================

def send_email(subject: str, html_body: str, charts: dict, cfg: dict):
    sender    = cfg['sender_address']
    recipient = cfg['recipient_address']
    password  = cfg['app_password']

    msg = MIMEMultipart('related')
    msg['Subject'] = subject
    msg['From']    = f'市場レポート <{sender}>'
    msg['To']      = recipient

    alt = MIMEMultipart('alternative')
    msg.attach(alt)
    alt.attach(MIMEText(html_body, 'html', 'utf-8'))

    for cid, img_bytes in charts.items():
        if img_bytes:
            img = MIMEImage(img_bytes, 'png')
            img.add_header('Content-ID', f'<{cid}>')
            img.add_header('Content-Disposition', 'inline')
            msg.attach(img)

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
        server.login(sender, password)
        server.sendmail(sender, recipient, msg.as_string())
    print(f"✅ メール送信完了 → {recipient}")


# ============================================================
# Slack 通知
# ============================================================

def _slack_pct(pct: float) -> str:
    sign  = '+' if pct >= 0 else ''
    emoji = ':chart_with_upwards_trend:' if pct >= 0 else ':chart_with_downwards_trend:'
    return f"{emoji} {sign}{pct:.2f}%"


def build_slack_message(now: datetime, market_data: dict,
                        portfolio_data: dict, positions: list) -> dict:
    """Slack Block Kit メッセージを生成"""
    date_str = now.strftime('%Y/%m/%d (%a)')

    def md(ticker, label, fmt='{:.2f}', suffix=''):
        d = market_data.get(ticker, {})
        if 'price' not in d:
            return f"*{label}*: N/A"
        return f"*{label}*: {fmt.format(d['price'])}{suffix}  {_slack_pct(d['change_pct'])}"

    # 為替・金利
    forex_lines = "\n".join([
        md('JPY=X',    'USD/JPY', '{:.2f}', '円'),
        md('EURJPY=X', 'EUR/JPY', '{:.2f}', '円'),
        md('^TNX',     '米10年金利', '{:.3f}', '%'),
        md('^IRX',     '米2年金利',  '{:.3f}', '%'),
    ])

    # 主要指数
    index_lines = "\n".join([
        md('^GSPC', 'S&P 500',  '{:,.2f}'),
        md('^IXIC', 'NASDAQ',   '{:,.2f}'),
        md('^DJI',  'ダウ平均', '{:,.2f}'),
        md('^VIX',  'VIX',      '{:.2f}'),
        md('GC=F',  '金(Gold)', '${:,.2f}'),
        md('BTC-USD','BTC',     '${:,.0f}'),
    ])

    # ポートフォリオ上位騰落（前日比）
    rows = []
    seen = set()
    for pos in positions:
        tk = pos['ticker']
        if tk in seen:
            continue
        seen.add(tk)
        d = portfolio_data.get(tk, {})
        if 'change_pct' in d:
            rows.append((tk, d['change_pct']))

    rows.sort(key=lambda x: x[1], reverse=True)
    top3    = rows[:3]
    bottom3 = rows[-3:][::-1]

    def pf_line(tk, pct):
        sign = '+' if pct >= 0 else ''
        em   = '🟢' if pct >= 0 else '🔴'
        return f"{em} *{tk}* {sign}{pct:.2f}%"

    top_lines    = "\n".join(pf_line(tk, pct) for tk, pct in top3)
    bottom_lines = "\n".join(pf_line(tk, pct) for tk, pct in bottom3)

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text",
                     "text": f"📊 市場レポート {date_str}", "emoji": True}
        },
        {"type": "divider"},
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*💱 為替・金利*\n{forex_lines}"},
                {"type": "mrkdwn", "text": f"*🏛 主要指数*\n{index_lines}"},
            ]
        },
        {"type": "divider"},
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*📈 上昇 TOP3*\n{top_lines}"},
                {"type": "mrkdwn", "text": f"*📉 下落 TOP3*\n{bottom_lines}"},
            ]
        },
        {
            "type": "context",
            "elements": [
                {"type": "mrkdwn",
                 "text": f"データ: Yahoo Finance　|　{now.strftime('%H:%M')} JST"}
            ]
        }
    ]
    return {"blocks": blocks}


def send_slack(webhook_url: str, payload: dict):
    """Slack Incoming Webhook に送信"""
    data = json.dumps(payload).encode('utf-8')
    req  = urllib.request.Request(
        webhook_url,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        status = resp.status
    if status == 200:
        print("✅ Slack 送信完了")
    else:
        print(f"⚠️  Slack 送信ステータス: {status}")


# ============================================================
# メイン
# ============================================================

def log(msg: str):
    ts = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass


def main():
    now = datetime.now(JST)
    log(f"=== 市場レポート開始: {now.strftime('%Y-%m-%d %H:%M %Z')} ===")

    email_cfg = config['email']
    positions = config['portfolio']['positions']

    # --- ティッカーリスト ---
    market_tickers = [
        'JPY=X', 'EURJPY=X',
        '^TNX', '^IRX',
        '^GSPC', '^IXIC', '^DJI', '^VIX',
        'GC=F', 'CL=F', 'BTC-USD',
    ]
    stock_tickers = list({p['ticker'] for p in positions})

    # --- データ取得 ---
    log("市場データ取得中...")
    market_data = get_ticker_data(market_tickers)

    log("ポートフォリオデータ取得中...")
    portfolio_data = get_ticker_data(stock_tickers)

    log("履歴データ取得中（チャート用）...")
    historical_data = get_historical_data(['JPY=X', '^TNX', 'GC=F'], period='30d')

    # USD/JPY レート（P&L計算用）
    usdjpy = market_data.get('JPY=X', {}).get('price', 150.0)
    log(f"USD/JPY: {usdjpy:.2f}")

    # --- チャート生成 ---
    log("チャート生成中...")
    chart_daily  = make_daily_change_chart(portfolio_data, positions)
    chart_pnl    = make_pnl_chart(portfolio_data, positions, usdjpy)
    chart_forex  = make_forex_rate_chart(historical_data)

    charts = {
        'chart_daily_change': chart_daily,
        'chart_pnl':          chart_pnl,
        'chart_forex':        chart_forex,
    }

    # --- ニュース取得 ---
    log("ニュース取得中...")
    news_items = get_news(5)
    log(f"ニュース取得件数: {len(news_items)}")

    # --- HTML 生成 ---
    log("HTMLメール生成中...")
    date_str = now.strftime('%Y/%m/%d')
    subject  = f"📊 市場レポート {date_str}"
    html_body = build_html_email(now, market_data, portfolio_data, positions, news_items)

    # --- Gmail 送信 ---
    log("メール送信中...")
    send_email(subject, html_body, charts, email_cfg)

    # --- Slack 送信 ---
    slack_webhook = config.get('slack', {}).get('webhook_url', '')
    if slack_webhook and slack_webhook != 'YOUR_SLACK_WEBHOOK_URL':
        log("Slack 通知送信中...")
        slack_payload = build_slack_message(now, market_data, portfolio_data, positions)
        send_slack(slack_webhook, slack_payload)
    else:
        log("Slack webhook 未設定 → スキップ")

    log("=== 完了 ===\n")


if __name__ == '__main__':
    try:
        main()
    except Exception:
        log(f"[ERROR]\n{traceback.format_exc()}")
        raise
