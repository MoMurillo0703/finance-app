import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getUserCurrency } from '../../utils/currency'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

export default function AddPromoModal({ cardId, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const [description, setDescription] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
  const originalAmountInput = useCurrencyInput()
  const remainingBalanceInput = useCurrencyInput()
  const deferredInterestInput = useCurrencyInput()
  const [expirationDate, setExpirationDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!description.trim()) {
      setError(t('billNameRequired'))
      return
    }
    if (!originalAmountInput.raw || originalAmountInput.numericValue <= 0) {
      setError(t('invalidAmount'))
      return
    }
    if (!remainingBalanceInput.raw || remainingBalanceInput.numericValue < 0) {
      setError(t('invalidAmount'))
      return
    }
    if (!expirationDate) {
      setError(t('invalidDueDay'))
      return
    }

    setSaving(true)
    const { error: dbError } = await supabase.from('promotional_purchases').insert({
      user_id: user.id,
      credit_card_id: cardId,
      description: description.trim(),
      purchase_date: purchaseDate,
      original_amount: originalAmountInput.numericValue,
      remaining_balance: remainingBalanceInput.raw
        ? remainingBalanceInput.numericValue
        : originalAmountInput.numericValue,
      expiration_date: expirationDate,
      deferred_interest: deferredInterestInput.numericValue || 0,
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
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addPromo')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('description')}</label>
            <input
              className={inputClass}
              placeholder="Living room set"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('date')}</label>
            <input
              className={inputClass}
              type="date"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('originalPurchase')}</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={originalAmountInput.displayValue}
              onChange={originalAmountInput.handleChange}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('remainingBalance')}</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={remainingBalanceInput.displayValue}
              onChange={remainingBalanceInput.handleChange}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('payInFullBy')}</label>
            <input
              className={inputClass}
              type="date"
              value={expirationDate}
              onChange={e => setExpirationDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('deferredInterest')}</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={deferredInterestInput.displayValue}
              onChange={deferredInterestInput.handleChange}
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
