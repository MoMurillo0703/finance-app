import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getUserCurrency } from '../../utils/currency'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import BillPaymentMethodFields, {
  saveBillWithPaymentDefaults,
  buildPaymentDefaultPayload,
} from './BillPaymentMethodFields'

export default function AddBillModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const amountInput = useCurrencyInput()
  const currency = getUserCurrency()
  const [dueDay, setDueDay] = useState('')
  const [paymentSource, setPaymentSource] = useState('bank')
  const [defaultBankId, setDefaultBankId] = useState('')
  const [defaultCreditCardId, setDefaultCreditCardId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleBankId = useCallback(id => setDefaultBankId(id), [])
  const handleCardId = useCallback(id => setDefaultCreditCardId(id), [])

  const handleSave = async () => {
    if (!name.trim()) { setError(t('billNameRequired')); return }
    if (!amountInput.raw || amountInput.numericValue <= 0) { setError(t('invalidAmount')); return }
    if (!dueDay || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      setError(t('invalidDueDay'))
      return
    }
    if (paymentSource === 'bank' && !defaultBankId) {
      setError(t('selectBank'))
      return
    }
    if (paymentSource === 'credit_card' && !defaultCreditCardId) {
      setError(t('selectCard'))
      return
    }

    setSaving(true)
    const { error: dbError } = await saveBillWithPaymentDefaults(supabase, {
      mode: 'insert',
      row: {
        user_id: user.id,
        name: name.trim(),
        amount: amountInput.numericValue,
        due_day: parseInt(dueDay, 10),
        category: 'bills',
        is_active: true,
        ...buildPaymentDefaultPayload(paymentSource, defaultBankId, defaultCreditCardId),
      },
    })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addBill')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('billName')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder={t('billNamePlaceholder')}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('amount')} ({currency})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={amountInput.displayValue}
              onChange={amountInput.handleChange}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('dueDay')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="1-31"
              type="number"
              min="1"
              max="31"
              value={dueDay}
              onChange={e => setDueDay(e.target.value)}
            />
          </div>

          <BillPaymentMethodFields
            paymentSource={paymentSource}
            onPaymentSourceChange={setPaymentSource}
            defaultBankId={defaultBankId}
            onDefaultBankIdChange={handleBankId}
            defaultCreditCardId={defaultCreditCardId}
            onDefaultCreditCardIdChange={handleCardId}
          />
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
