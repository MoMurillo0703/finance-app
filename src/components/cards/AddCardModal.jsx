import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney, getUserCurrency } from '../../utils/currency'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Discover']

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-5 mb-3">
      {children}
    </p>
  )
}

function FieldLabel({ children }) {
  return <label className="text-xs text-gray-400 mb-1 block">{children}</label>
}

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
  const [hasIntroRate, setHasIntroRate] = useState(false)
  const [introRate, setIntroRate] = useState('')
  const [introRateExpires, setIntroRateExpires] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const validateDay = (day) => day && !isNaN(day) && day >= 1 && day <= 31

  const handleAprChange = (setter) => (e) => {
    const val = e.target.value.replace(/[^\d.]/g, '')
    const parts = val.split('.')
    if (parts.length > 2) return
    if (parts[1]?.length > 2) return
    setter(val)
  }

  const handleDayChange = (setter) => (e) => {
    const val = e.target.value.replace(/\D/g, '')
    if (val === '' || (Number(val) >= 1 && Number(val) <= 31)) {
      setter(val)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) { setError(t('billNameRequired')); return }
    if (!creditLimitInput.raw || creditLimitInput.numericValue <= 0) { setError(t('invalidAmount')); return }
    if (!currentBalanceInput.raw || currentBalanceInput.numericValue < 0) { setError(t('invalidAmount')); return }
    if (!validateDay(statementDate)) { setError(t('invalidDueDay')); return }
    if (!validateDay(dueDate)) { setError(t('invalidDueDay')); return }
    if (hasIntroRate && introRate !== '' && isNaN(introRate)) {
      setError(t('invalidAmount'))
      return
    }

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
    if (hasIntroRate) {
      if (introRate !== '' && !isNaN(introRate)) {
        row.intro_rate = parseFloat(introRate)
      }
      if (introRateExpires) {
        row.intro_rate_expires = introRateExpires
      }
    }

    const { data: newCard, error: dbError } = await supabase
      .from('credit_cards')
      .insert(row)
      .select('id')
      .single()

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    const { error: billError } = await supabase.from('bills').insert({
      user_id: user.id,
      name: `${name.trim()} - Minimum Payment`,
      amount: 0,
      due_day: parseInt(dueDate, 10),
      credit_card_id: newCard.id,
      is_auto_card_bill: true,
      is_active: true,
    })

    if (billError) {
      setError(billError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto flex flex-col"
        style={{ zIndex: 2 }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-800 mb-4">{t('addCard')}</h2>

        <div className="w-full h-36 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-900 p-5 mb-6 shadow-lg shrink-0">
          <div className="flex justify-between items-start mb-6">
            <p className="text-white text-sm font-medium opacity-80">
              {name.trim() || t('cardName')}
            </p>
            <p className="text-white text-xs font-bold uppercase">{network}</p>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-white/60 text-xs">{t('balance')}</p>
              <p className="text-white font-bold">
                {formatMoney(currentBalanceInput.numericValue, currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-xs">{t('limit')}</p>
              <p className="text-white font-bold">
                {formatMoney(creditLimitInput.numericValue, currency)}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex-1">
          <div className="space-y-4">
            <div>
              <FieldLabel>{t('cardName')}</FieldLabel>
              <input
                className={inputClass}
                placeholder="e.g. Bancolombia Visa"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>{t('network')}</FieldLabel>
              <div className="grid grid-cols-4 gap-2">
                {NETWORKS.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNetwork(n)}
                    className={`py-2 rounded-xl text-xs font-medium border ${
                      network === n
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <SectionLabel>{t('balancesSection')}</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t('creditLimit')}</FieldLabel>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                placeholder={currencyAmountPlaceholder(currency)}
                value={creditLimitInput.displayValue}
                onChange={creditLimitInput.handleChange}
              />
            </div>
            <div>
              <FieldLabel>{t('balance')}</FieldLabel>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                placeholder={currencyAmountPlaceholder(currency)}
                value={currentBalanceInput.displayValue}
                onChange={currentBalanceInput.handleChange}
              />
            </div>
          </div>

          <SectionLabel>{t('interestRatesSection')}</SectionLabel>
          <div>
            <FieldLabel>{t('interestRate')}</FieldLabel>
            <input
              className={inputClass}
              placeholder="e.g. 24.99"
              inputMode="decimal"
              value={interestRate}
              onChange={handleAprChange(setInterestRate)}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={hasIntroRate}
              onChange={e => setHasIntroRate(e.target.checked)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-400"
            />
            <span className="text-sm text-gray-600">{t('hasIntroRate')}</span>
          </label>

          {hasIntroRate && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <FieldLabel>{t('introRate')}</FieldLabel>
                <input
                  className={inputClass}
                  placeholder="e.g. 0.00"
                  inputMode="decimal"
                  value={introRate}
                  onChange={handleAprChange(setIntroRate)}
                />
              </div>
              <div>
                <FieldLabel>{t('introRateExpires')}</FieldLabel>
                <input
                  className={inputClass}
                  type="date"
                  value={introRateExpires}
                  onChange={e => setIntroRateExpires(e.target.value)}
                />
              </div>
            </div>
          )}

          <SectionLabel>{t('billingDatesSection')}</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t('statementCloses')}</FieldLabel>
              <input
                className={inputClass}
                placeholder={t('dayPlaceholder')}
                inputMode="numeric"
                value={statementDate}
                onChange={handleDayChange(setStatementDate)}
              />
            </div>
            <div>
              <FieldLabel>{t('paymentDue')}</FieldLabel>
              <input
                className={inputClass}
                placeholder={t('dayPlaceholder')}
                inputMode="numeric"
                value={dueDate}
                onChange={handleDayChange(setDueDate)}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-2xl bg-purple-600 text-white font-semibold mt-6 disabled:opacity-50 shrink-0"
        >
          {saving ? '...' : t('addCard')}
        </button>
      </div>
    </div>
  )
}
