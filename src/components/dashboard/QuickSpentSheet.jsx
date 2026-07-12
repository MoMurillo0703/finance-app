import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustCardBalance, bankDelta } from '../../lib/payments'
import { fetchBanks } from '../../utils/bank'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import { BUDGET_CATEGORIES } from '../../utils/transactionCategories'
import { getBudgetCategoryLabel } from '../../utils/budgets'
import { formatMoney } from '../../utils/currency'

const todayISO = () => new Date().toISOString().split('T')[0]

export default function QuickSpentSheet({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const { displayValue, numericValue, handleChange, currency } = useCurrencyInput('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO)
  const [accountType, setAccountType] = useState('bank')
  const [accountId, setAccountId] = useState('')
  const [banks, setBanks] = useState([])
  const [cards, setCards] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchBanks(supabase, user.id, { orderByName: true }).then(({ data }) => {
      setBanks(data ?? [])
    })

    supabase
      .from('credit_cards')
      .select('id, name, current_balance')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setCards(data ?? [])
      })
  }, [user.id])

  const handleSave = async () => {
    if (!numericValue || numericValue <= 0 || !accountId) return

    setSaving(true)
    setError('')

    const row = {
      user_id: user.id,
      type: 'expense',
      amount: numericValue,
      description: note.trim() || getBudgetCategoryLabel(category, t),
      category,
      transaction_date: date || todayISO(),
    }

    if (accountType === 'card') {
      row.credit_card_id = accountId
    } else {
      row.bank_id = accountId
    }

    const { error: txError } = await supabase.from('transactions').insert(row)
    if (txError) {
      setError(txError.message)
      setSaving(false)
      return
    }

    const balanceError = accountType === 'card'
      ? await adjustCardBalance(accountId, numericValue)
      : await adjustBankBalance(accountId, bankDelta('expense', numericValue))

    if (balanceError) {
      setError(balanceError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved?.()
    onClose?.()
  }

  const stepHeader = (title, backStep) => (
    <div className="flex items-center gap-2 mb-4">
      {backStep && (
        <button
          type="button"
          onClick={() => setStep(backStep)}
          className="w-8 h-8 -ml-2 rounded-full flex items-center justify-center text-gray-400"
          aria-label={t('back')}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <p className="text-sm font-semibold text-gray-800">{title}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[140]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />

        {step === 1 && (
          <div className="px-6 pb-8">
            {stepHeader(t('howMuchSpent'))}
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={displayValue}
              onChange={handleChange}
              placeholder={currencyAmountPlaceholder(currency)}
              className="w-full text-5xl font-bold text-gray-900 border-0 outline-none text-center my-8 bg-transparent"
            />
            <button
              type="button"
              disabled={!numericValue || numericValue <= 0}
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-2xl bg-lala-600 text-white font-semibold disabled:opacity-30"
            >
              {t('next')} →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="px-6 pb-8">
            {stepHeader(t('whatWasItFor'), 1)}
            <div className="grid grid-cols-3 gap-2 mb-6">
              {BUDGET_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategory(cat.key)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-2xl border text-xs transition-all ${
                    category === cat.key
                      ? 'border-lala-600 ring-2 ring-purple-400 bg-lala-50 text-gray-800 font-semibold'
                      : 'border-gray-100 text-gray-600 bg-white'
                  }`}
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  <span className="leading-tight text-center">{getBudgetCategoryLabel(cat.key, t)}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!category}
              onClick={() => setStep(3)}
              className="w-full py-4 rounded-2xl bg-lala-600 text-white font-semibold disabled:opacity-30"
            >
              {t('next')} →
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="px-6 pb-8">
            {stepHeader(t('whichAccount'), 2)}
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => { setAccountType('bank'); setAccountId('') }}
                className={`py-2.5 rounded-xl text-sm font-medium border ${
                  accountType === 'bank' ? 'bg-lala-600 text-white border-lala-600' : 'border-gray-200 text-gray-500'
                }`}
              >
                🏦 {t('bank')}
              </button>
              <button
                type="button"
                onClick={() => { setAccountType('card'); setAccountId('') }}
                className={`py-2.5 rounded-xl text-sm font-medium border ${
                  accountType === 'card' ? 'bg-lala-600 text-white border-lala-600' : 'border-gray-200 text-gray-500'
                }`}
              >
                💳 {t('creditCard')}
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {(accountType === 'bank' ? banks : cards).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">{t('noAccounts')}</p>
              ) : (
                (accountType === 'bank' ? banks : cards).map(acct => (
                  <button
                    key={acct.id}
                    type="button"
                    onClick={() => setAccountId(acct.id)}
                    className={`w-full flex justify-between items-center p-4 rounded-2xl border text-left transition-all ${
                      accountId === acct.id
                        ? 'border-lala-600 ring-2 ring-purple-400 bg-lala-50'
                        : 'border-gray-100 bg-white'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-800">
                      {acct.nickname?.trim() || acct.name}
                    </p>
                    <p className={`text-sm font-bold ${accountType === 'card' ? 'text-red-500' : 'text-gray-700'}`}>
                      {formatMoney(accountType === 'card' ? (acct.current_balance || 0) : (acct.balance || 0))}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="space-y-3 mb-4">
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t('addNoteOptional')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-lala-400"
              />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-lala-400 bg-white"
              />
            </div>

            <div className="bg-lala-50 rounded-2xl p-4 mb-4 flex justify-between items-center">
              <p className="text-sm text-gray-500">
                {note.trim() || getBudgetCategoryLabel(category, t)}
              </p>
              <p className="font-bold text-gray-900">{displayValue}</p>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={!accountId || saving}
              className="w-full py-4 rounded-2xl bg-lala-600 text-white font-semibold disabled:opacity-30"
            >
              {saving ? t('loading') : t('saveExpense')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
