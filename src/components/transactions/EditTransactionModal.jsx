import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  adjustBankBalance,
  adjustCardBalance,
  adjustVaultBalance,
  bankDelta,
  cardDelta,
} from '../../lib/payments'
import { getUserCurrency } from '../../utils/currency'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'

const EXPENSE_CATEGORIES = ['essential', 'food', 'travel', 'fun', 'bills', 'debt', 'weeklyLiving', 'emergency']
const INCOME_CATEGORIES = ['salary', 'commission', 'reimbursement']

export default function EditTransactionModal({ transaction, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [type, setType] = useState(transaction.type)
  const [category, setCategory] = useState(transaction.category)
  const [amount, setAmount] = useState(String(transaction.amount))
  const [description, setDescription] = useState(transaction.description ?? '')
  const [date, setDate] = useState(transaction.transaction_date)
  const [paymentMethod, setPaymentMethod] = useState(transaction.credit_card_id ? 'card' : 'bank')
  const [bankId, setBankId] = useState(transaction.bank_id ?? '')
  const [creditCardId, setCreditCardId] = useState(transaction.credit_card_id ?? '')
  const [vaultId, setVaultId] = useState(transaction.vault_id ?? '')
  const [linkedCuota, setLinkedCuota] = useState(null)
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [vaults, setVaults] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchBanks(supabase, user.id, { orderByName: true }).then(({ data }) => {
      if (data) setBanks(data)
    })

    supabase
      .from('credit_cards')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setCreditCards(data)
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

    if (transaction.credit_card_id) {
      supabase
        .from('cuotas')
        .select('id, total_cuotas, paid_cuotas, cuota_amount')
        .eq('transaction_id', transaction.id)
        .eq('is_active', true)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setLinkedCuota(data)
        })
    }
  }, [user.id, transaction.id, transaction.credit_card_id])

  const handleSave = async () => {
    if (!amount || isNaN(amount)) { setError(t('invalidAmount')); return }
    if (!category) { setError(t('selectCategory')); return }

    const isCardExpense = type === 'expense' && paymentMethod === 'card'

    if (isCardExpense) {
      if (!creditCardId) { setError(t('selectCard')); return }
    } else if (!bankId) {
      setError(t('selectBank'))
      return
    }

    setSaving(true)

    const parsedAmount = parseFloat(amount)
    const oldAmount = Number(transaction.amount)
    const oldType = transaction.type
    const oldBankId = transaction.bank_id
    const oldCardId = transaction.credit_card_id
    const newVaultId = type === 'expense' && vaultId ? vaultId : null
    const oldVaultId = transaction.vault_id

    const { error: txError } = await supabase
      .from('transactions')
      .update({
        bank_id: isCardExpense ? null : bankId,
        credit_card_id: isCardExpense ? creditCardId : null,
        type,
        category,
        amount: parsedAmount,
        description: description.trim(),
        transaction_date: date,
        vault_id: newVaultId,
      })
      .eq('id', transaction.id)

    if (txError) { setError(txError.message); setSaving(false); return }

    const wasCard = Boolean(oldCardId)
    const isCard = isCardExpense

    if (wasCard && isCard) {
      if (oldCardId === creditCardId) {
        const netDelta = -cardDelta(oldType, oldAmount) + cardDelta(type, parsedAmount)
        if (netDelta !== 0) {
          const cardError = await adjustCardBalance(creditCardId, netDelta)
          if (cardError) { setError(cardError.message); setSaving(false); return }
        }
      } else {
        const reverseError = await adjustCardBalance(oldCardId, -cardDelta(oldType, oldAmount))
        if (reverseError) { setError(reverseError.message); setSaving(false); return }
        const applyError = await adjustCardBalance(creditCardId, cardDelta(type, parsedAmount))
        if (applyError) { setError(applyError.message); setSaving(false); return }
      }
    } else if (wasCard && !isCard) {
      const reverseCardError = await adjustCardBalance(oldCardId, -cardDelta(oldType, oldAmount))
      if (reverseCardError) { setError(reverseCardError.message); setSaving(false); return }
      const applyBankError = await adjustBankBalance(bankId, bankDelta(type, parsedAmount))
      if (applyBankError) { setError(applyBankError.message); setSaving(false); return }
    } else if (!wasCard && isCard) {
      const reverseBankError = await adjustBankBalance(oldBankId, -bankDelta(oldType, oldAmount))
      if (reverseBankError) { setError(reverseBankError.message); setSaving(false); return }
      const applyCardError = await adjustCardBalance(creditCardId, cardDelta(type, parsedAmount))
      if (applyCardError) { setError(applyCardError.message); setSaving(false); return }
    } else if (oldBankId === bankId) {
      const netDelta = -bankDelta(oldType, oldAmount) + bankDelta(type, parsedAmount)
      const bankError = await adjustBankBalance(bankId, netDelta)
      if (bankError) { setError(bankError.message); setSaving(false); return }
    } else {
      const reverseError = await adjustBankBalance(oldBankId, -bankDelta(oldType, oldAmount))
      if (reverseError) { setError(reverseError.message); setSaving(false); return }
      const applyError = await adjustBankBalance(bankId, bankDelta(type, parsedAmount))
      if (applyError) { setError(applyError.message); setSaving(false); return }
    }

    if (oldVaultId && oldType === 'expense') {
      if (oldVaultId === newVaultId) {
        const netVaultDelta = -oldAmount + (newVaultId ? parsedAmount : 0)
        if (netVaultDelta !== 0) {
          const vaultError = await adjustVaultBalance(oldVaultId, netVaultDelta)
          if (vaultError) { setError(vaultError.message); setSaving(false); return }
        }
      } else {
        const reverseVaultError = await adjustVaultBalance(oldVaultId, -oldAmount)
        if (reverseVaultError) { setError(reverseVaultError.message); setSaving(false); return }
      }
    }

    if (newVaultId && type === 'expense' && newVaultId !== oldVaultId) {
      const applyVaultError = await adjustVaultBalance(newVaultId, parsedAmount)
      if (applyVaultError) { setError(applyVaultError.message); setSaving(false); return }
    }

    onSaved()
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')

    const txAmount = Number(transaction.amount)

    if (transaction.credit_card_id) {
      const cardError = await adjustCardBalance(
        transaction.credit_card_id,
        -cardDelta(transaction.type, txAmount),
      )
      if (cardError) { setError(cardError.message); setDeleting(false); return }

      await supabase
        .from('cuotas')
        .update({ is_active: false })
        .eq('transaction_id', transaction.id)
    } else {
      const bankError = await adjustBankBalance(
        transaction.bank_id,
        -bankDelta(transaction.type, txAmount),
      )
      if (bankError) { setError(bankError.message); setDeleting(false); return }
    }

    if (transaction.vault_id && transaction.type === 'expense') {
      const vaultError = await adjustVaultBalance(transaction.vault_id, -txAmount)
      if (vaultError) { setError(vaultError.message); setDeleting(false); return }
    }

    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transaction.id)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
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
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
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
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('editTransaction')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
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

          {type === 'expense' && (
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

          {type === 'expense' && paymentMethod === 'card' ? (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('creditCard')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={creditCardId}
                onChange={e => setCreditCardId(e.target.value)}
              >
                {creditCards.map(card => (
                  <option key={card.id} value={card.id}>{card.name}</option>
                ))}
              </select>
              {linkedCuota && (
                <p className="text-xs text-gray-500 mt-2">
                  {t('cuotaProgress', {
                    paid: linkedCuota.paid_cuotas || 0,
                    total: linkedCuota.total_cuotas || 0,
                  })}
                </p>
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

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>

        <button
          onClick={handleDelete}
          disabled={saving || deleting}
          className="w-full mt-3 py-3 rounded-xl border border-red-200 text-sm text-red-500 font-medium disabled:opacity-50"
        >
          {deleting ? '...' : t('deleteTransaction')}
        </button>
      </div>
    </div>
  )
}
