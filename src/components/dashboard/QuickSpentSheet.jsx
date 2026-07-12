import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustCardBalance, bankDelta } from '../../lib/payments'
import { fetchBanks } from '../../utils/bank'
import { useCurrencyInput } from '../../hooks/useCurrencyInput'
import { BUDGET_CATEGORIES, CATEGORY_EMOJIS } from '../../utils/transactionCategories'
import { getBudgetCategoryLabel } from '../../utils/budgets'

export default function QuickSpentSheet({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const { displayValue, numericValue, handleChange } = useCurrencyInput('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [accountType, setAccountType] = useState('bank')
  const [accountId, setAccountId] = useState('')
  const [banks, setBanks] = useState([])
  const [cards, setCards] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchBanks(supabase, user.id).then(({ data }) => {
      const list = data ?? []
      setBanks(list)
      if (list.length > 0) setAccountId(list[0].id)
    })

    supabase
      .from('credit_cards')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setCards(data ?? [])
      })
  }, [user.id])

  useEffect(() => {
    if (accountType === 'bank' && banks.length > 0 && !banks.find(b => b.id === accountId)) {
      setAccountId(banks[0].id)
    }
    if (accountType === 'card' && cards.length > 0 && !cards.find(c => c.id === accountId)) {
      setAccountId(cards[0].id)
    }
  }, [accountType, banks, cards, accountId])

  const handleSave = async () => {
    if (!numericValue || numericValue <= 0) return
    if (!accountId) {
      setError(t('selectBank'))
      return
    }

    setSaving(true)
    setError('')
    const today = new Date().toISOString().split('T')[0]

    const row = {
      user_id: user.id,
      type: 'expense',
      amount: numericValue,
      description: description.trim() || getBudgetCategoryLabel(category, t),
      category,
      transaction_date: today,
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

    if (accountType === 'card') {
      const cardError = await adjustCardBalance(accountId, numericValue)
      if (cardError) {
        setError(cardError.message)
        setSaving(false)
        return
      }
    } else {
      const bankError = await adjustBankBalance(accountId, bankDelta('expense', numericValue))
      if (bankError) {
        setError(bankError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onSaved?.()
    onClose?.()
  }

  if (step === 1) {
    return (
      <div className="p-6 pb-8">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">{t('howMuchSpent')}</p>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          placeholder="0.00"
          className="w-full text-5xl font-bold text-gray-900 border-0 outline-none text-center mb-8 bg-transparent"
        />
        <button
          type="button"
          disabled={!numericValue}
          onClick={() => setStep(2)}
          className="w-full py-4 rounded-2xl bg-lala-600 text-white font-semibold disabled:opacity-30"
        >
          {t('next')} →
        </button>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="p-6 pb-8">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">{t('whatWasItFor')}</p>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {BUDGET_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              type="button"
              onClick={() => {
                setCategory(cat.key)
                setDescription(getBudgetCategoryLabel(cat.key, t))
                setStep(3)
              }}
              className={`flex flex-col items-center gap-1 p-3 rounded-2xl border text-xs ${
                category === cat.key
                  ? 'bg-lala-600 text-white border-lala-600'
                  : 'border-gray-100 text-gray-600 bg-white'
              }`}
            >
              <span className="text-xl">{cat.emoji}</span>
              <span className="leading-tight text-center">{getBudgetCategoryLabel(cat.key, t)}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setStep(1)} className="w-full py-3 text-sm text-gray-400">
          ← {t('back')}
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 pb-8">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">{t('paidWith')}</p>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t('description')}</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-lala-400"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAccountType('bank')}
            className={`py-2.5 rounded-xl text-sm font-medium border ${
              accountType === 'bank' ? 'bg-lala-600 text-white border-lala-600' : 'border-gray-200 text-gray-500'
            }`}
          >
            🏦 {t('bank')}
          </button>
          <button
            type="button"
            onClick={() => setAccountType('card')}
            className={`py-2.5 rounded-xl text-sm font-medium border ${
              accountType === 'card' ? 'bg-lala-600 text-white border-lala-600' : 'border-gray-200 text-gray-500'
            }`}
          >
            💳 {t('creditCard')}
          </button>
        </div>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-lala-400"
        >
          <option value="">{t('selectAccount')}</option>
          {accountType === 'bank'
            ? banks.map(b => <option key={b.id} value={b.id}>{b.nickname || b.name}</option>)
            : cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="bg-lala-50 rounded-2xl p-4 mb-4">
        <div className="flex justify-between">
          <p className="text-sm text-gray-500">{description}</p>
          <p className="font-bold text-gray-900">{displayValue}</p>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {CATEGORY_EMOJIS[category]} {getBudgetCategoryLabel(category, t)}
        </p>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={!accountId || saving}
        className="w-full py-4 rounded-2xl bg-lala-600 text-white font-semibold disabled:opacity-30"
      >
        {saving ? t('loading') : t('saveExpense')}
      </button>
      <button type="button" onClick={() => setStep(2)} className="w-full py-3 text-sm text-gray-400 mt-2">
        ← {t('back')}
      </button>
    </div>
  )
}
