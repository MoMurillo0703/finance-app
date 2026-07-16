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
import { getUserCurrency, isLatAmUser } from '../../utils/currency'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import { getRecategorizeHighlight, EDIT_EXPENSE_CATEGORIES, getCategoryPickerLabel } from '../../utils/transactionCategories'
import { isTransferTransaction } from '../../utils/transactionType'
import { pairTransactions, unpairTransfer } from '../../utils/transferMatcher'
import DeleteConfirmBlock from '../shared/DeleteConfirmBlock'
import PairPickerSheet from './PairPickerSheet'

const INCOME_CATEGORIES = [
  { key: 'salary', emoji: '💰' },
  { key: 'commission', emoji: '📈' },
  { key: 'reimbursement', emoji: '↩️' },
]

export default function EditTransactionModal({ transaction, onClose, onSaved, showToast }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [type, setType] = useState(transaction.type)
  const [category, setCategory] = useState(
    transaction.type === 'income' ? transaction.category : getRecategorizeHighlight(transaction),
  )
  const [isTransfer, setIsTransfer] = useState(
    Boolean(transaction.is_transfer || getRecategorizeHighlight(transaction) === 'transfer'),
  )
  const amountInput = useCurrencyInput(transaction.amount)
  const currency = getUserCurrency()
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
  const [pairCandidates, setPairCandidates] = useState([])
  const [pairedTransactionId, setPairedTransactionId] = useState(transaction.paired_transaction_id ?? null)
  const [pairedAccountName, setPairedAccountName] = useState(transaction.paired_account_name ?? '')
  const [showPairPicker, setShowPairPicker] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
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

    if (isLatAmUser() && transaction.credit_card_id) {
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

    if (transaction.paired_transaction_id) {
      supabase
        .from('transactions')
        .select('id, description, bank_id, banks(name, nickname)')
        .eq('id', transaction.paired_transaction_id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return
          setPairedAccountName(
            getBankDropdownLabel(data.banks)
            || data.description?.slice(0, 40)
            || t('pairedTransfer'),
          )
        })
    }

    supabase
      .from('transactions')
      .select('id, amount, description, transaction_date, category, is_transfer, bank_id, type, paired_transaction_id, banks(name, nickname)')
      .eq('user_id', user.id)
      .or('is_transfer.eq.true,category.ilike.transfer')
      .order('transaction_date', { ascending: false })
      .limit(200)
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          supabase
            .from('transactions')
            .select('id, amount, description, transaction_date, category, is_transfer, bank_id, type, paired_transaction_id, banks(name, nickname)')
            .eq('user_id', user.id)
            .order('transaction_date', { ascending: false })
            .limit(300)
            .then(({ data: recent }) => {
              setPairCandidates((recent ?? []).filter(isTransferTransaction).map(enrichCandidate))
            })
          return
        }
        setPairCandidates((data ?? []).map(enrichCandidate))
      })
  }, [user.id, transaction.id, transaction.credit_card_id, transaction.paired_transaction_id, t])

  function enrichCandidate(tx) {
    return {
      ...tx,
      bank_name: getBankDropdownLabel(tx.banks) || undefined,
    }
  }

  const currentTx = {
    ...transaction,
    type,
    category: category === 'transfer' ? 'Transfer' : category,
    is_transfer: isTransfer || category === 'transfer',
    amount: amountInput.numericValue || transaction.amount,
    description,
    transaction_date: date,
    bank_id: bankId || transaction.bank_id,
    paired_transaction_id: pairedTransactionId,
  }

  const showTransferPairing = isTransferTransaction(currentTx)

  const handlePair = async (txOut, txIn) => {
    setPairing(true)
    setError('')
    const { error: pairError } = await pairTransactions(supabase, txOut, txIn, banks)
    setPairing(false)
    if (pairError) {
      setError(pairError.message)
      return
    }
    const pairedId = txOut.id === transaction.id ? txIn.id : txOut.id
    const pairedTx = pairedId === txIn.id ? txIn : txOut
    setPairedTransactionId(pairedId)
    setPairedAccountName(
      getBankDropdownLabel(banks.find(b => b.id === pairedTx.bank_id))
      || pairedTx.bank_name
      || pairedTx.description?.slice(0, 40)
      || t('pairedTransfer'),
    )
    setShowPairPicker(false)
    showToast?.(t('transferLinked'))
    onSaved?.()
  }

  const handleUnpair = async () => {
    setPairing(true)
    setError('')
    const { error: unpairError } = await unpairTransfer(supabase, {
      id: transaction.id,
      paired_transaction_id: pairedTransactionId,
    })
    setPairing(false)
    if (unpairError) {
      setError(unpairError.message)
      return
    }
    setPairedTransactionId(null)
    setPairedAccountName('')
    showToast?.(t('transferUnlinked'))
    onSaved?.()
  }

  const handleSave = async () => {
    if (!amountInput.raw || amountInput.numericValue <= 0) { setError(t('invalidAmount')); return }
    if (!category) { setError(t('selectCategory')); return }

    const isCardExpense = type === 'expense' && paymentMethod === 'card'

    if (isCardExpense) {
      if (!creditCardId) { setError(t('selectCard')); return }
    } else if (!bankId) {
      setError(t('selectBank'))
      return
    }

    setSaving(true)

    const parsedAmount = amountInput.numericValue
    const oldAmount = Number(transaction.amount)
    const oldType = transaction.type
    const oldBankId = transaction.bank_id
    const oldCardId = transaction.credit_card_id
    const newVaultId = type === 'expense' && vaultId ? vaultId : null
    const oldVaultId = transaction.vault_id

    const saveCategory = category === 'income' ? 'salary' : category
    const saveIsTransfer = category === 'transfer'

    let updatePayload = {
      bank_id: isCardExpense ? null : bankId,
      credit_card_id: isCardExpense ? creditCardId : null,
      type,
      category: saveCategory,
      amount: parsedAmount,
      description: description.trim(),
      transaction_date: date,
      vault_id: newVaultId,
      is_transfer: saveIsTransfer,
      source: 'manual',
    }

    let { error: txError } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', transaction.id)

    if (txError && (txError.message.includes('is_transfer') || txError.message.includes('source'))) {
      if (txError.message.includes('is_transfer')) {
        const { is_transfer: _isTransfer, ...rest } = updatePayload
        updatePayload = rest
      }
      if (txError.message.includes('source')) {
        const { source: _source, ...rest } = updatePayload
        updatePayload = rest
      }
      ;({ error: txError } = await supabase
        .from('transactions')
        .update(updatePayload)
        .eq('id', transaction.id))
    }

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

  const handleTypeChange = (nextType) => {
    setType(nextType)
    setIsTransfer(false)
    setCategory(nextType === 'income' ? 'salary' : 'other')
    if (nextType === 'income') {
      setVaultId('')
      setPaymentMethod('bank')
    }
  }

  const handleCategorySelect = (key) => {
    if (key === 'income') {
      setType('income')
      setCategory('salary')
      setIsTransfer(false)
      return
    }
    setCategory(key)
    if (key === 'transfer') {
      setIsTransfer(true)
      if (type === 'income') setType('expense')
    } else {
      setIsTransfer(false)
    }
  }

  const categoryOptions = type === 'income'
    ? INCOME_CATEGORIES
    : EDIT_EXPENSE_CATEGORIES

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
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('description')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('amount')} ({currency})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={amountInput.displayValue}
              onChange={amountInput.handleChange}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('date')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('category')}</label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {categoryOptions.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => handleCategorySelect(cat.key)}
                  className={`py-2 rounded-xl text-xs flex flex-col items-center gap-1 border ${
                    (category === cat.key || (cat.key === 'transfer' && isTransfer && category === 'transfer'))
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span className="truncate w-full text-center px-0.5">{getCategoryPickerLabel(cat.key, t)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('type')}</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`py-2 rounded-xl text-sm border ${type === 'expense' ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-500'}`}
              >
                {t('expense')}
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`py-2 rounded-xl text-sm border ${type === 'income' ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-500'}`}
              >
                {t('income')}
              </button>
            </div>
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
              {isLatAmUser() && linkedCuota && (
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

          {showTransferPairing && !pairedTransactionId && (
            <button
              type="button"
              onClick={() => setShowPairPicker(true)}
              disabled={pairing}
              className="w-full py-3 rounded-2xl text-sm font-medium mt-1 min-h-[44px] disabled:opacity-50"
              style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}
            >
              🔗 {t('linkTransfer')}
            </button>
          )}

          {showTransferPairing && pairedTransactionId && (
            <div
              className="mt-1 p-3 rounded-2xl flex items-center gap-3"
              style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}
            >
              <span className="text-green-600">↔️</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-green-700">{t('pairedTransfer')}</p>
                <p className="text-xs text-green-600 truncate">{pairedAccountName}</p>
              </div>
              <button
                type="button"
                onClick={handleUnpair}
                disabled={pairing}
                className="ml-auto text-xs text-gray-400 min-h-[44px] px-2 disabled:opacity-50"
              >
                {t('unlinkTransfer')}
              </button>
            </div>
          )}

        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || deleting || pairing}
          className="w-full py-3 rounded-2xl bg-purple-600 text-white font-semibold mt-4 disabled:opacity-50"
        >
          {saving ? '...' : t('saveChanges')}
        </button>

        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={saving || deleting || pairing}
          className="w-full py-3 rounded-2xl border border-red-200 text-red-500 text-sm mt-2 disabled:opacity-50"
        >
          {t('deleteTransaction')}
        </button>

        <DeleteConfirmBlock
          show={showDeleteConfirm}
          message={t('deleteTransactionConfirm')}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          confirming={deleting}
          t={t}
        />
      </div>

      {showPairPicker && (
        <PairPickerSheet
          tx={currentTx}
          transactions={pairCandidates}
          banks={banks}
          onPair={handlePair}
          onClose={() => setShowPairPicker(false)}
        />
      )}
    </div>
  )
}
