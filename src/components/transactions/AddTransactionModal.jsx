import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustCardBalance, adjustVaultBalance, bankDelta } from '../../lib/payments'
import { formatMoney, getUserCurrency, isCOPUser } from '../../utils/currency'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'

const EXPENSE_CATEGORIES = ['essential', 'food', 'travel', 'fun', 'bills', 'debt', 'weeklyLiving', 'emergency']
const INCOME_CATEGORIES = ['salary', 'commission', 'reimbursement']

export default function AddTransactionModal({
  onClose,
  onSaved,
  onOpenWizard,
  prefillCardId,
  lockToCardExpense = false,
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [type, setType] = useState('expense')
  const [category, setCategory] = useState('essential')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState(lockToCardExpense ? 'card' : 'bank')
  const [bankId, setBankId] = useState('')
  const [creditCardId, setCreditCardId] = useState(prefillCardId || '')
  const [vaultId, setVaultId] = useState('')
  const [useInstallments, setUseInstallments] = useState(false)
  const [numCuotas, setNumCuotas] = useState('12')
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [vaults, setVaults] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDistributePrompt, setShowDistributePrompt] = useState(false)
  const [savedIncome, setSavedIncome] = useState(null)

  useEffect(() => {
    if (prefillCardId) setCreditCardId(prefillCardId)
  }, [prefillCardId])

  useEffect(() => {
    fetchBanks(supabase, user.id).then(({ data }) => {
      if (data) {
        setBanks(data)
        if (data.length > 0) setBankId(data[0].id)
      }
    })

    supabase
      .from('credit_cards')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) {
          setCreditCards(data)
          if (data.length > 0) setCreditCardId(data[0].id)
        }
      })

    supabase
      .from('vaults')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setVaults(data)
      })
  }, [user.id])

  const parsedAmount = parseFloat(amount)
  const installmentCount = parseInt(numCuotas, 10)
  const monthlyCuota = parsedAmount > 0 && installmentCount > 0
    ? parsedAmount / installmentCount
    : 0

  const handleSave = async () => {
    if (!amount || isNaN(amount)) { setError(t('invalidAmount')); return }
    if (!category) { setError(t('selectCategory')); return }

    const isCardExpense = type === 'expense' && paymentMethod === 'card'

    if (isCardExpense) {
      if (!creditCardId) { setError(t('selectCard')); return }
      if (useInstallments && (!numCuotas || isNaN(numCuotas) || installmentCount < 2 || installmentCount > 48)) {
        setError(t('invalidNumCuotas'))
        return
      }
    } else if (!bankId) {
      setError(t('selectBank'))
      return
    }

    setSaving(true)

    const txPayload = {
      user_id: user.id,
      type,
      category,
      amount: parsedAmount,
      description: description.trim(),
      transaction_date: date,
      bank_id: isCardExpense ? null : bankId,
      credit_card_id: isCardExpense ? creditCardId : null,
    }

    if (type === 'expense' && vaultId) {
      txPayload.vault_id = vaultId
    }

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert(txPayload)
      .select('id')
      .single()

    if (txError) { setError(txError.message); setSaving(false); return }

    if (isCardExpense) {
      const cardError = await adjustCardBalance(creditCardId, parsedAmount)
      if (cardError) { setError(cardError.message); setSaving(false); return }

      if (useInstallments) {
        const cuotaPayload = {
          user_id: user.id,
          credit_card_id: creditCardId,
          description: description.trim() || t('expense'),
          total_amount: parsedAmount,
          cuota_amount: monthlyCuota,
          total_cuotas: installmentCount,
          paid_cuotas: 1,
          start_date: date,
          is_active: true,
        }

        let { error: cuotaError } = await supabase
          .from('cuotas')
          .insert({ ...cuotaPayload, transaction_id: txData.id })

        if (cuotaError) {
          const fallback = await supabase.from('cuotas').insert(cuotaPayload)
          cuotaError = fallback.error
        }

        if (cuotaError) { setError(cuotaError.message); setSaving(false); return }
      }
    } else {
      const bankError = await adjustBankBalance(bankId, bankDelta(type, parsedAmount))
      if (bankError) { setError(bankError.message); setSaving(false); return }
    }

    if (type === 'expense' && vaultId) {
      const vaultError = await adjustVaultBalance(vaultId, parsedAmount)
      if (vaultError) { setError(vaultError.message); setSaving(false); return }
    }

    setSaving(false)

    if (type === 'income' && onOpenWizard) {
      setSavedIncome({ amount: parsedAmount, bankId })
      setShowDistributePrompt(true)
      return
    }

    onSaved()
  }

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const handleTypeChange = (nextType) => {
    setType(nextType)
    setCategory(nextType === 'income' ? 'salary' : 'essential')
    if (nextType === 'income') {
      setVaultId('')
      setPaymentMethod('bank')
      setUseInstallments(false)
    }
  }

  return (
    <div className={`fixed inset-0 ${lockToCardExpense ? 'z-[120]' : 'z-[110]'} flex items-end justify-center`}>
      <div
        className="absolute inset-0 bg-black opacity-40"
        onClick={onClose}
        style={{ zIndex: 1 }}
      />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto"
        style={{ zIndex: 2 }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addTransaction')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          {!lockToCardExpense && (
          <div className="flex gap-3">
            <button
              onClick={() => handleTypeChange('expense')}
              className={`flex-1 py-3 rounded-xl text-sm border ${type === 'expense' ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-500'}`}
            >
              {t('expense')}
            </button>
            <button
              onClick={() => handleTypeChange('income')}
              className={`flex-1 py-3 rounded-xl text-sm border ${type === 'income' ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-500'}`}
            >
              {t('income')}
            </button>
          </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('category')}</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {categories.map(value => (
                <option key={value} value={value}>{t(value)}</option>
              ))}
            </select>
          </div>

          {type === 'expense' && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('assignVault')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={vaultId}
                onChange={e => setVaultId(e.target.value)}
              >
                <option value="">{t('noVault')}</option>
                {vaults.length === 0 && (
                  <option value="" disabled>{t('noVaultsHint')}</option>
                )}
                {vaults.map(vault => (
                  <option key={vault.id} value={vault.id}>{vault.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('amount')} ({getUserCurrency()})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0"
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('description')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder={t('descriptionPlaceholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {type === 'expense' && !lockToCardExpense && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('paymentMethod')}</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`flex-1 py-2.5 rounded-xl text-xs border ${
                    paymentMethod === 'bank'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {t('bank')}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`flex-1 py-2.5 rounded-xl text-xs border ${
                    paymentMethod === 'card'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {t('creditCard')}
                </button>
              </div>
            </div>
          )}

          {type === 'expense' && (lockToCardExpense || paymentMethod === 'card') ? (
            <div>
              {!lockToCardExpense && (
              <>
              <label className="text-xs text-gray-400 mb-1 block">{t('creditCard')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={creditCardId}
                onChange={e => setCreditCardId(e.target.value)}
              >
                {creditCards.length === 0 && (
                  <option value="">{t('noCardsHint')}</option>
                )}
                {creditCards.map(card => (
                  <option key={card.id} value={card.id}>{card.name}</option>
                ))}
              </select>
              </>
              )}

              {isCOPUser() && (
                <div className={lockToCardExpense ? 'mt-3' : ''}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useInstallments}
                      onChange={e => setUseInstallments(e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-400"
                    />
                    <span className="text-xs text-gray-600">{t('splitIntoCuotas')}</span>
                  </label>

                  {useInstallments && (
                    <div className="mt-3">
                      <label className="text-xs text-gray-400 mb-1 block">{t('numCuotas')}</label>
                      <input
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                        placeholder="12"
                        type="number"
                        min="2"
                        max="48"
                        value={numCuotas}
                        onChange={e => setNumCuotas(e.target.value)}
                      />
                      {monthlyCuota > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          {t('cuotaAmount')}: {formatMoney(monthlyCuota)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('bank')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={bankId}
                onChange={e => setBankId(e.target.value)}
              >
                {banks.length === 0 && (
                  <option value="">{t('noBanksHint')}</option>
                )}
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{getBankDropdownLabel(b)}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('date')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6">
          {showDistributePrompt ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">{t('distributeVaults')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDistributePrompt(false)
                    onSaved()
                  }}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
                >
                  {t('skipDistribute')}
                </button>
                <button
                  onClick={() => {
                    const income = savedIncome
                    setShowDistributePrompt(false)
                    onOpenWizard?.(income.amount, income.bankId)
                    onSaved()
                  }}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
                >
                  {t('distributeNow')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
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
          )}
        </div>
      </div>
    </div>
  )
}
