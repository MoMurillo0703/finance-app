import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddTransactionModal from './AddTransactionModal'
import EditTransactionModal from './EditTransactionModal'
import PaydayWizard from '../payday/PaydayWizard'

import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getBankDisplayName } from '../../utils/bank'

export default function TransactionsScreen({ onTransactionSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [wizardPrefill, setWizardPrefill] = useState(null)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, type, amount, description, transaction_date, category, bank_id, credit_card_id, vault_id, banks(name, nickname), credit_cards(name), vaults(name)')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })

      if (!active) return
      if (data) setTransactions(data)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const handleTransactionSaved = () => {
    setShowAdd(false)
    setRefreshKey(k => k + 1)
    onTransactionSaved?.()
  }

  const handleOpenWizard = (amount, bankId) => {
    setWizardPrefill({ amount, bankId })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-6 pt-12 pb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{t('transactions')}</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs text-purple-600 font-medium"
        >
          {t('addTransaction')}
        </button>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('loading')}</p>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">{t('noTransactions')}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-purple-600 text-sm font-medium"
            >
              {t('addFirstTransaction')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map(tx => (
              <button
                key={tx.id}
                type="button"
                onClick={() => setEditingTransaction(tx)}
                className="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex justify-between items-center text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {tx.description || (tx.type === 'income' ? t('income') : t('expense'))}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[
                      getBankDisplayName(tx.banks) || tx.credit_cards?.name,
                      tx.vaults?.name,
                      formatDate(tx.transaction_date),
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p
                  className={`text-sm font-bold ${tx.type === 'income' ? 'text-green-500' : 'text-red-500'}`}
                >
                  {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-purple-600 text-white text-3xl leading-none shadow-lg flex items-center justify-center"
        aria-label={t('addTransaction')}
      >
        +
      </button>

      {showAdd && (
        <AddTransactionModal
          onClose={() => setShowAdd(false)}
          onSaved={handleTransactionSaved}
          onOpenWizard={handleOpenWizard}
        />
      )}

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={() => {
            setEditingTransaction(null)
            setRefreshKey(k => k + 1)
            onTransactionSaved?.()
          }}
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
