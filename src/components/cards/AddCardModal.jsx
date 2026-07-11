import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getUserCurrency } from '../../utils/currency'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Other']

export default function AddCardModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [network, setNetwork] = useState('Visa')
  const creditLimitInput = useCurrencyInput()
  const currentBalanceInput = useCurrencyInput()
  const currency = getUserCurrency()
  const [statementDate, setStatementDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const validateDay = (day) => day && !isNaN(day) && day >= 1 && day <= 31

  const handleSave = async () => {
    if (!name.trim()) { setError(t('billNameRequired')); return }
    if (!creditLimitInput.raw || creditLimitInput.numericValue <= 0) { setError(t('invalidAmount')); return }
    if (!currentBalanceInput.raw || currentBalanceInput.numericValue < 0) { setError(t('invalidAmount')); return }
    if (!validateDay(statementDate)) { setError(t('invalidDueDay')); return }
    if (!validateDay(dueDate)) { setError(t('invalidDueDay')); return }

    setSaving(true)
    const row = {
      user_id: user.id,
      name: name.trim(),
      network,
      credit_limit: creditLimitInput.numericValue,
      current_balance: currentBalanceInput.numericValue,
      statement_date: parseInt(statementDate, 10),
      due_date: parseInt(dueDate, 10),
      currency: getUserCurrency(),
      is_active: true,
    }
    if (interestRate !== '' && !isNaN(interestRate)) {
      row.interest_rate = parseFloat(interestRate)
    }

    const { error: dbError } = await supabase.from('credit_cards').insert(row)

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
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addCard')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('cardName')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="e.g. Bancolombia Visa"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('network')}</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={network}
              onChange={e => setNetwork(e.target.value)}
            >
              {NETWORKS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('creditLimit')} ({currency})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={creditLimitInput.displayValue}
              onChange={creditLimitInput.handleChange}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('balance')} ({currency})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={currentBalanceInput.displayValue}
              onChange={currentBalanceInput.handleChange}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('interestRate')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="e.g. 24.99"
              type="number"
              step="0.01"
              value={interestRate}
              onChange={e => setInterestRate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('statementDate')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="1-31"
              type="number"
              min="1"
              max="31"
              value={statementDate}
              onChange={e => setStatementDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('dueDate')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="1-31"
              type="number"
              min="1"
              max="31"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
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
