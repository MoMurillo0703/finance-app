import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddTransactionModal from './AddTransactionModal'
import EditTransactionModal from './EditTransactionModal'
import TransactionDetailModal from './TransactionDetailModal'
import ImportModal from './ImportModal'
import PaydayWizard from '../payday/PaydayWizard'

import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getBankDisplayName } from '../../utils/bank'
import { txTypeLabel, txAmountClass, txAmountPrefix } from '../../utils/transactionType'

function enrichTransactions(transactions, banks, cards) {
  const bankMap = Object.fromEntries(banks.map(b => [b.id, b]))
  const cardMap = Object.fromEntries(cards.map(c => [c.id, c]))

  return transactions.map(tx => ({
    ...tx,
    banks: tx.bank_id ? bankMap[tx.bank_id] ?? null : null,
    credit_cards: tx.credit_card_id ? cardMap[tx.credit_card_id] ?? null : null,
  }))
}

export default function TransactionsScreen({
  onTransactionSaved,
  filterCreditCardId,
  filterCardName,
  onClearFilter,
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [wizardPrefill, setWizardPrefill] = useState(null)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    let active = true

    ;(async () => {
      let txQuery = supabase
        .from('transactions')
        .select('id, type, amount, description, transaction_date, category, bank_id, credit_card_id, vault_id')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })

      if (filterCreditCardId) {
        txQuery = txQuery.eq('credit_card_id', filterCreditCardId)
      }

      const [txRes, banksRes, cardsRes] = await Promise.all([
        txQuery,
        supabase
          .from('banks')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('credit_cards')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      if (!active) return

      if (txRes.error) {
        console.error('Failed to fetch transactions:', txRes.error)
      }

      setTransactions(enrichTransactions(txRes.data ?? [], banksRes.data ?? [], cardsRes.data ?? []))
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey, filterCreditCardId])

  const handleTransactionSaved = () => {
    setShowAdd(false)
    setShowImport(false)
    setSelectedTransaction(null)
    setEditingTransaction(null)
    setRefreshKey(k => k + 1)
    onTransactionSaved?.()
  }

  const handleOpenWizard = (amount, bankId) => {
    setWizardPrefill({ amount, bankId })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-6 pt-12 pb-4">
        {filterCreditCardId ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClearFilter}
              className="text-sm text-purple-600 font-medium"
            >
              ← {t('creditCards')}
            </button>
          </div>
        ) : null}
        <div className="flex justify-between items-center mt-1">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {filterCardName || t('transactions')}
            </h1>
            {filterCardName && (
              <p className="text-xs text-gray-400 mt-0.5">{t('cardTransactions')}</p>
            )}
          </div>
          {!filterCreditCardId && (
            <div className="flex gap-3 items-center">
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="hidden md:inline-flex text-xs text-gray-500 font-medium border border-gray-200 rounded-full px-3 py-1 hover:border-purple-300 hover:text-purple-600"
              >
                {t('importCsv')}
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="text-xs text-purple-600 font-medium"
              >
                {t('addTransaction')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('loading')}</p>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">
              {filterCreditCardId ? t('noCardTransactions') : t('noTransactions')}
            </p>
            {!filterCreditCardId && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-3 text-purple-600 text-sm font-medium"
              >
                {t('addFirstTransaction')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map(tx => (
              <button
                key={tx.id}
                type="button"
                onClick={() => setSelectedTransaction(tx)}
                className="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex justify-between items-center text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {tx.description || txTypeLabel(tx.type, t)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[
                      !filterCreditCardId && (getBankDisplayName(tx.banks) || tx.credit_cards?.name),
                      formatDate(tx.transaction_date),
                      t(tx.category, { defaultValue: tx.category }),
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className={`text-sm font-bold ${txAmountClass(tx.type)}`}>
                  {txAmountPrefix(tx.type)}{formatMoney(tx.amount)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {!filterCreditCardId && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-purple-600 text-white text-3xl leading-none shadow-lg flex items-center justify-center"
          aria-label={t('addTransaction')}
        >
          +
        </button>
      )}

      {showAdd && (
        <AddTransactionModal
          onClose={() => setShowAdd(false)}
          onSaved={handleTransactionSaved}
          onOpenWizard={handleOpenWizard}
        />
      )}

      {selectedTransaction && !editingTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onEdit={(tx) => {
            setSelectedTransaction(null)
            setEditingTransaction(tx)
          }}
        />
      )}

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={handleTransactionSaved}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onComplete={handleTransactionSaved}
        />
      )}

      {wizardPrefill && (
        <PaydayWizard
          prefillAmount={wizardPrefill.amount}
          prefillBankId={wizardPrefill.bankId}
          onClose={() => setWizardPrefill(null)}
          onComplete={() => {
            setWizardPrefill(null)
            setRefreshKey(k => k + 1)
            onTransactionSaved?.()
          }}
        />
      )}
    </div>
  )
}
