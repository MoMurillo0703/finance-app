import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function AddBankModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('savings')
  const [balance, setBalance] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError('Bank name is required'); return }
    if (!balance || isNaN(balance)) { setError('Enter a valid balance'); return }

    setSaving(true)
    const { error: dbError } = await supabase.from('banks').insert({
      user_id: user.id,
      name: name.trim(),
      account_type: accountType,
      balance: parseFloat(balance),
      is_active: true,
    })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addBank')}</h2>

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
            <label className="text-xs text-gray-400 mb-1 block">{t('accountType')}</label>
            <div className="flex gap-3">
              <button
                onClick={() => setAccountType('savings')}
                className={`flex-1 py-3 rounded-xl text-sm border ${accountType === 'savings' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500'}`}
              >
                {t('savings')}
              </button>
              <button
                onClick={() => setAccountType('checking')}
                className={`flex-1 py-3 rounded-xl text-sm border ${accountType === 'checking' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500'}`}
              >
                {t('checking')}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('currentBalance')} (COP)</label>
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
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}