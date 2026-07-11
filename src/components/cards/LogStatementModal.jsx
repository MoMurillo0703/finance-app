import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getEffectiveRate, getLastStatementDate } from '../../utils/creditCard'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import { getUserCurrency } from '../../utils/currency'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

export default function LogStatementModal({ card, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const balanceInput = useCurrencyInput(card.current_balance || '')
  const minimumInput = useCurrencyInput('')
  const [statementDate, setStatementDate] = useState(getLastStatementDate(card.statement_date))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!statementDate) {
      setError(t('invalidDueDay'))
      return
    }
    if (!balanceInput.raw || balanceInput.numericValue < 0) {
      setError(t('invalidAmount'))
      return
    }
    if (!minimumInput.raw || minimumInput.numericValue <= 0) {
      setError(t('invalidAmount'))
      return
    }

    setSaving(true)
    setError('')

    const rate = getEffectiveRate(card)
    const interestCharged = balanceInput.numericValue * (rate / 100 / 12)

    const { error: insertError } = await supabase.from('card_statements').upsert({
      user_id: user.id,
      credit_card_id: card.id,
      statement_date: statementDate,
      balance: balanceInput.numericValue,
      interest_charged: interestCharged,
      actual_minimum: minimumInput.numericValue,
    }, { onConflict: 'credit_card_id,statement_date' })

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-1">{t('logStatement')}</h2>
        <p className="text-sm text-gray-500 mb-4">{card.name}</p>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('statementDate')}</label>
            <input
              className={inputClass}
              type="date"
              value={statementDate}
              onChange={e => setStatementDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('balanceOnStatement')} ({currency})</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={balanceInput.displayValue}
              onChange={balanceInput.handleChange}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('actualMinimum')} ({currency})</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={minimumInput.displayValue}
              onChange={minimumInput.handleChange}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
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
