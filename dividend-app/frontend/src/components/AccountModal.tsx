import { useState } from 'react'
import type { Account } from '../types'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#14b8a6',
]

interface Props {
  accounts: Account[]
  onClose: () => void
  onCreate: (data: Omit<Account, 'id'>) => Promise<void>
  onUpdate: (id: number, data: Omit<Account, 'id'>) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export default function AccountModal({ accounts, onClose, onCreate, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const startEdit = (acc: Account) => {
    setEditing(acc)
    setAdding(false)
    setName(acc.name)
    setColor(acc.color)
    setConfirmDelete(false)
  }

  const startAdd = () => {
    setEditing(null)
    setAdding(true)
    setName('')
    setColor(PRESET_COLORS[0])
  }

  const cancel = () => {
    setEditing(null)
    setAdding(false)
    setConfirmDelete(false)
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    if (adding) await onCreate({ name: name.trim(), color })
    else if (editing) await onUpdate(editing.id, { name: name.trim(), color })
    setSaving(false)
    cancel()
  }

  const del = async () => {
    if (!editing) return
    setSaving(true)
    await onDelete(editing.id)
    setSaving(false)
    cancel()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full bg-[#111] rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#111]">
          <button onClick={onClose} className="text-gray-400 text-sm">閉じる</button>
          <h2 className="font-bold">口座管理</h2>
          <button onClick={startAdd} className="text-blue-400 text-sm font-bold">＋ 追加</button>
        </div>

        {/* Account list */}
        {!adding && !editing && (
          <div className="px-5 py-4 space-y-3">
            {accounts.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">口座がありません。追加してください。</p>
            )}
            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => startEdit(acc)}
                className="w-full flex items-center gap-3 bg-[#1e1e1e] rounded-xl px-4 py-3"
              >
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: acc.color }} />
                <span className="flex-1 text-left text-sm">{acc.name}</span>
                <span className="text-gray-500 text-xs">編集 ›</span>
              </button>
            ))}
          </div>
        )}

        {/* Add / Edit form */}
        {(adding || editing) && (
          <div className="px-5 py-4 space-y-5">
            <div>
              <div className="text-xs text-gray-400 mb-1.5">口座名</div>
              <input
                className="w-full bg-[#1e1e1e] border border-[#333] rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例: 夫口座"
                autoFocus
              />
            </div>

            <div>
              <div className="text-xs text-gray-400 mb-2">カラー</div>
              <div className="flex flex-wrap gap-3">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/60' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div
              className="w-full rounded-xl p-4 text-white text-sm"
              style={{ background: `linear-gradient(135deg, ${color}cc 0%, ${color}66 100%)` }}
            >
              {name || '口座名'} のプレビュー
            </div>

            <div className="flex gap-3">
              <button onClick={cancel} className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm">
                キャンセル
              </button>
              <button onClick={save} disabled={saving || !name.trim()} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">
                {saving ? '保存中…' : '保存'}
              </button>
            </div>

            {editing && (
              <div className="pb-6">
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)} className="w-full py-3 rounded-xl border border-red-500/40 text-red-400 text-sm">
                    この口座を削除
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm">キャンセル</button>
                    <button onClick={del} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold">削除する</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
