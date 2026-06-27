import { useState } from 'react'
import type { Stock, Account, ExchangeRateMap } from '../types'

const SECTORS = ['情報・通信業', '卸売業', '石油・石炭製品', '金融業', '小売業', '製造業', '不動産業', '医薬品', '食料品', '電気機器', 'サービス業', 'その他']
const ACCOUNT_TYPES = ['旧NISA', '新NISA（成長投資枠）', '新NISA（つみたて枠）', '特定口座', '一般口座']
const CURRENCIES = ['JPY', 'USD', 'EUR', 'GBP']
const CATEGORIES = ['ディフェンシブ', '景気敏感', 'Tech', 'その他'] as const

const MONTH_TOGGLE = (months: number[], m: number) =>
  months.includes(m) ? months.filter(x => x !== m) : [...months, m].sort((a, b) => a - b)

interface Props {
  stock: Stock | null
  accounts: Account[]
  rates: ExchangeRateMap
  onClose: () => void
  onSave: (data: Omit<Stock, 'id'>) => Promise<void>
  onDelete?: () => Promise<void>
}

export default function StockModal({ stock, accounts, rates, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState<Omit<Stock, 'id'>>({
    account_id: stock?.account_id ?? accounts[0]?.id ?? 0,
    ticker: stock?.ticker ?? '',
    name: stock?.name ?? '',
    sector: stock?.sector ?? '',
    category: stock?.category ?? 'その他',
    account_type: stock?.account_type ?? '特定口座',
    currency: stock?.currency ?? 'JPY',
    current_price: stock?.current_price ?? 0,
    purchase_price: stock?.purchase_price ?? 0,
    purchase_rate: stock?.purchase_rate ?? (rates.USD ?? 150),
    dividend_per_share: stock?.dividend_per_share ?? 0,
    shares: stock?.shares ?? 0,
    ex_dividend_months: stock?.ex_dividend_months ?? [],
    payment_months: stock?.payment_months ?? [],
    exclude_from_yield: stock?.exclude_from_yield ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (key: keyof typeof form, value: any) => setForm(f => ({ ...f, [key]: value }))

  const handleSave = async () => {
    if (!form.ticker || !form.name || !form.account_id) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full bg-[#111] rounded-t-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#111] z-10">
          <button onClick={onClose} className="text-gray-400 text-sm">キャンセル</button>
          <h2 className="font-bold">{stock ? '銘柄を編集' : '銘柄を追加'}</h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-blue-400 font-bold text-sm disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 口座 */}
          <Field label="口座">
            <select
              className="input"
              value={form.account_id}
              onChange={e => set('account_id', Number(e.target.value))}
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          {/* 通貨 */}
          <Field label="通貨">
            <div className="flex gap-2">
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => set('currency', c)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    form.currency === c ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'
                  }`}
                >{c}</button>
              ))}
            </div>
          </Field>

          {/* ティッカー・銘柄名 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="ティッカー / コード">
              <input className="input" value={form.ticker} onChange={e => set('ticker', e.target.value)} placeholder="例: BTI, 9434" />
            </Field>
            <Field label="銘柄名">
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="例: ソフトバンク" />
            </Field>
          </div>

          {/* セクター */}
          <Field label="セクター">
            <select className="input" value={form.sector} onChange={e => set('sector', e.target.value)}>
              <option value="">未選択</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          {/* カテゴリー */}
          <Field label="カテゴリー">
            <div className="flex gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => set('category', c)}
                  className={`flex-1 py-2 rounded-xl text-sm border transition-colors ${
                    form.category === c ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'
                  }`}
                >{c}</button>
              ))}
            </div>
          </Field>

          {/* 口座種別 */}
          <Field label="口座種別">
            <select className="input" value={form.account_type} onChange={e => set('account_type', e.target.value)}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          {/* 数値入力 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="保有数（株）">
              <input type="number" className="input" value={form.shares || ''} onChange={e => set('shares', Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label={`取得単価（円）`}>
              <input type="number" className="input" value={form.purchase_price || ''} onChange={e => set('purchase_price', Number(e.target.value))} placeholder="0" />
            </Field>
            {form.currency !== 'JPY' && (
              <Field label={`取得時レート（${form.currency}/JPY）`}>
                <input type="number" className="input" value={form.purchase_rate || ''} onChange={e => set('purchase_rate', Number(e.target.value))} placeholder="150" />
              </Field>
            )}
            <Field label={`現在値（${form.currency}）`}>
              <input type="number" className="input" value={form.current_price || ''} onChange={e => set('current_price', Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label={`1株配当額（${form.currency}）`}>
              <input type="number" className="input" value={form.dividend_per_share || ''} onChange={e => set('dividend_per_share', Number(e.target.value))} placeholder="0" />
            </Field>
          </div>

          {/* インカム / キャピタル 区分 */}
          <Field label="投資スタイル">
            <div className="flex gap-2">
              {([
                { label: '📈 インカムゲイン', value: false, active: 'border-green-500/60 bg-green-500/10 text-green-400' },
                { label: '🚀 キャピタルゲイン', value: true, active: 'border-orange-500/60 bg-orange-500/10 text-orange-400' },
              ] as const).map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => set('exclude_from_yield', opt.value)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    form.exclude_from_yield === opt.value
                      ? opt.active
                      : 'border-gray-700 text-gray-500'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
            <div className="text-xs text-gray-600 mt-1.5 px-1">
              {form.exclude_from_yield
                ? '値上がり益狙い。取得利回りの計算から除外されます'
                : '配当収入狙い。取得利回りの計算に含まれます'}
            </div>
          </Field>

          {/* 権利確定月 */}
          <Field label="権利確定月">
            <MonthPicker selected={form.ex_dividend_months} onChange={m => set('ex_dividend_months', MONTH_TOGGLE(form.ex_dividend_months, m))} />
          </Field>

          {/* 支払い月 */}
          <Field label="支払い月">
            <MonthPicker selected={form.payment_months} onChange={m => set('payment_months', MONTH_TOGGLE(form.payment_months, m))} />
          </Field>

          {/* Delete */}
          {onDelete && (
            <div className="pt-2 pb-6">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-3 rounded-xl border border-red-500/40 text-red-400 text-sm"
                >銘柄を削除</button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm">キャンセル</button>
                  <button onClick={onDelete} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold">削除する</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 10px;
          padding: 10px 12px;
          color: white;
          font-size: 14px;
          outline: none;
        }
        .input:focus { border-color: #555; }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function MonthPicker({ selected, onChange }: { selected: number[]; onChange: (m: number) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`py-2 rounded-lg text-sm border transition-colors ${
            selected.includes(m) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-700 text-gray-400'
          }`}
        >{m}</button>
      ))}
    </div>
  )
}
