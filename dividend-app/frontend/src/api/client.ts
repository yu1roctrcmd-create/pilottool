import type { Account, Stock } from '../types'

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  accounts: {
    list: () => req<Account[]>('/accounts'),
    create: (data: Omit<Account, 'id'>) =>
      req<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Omit<Account, 'id'>) =>
      req<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      req<{ success: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
  },
  stocks: {
    list: () => req<Stock[]>('/stocks'),
    create: (data: Omit<Stock, 'id'>) =>
      req<Stock>('/stocks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Omit<Stock, 'id'>) =>
      req<Stock>(`/stocks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      req<{ success: boolean }>(`/stocks/${id}`, { method: 'DELETE' }),
  },
  exchangeRates: {
    get: () => req<{ rates: { currency: string; rate: number; updated_at: string }[]; map: Record<string, number> }>('/exchange-rates'),
    refresh: () => req<{ rates: { currency: string; rate: number; updated_at: string }[]; map: Record<string, number> }>('/exchange-rates/refresh', { method: 'POST' }),
  },
  prices: {
    status: () => req<{ last_update: string | null; stock_count: number }>('/prices/status'),
    update: () => req<{ updated: number; total: number; timestamp: string }>('/prices/update', { method: 'POST' }),
  },
  financials: {
    get: (ticker: string) => req<FinancialsData>(`/financials/${ticker}`),
  },
  news: {
    get: (ticker: string, name: string) =>
      req<NewsItem[]>(`/news/${ticker}?name=${encodeURIComponent(name)}`),
  },
  history: {
    list: () => req<HistoryEntry[]>('/history'),
    snapshot: () => req<{ success: boolean }>('/history/snapshot', { method: 'POST' }),
    getGoals: () => req<Goals>('/history/goals'),
    setGoals: (data: Partial<Goals>) => req<Goals>('/history/goals', { method: 'PUT', body: JSON.stringify(data) }),
  },
}

export interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

export interface HistoryEntry {
  date: string
  dividend_total: number
  asset_total: number
  by_account: Record<string, { dividend: number; asset: number }>
}

export interface Goals {
  dividend: number | null
  asset: number | null
}

export interface FinancialYear {
  year: string
  forecast?: boolean
  revenue: number | null
  operatingIncome: number | null
  netIncome: number | null
  eps: number | null
  roe: number | null
  roa: number | null
  dps: number | null
  payoutRatio: number | null
  bps: number | null
}

export interface FinancialsData {
  source: string
  years: FinancialYear[]
  current: {
    price: number | null
    per: number | null
    pbr: number | null
    eps: number | null
    dividendYield: number | null  // % 単位
    payoutRatio: number | null
    dividendRate: number | null
  }
}
