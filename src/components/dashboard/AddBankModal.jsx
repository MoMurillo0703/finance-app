import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getUserCurrency } from '../../utils/currency'
import { insertBank, buildBankInsertRow, BANK_ACCOUNT_TYPES } from '../../utils/bank'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

export default function AddBankModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [lastFour, setLastFour] = useState('')
  const [accountType, setAccountType] = useState('checking')
  const balanceInput = useCurrencyInput()
  const currency = getUserCurrency()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError('Bank name is required'); return }
    if (balanceInput.raw === '' || balanceInput.numericValue < 0) {
      setError('Enter a valid balance')
      return
    }

    setSaving(true)
    setError('')
    const { data, error: dbError } = await insertBank(supabase, buildBankInsertRow({
      user_id: user.id,
      name: name.trim(),
      nickname: nickname.trim(),
      accountType: accountType || 'checking',
      balance: balanceInput.numericValue,
      is_active: true,
      last_four: lastFour || null,
    }))

    setSaving(false)

    if (dbError) {
      setError(dbError.message)
      return
    }

    onSaved?.(data)
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[92vh] overflow-y-auto" style={{ zIndex: 2 }}>
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('accountType')}
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {BANK_ACCOUNT_TYPES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccountType(opt.value)}
                  className="py-3 px-4 rounded-2xl text-sm font-medium border-2 transition-all"
                  style={{
                    borderColor: accountType === opt.value ? '#7C3AED' : '#E5E7EB',
                    backgroundColor: accountType === opt.value ? '#F5F3FF' : 'white',
                    color: accountType === opt.value ? '#7C3AED' : '#6B7280',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('accountLastFour')}
            </label>
            <input
              type="text"
              maxLength={4}
              inputMode="numeric"
              placeholder={t('accountLastFourPlaceholder')}
              value={lastFour}
              onChange={e => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full mt-2 px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-purple-300"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('accountLastFourHint')}
            </p>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('currentBalance')} ({currency})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={balanceInput.displayValue}
              onChange={balanceInput.handleChange}
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
