export interface Account {
  id: number;
  name: string;
  color: string;
}

export interface Stock {
  id: number;
  account_id: number;
  ticker: string;
  name: string;
  sector: string;
  category: 'ディフェンシブ' | '景気敏感' | 'Tech' | 'その他';
  account_type: string;
  currency: 'JPY' | 'USD' | 'EUR' | 'GBP';
  current_price: number;
  previous_close?: number | null;
  purchase_price: number;
  purchase_rate: number;
  dividend_per_share: number;
  shares: number;
  ex_dividend_months: number[];
  payment_months: number[];
  exclude_from_yield?: boolean;
}

export interface ExchangeRateMap {
  JPY: number;
  [key: string]: number | undefined;
}

export interface StockCalc {
  current_price_jpy: number;
  acquisition_value: number;
  current_value: number;
  gain_loss_pct: number;
  annual_dividend_jpy: number;
  current_yield_pct: number;
  acquisition_yield_pct: number;
}
