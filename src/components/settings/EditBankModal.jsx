import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { getUserCurrency } from '../../utils/currency'
import { updateBank } from '../../utils/bank'

export default function EditBankModal({ bank, onClose, onSaved }) {
  const { t } = useTranslation()
  const [name, setName] = useState(bank.name ?? '')
  const [nickname, setNickname] = useState(bank.nickname ?? '')
  const [balance, setBalance] = useState(String(bank.balance ?? ''))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('billNameRequired'))
      return
    }
    if (balance === '' || isNaN(balance)) {
      setError(t('invalidAmount'))
      return
    }

    setSaving(true)
    const { error: dbError } = await updateBank(supabase, bank.id, {
      name: name.trim(),
      nickname: nickname.trim() || null,
      balance: parseFloat(balance),
    })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error: dbError } = await supabase
      .from('banks')
      .update({ is_active: false })
      .eq('id', bank.id)

    if (dbError) {
      setError(dbError.message)
      setDeleting(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('editBank')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('bankName')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder={t('bankNamePlaceholder')}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('accountNickname')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder={t('accountNicknamePlaceholder')}
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('currentBalance')} ({getUserCurrency()})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0"
              type="number"
              value={balance}
              onChange={e => setBalance(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>

        <button
          onClick={handleDelete}
          disabled={saving || deleting}
          className="w-full mt-3 py-3 rounded-xl border border-red-200 text-sm text-red-500 font-medium disabled:opacity-50"
        >
          {deleting ? '...' : t('deleteAccount')}
        </button>
      </div>
    </div>
  )
}
