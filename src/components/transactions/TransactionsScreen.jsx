import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddTransactionModal from './AddTransactionModal'
import EditTransactionModal from './EditTransactionModal'
import RecategorizeTransactionSheet from './RecategorizeTransactionSheet'
import ImportModal from './ImportModal'
import PaydayWizard from '../payday/PaydayWizard'

import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'
import { txTypeLabel, txAmountClass, txAmountPrefix } from '../../utils/transactionType'
import { TRANSACTION_FILTER_CHIPS, filterTransactions } from '../../utils/transactionFilters'

function enrichTransactions(transactions, banks, cards) {
  const bankMap = Object.fromEntries(banks.map(b => [b.id, b]))
  const cardMap = Object.fromEntries(cards.map(c => [c.id, c]))

  return transactions.map(tx => ({
    ...tx,
    banks: tx.banks ?? (tx.bank_id ? bankMap[tx.bank_id] ?? null : null),
    credit_cards: tx.credit_card_id ? cardMap[tx.credit_card_id] ?? null : null,
  }))
}

function groupByMonth(transactions) {
  const groups = {}
  for (const tx of transactions) {
    const monthKey = tx.transaction_date?.slice(0, 7)
    if (!monthKey) continue
    if (!groups[monthKey]) groups[monthKey] = []
    groups[monthKey].push(tx)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, items]) => ({ monthKey, items }))
}

function formatMonthLabel(monthKey, language) {
  const [yyyy, mm] = monthKey.split('-')
  const date = new Date(Number(yyyy), Number(mm) - 1, 1)
  return date.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function monthSummary(items) {
  let charges = 0
  let payments = 0
  for (const tx of items) {
    if (tx.type === 'expense') charges += tx.amount
    else payments += tx.amount
  }
  return { charges, payments, count: items.length }
}

export default function TransactionsScreen({
  onTransactionSaved,
  filterCreditCardId,
  filterCardName,
  filterBankId,
  filterBankName,
  filterFrom,
  onClearFilter,
  setHideNav,
}) {
  const { t, i18n } = useTranslation()
  const isFiltered = Boolean(filterCreditCardId || filterBankId)
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [recategorizeTransaction, setRecategorizeTransaction] = useState(null)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [wizardPrefill, setWizardPrefill] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, { search: searchQuery, categoryFilter }),
    [transactions, searchQuery, categoryFilter],
  )
  const monthGroups = useMemo(() => groupByMonth(filteredTransactions), [filteredTransactions])
  const listKey = `${filterCreditCardId ?? ''}-${filterBankId ?? ''}-${refreshKey}`

  useEffect(() => {
    if (monthGroups.length === 0) {
      setExpandedMonths(new Set())
      return
    }
    setExpandedMonths(new Set([monthGroups[0].monthKey]))
  }, [listKey, monthGroups.length, monthGroups[0]?.monthKey])

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(monthKey)) next.delete(monthKey)
      else next.add(monthKey)
      return next
    })
  }

  const renderTransactionRow = (tx, nested = false) => (
    <button
      key={tx.id}
      type="button"
      onClick={() => setEditingTransaction(tx)}
      className={`w-full border border-gray-100 flex justify-between items-center text-left ${
        nested
          ? 'bg-gray-50 rounded-xl p-3'
          : 'bg-white rounded-2xl p-4 shadow-sm'
      }`}
    >
      <div className="min-w-0 pr-2">
        <p className="text-sm font-medium text-gray-700 truncate">
          {tx.description || txTypeLabel(tx.type, t)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {[
            !isFiltered && (getBankDropdownLabel(tx.banks) || tx.credit_cards?.name),
            formatDate(tx.transaction_date),
            t(tx.category, { defaultValue: tx.category }),
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className={`text-sm font-bold shrink-0 ${txAmountClass(tx.type)}`}>
        {txAmountPrefix(tx.type)}{formatMoney(tx.amount)}
      </p>
    </button>
  )

  const renderMonthGroups = () => (
    <div className="space-y-3">
      {monthGroups.map(({ monthKey, items }) => {
        const summary = monthSummary(items)
        const isExpanded = expandedMonths.has(monthKey)

        return (
          <div key={monthKey} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleMonth(monthKey)}
              className="w-full px-4 py-3 flex justify-between items-center text-left"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800 capitalize">
                  {formatMonthLabel(monthKey, i18n.language)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('monthTransactionCount', { count: summary.count })}
                  {summary.charges > 0 && ` · ${t('monthCharges')}: ${formatMoney(summary.charges)}`}
                  {summary.payments > 0 && ` · ${t('monthPayments')}: ${formatMoney(summary.payments)}`}
                </p>
              </div>
              <span className="text-gray-400 text-sm ml-2">{isExpanded ? '▾' : '▸'}</span>
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
                {items.map(tx => renderTransactionRow(tx, true))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )


  useEffect(() => {
    let active = true

    ;(async () => {
      let txQuery = supabase
        .from('transactions')
        .select('id, type, amount, description, category, transaction_date, bank_id, credit_card_id, vault_id, banks(name, nickname)')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })

      if (filterCreditCardId) {
        txQuery = txQuery.eq('credit_card_id', filterCreditCardId)
      }

      if (filterBankId) {
        txQuery = txQuery.eq('bank_id', filterBankId)
      }

      const [txRes, banksRes, cardsRes] = await Promise.all([
        txQuery,
        fetchBanks(supabase, user.id, { orderByName: true }),
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
  }, [user.id, refreshKey, filterCreditCardId, filterBankId])

  const handleTransactionSaved = () => {
    setShowAdd(false)
    setShowImport(false)
    setRecategorizeTransaction(null)
    setEditingTransaction(null)
    setRefreshKey(k => k + 1)
    onTransactionSaved?.()
  }

  const handleOpenWizard = (amount, bankId) => {
    setWizardPrefill({ amount, bankId })
  }

  return (
    <div className="bg-gray-50">
      <div className="bg-white px-6 py-3 border-b border-gray-100">
        {isFiltered && (
          <button
            type="button"
            onClick={onClearFilter}
            className="text-sm text-purple-600 font-medium mb-1"
          >
            ← {filterBankId ? (filterFrom === 'settings' ? t('myAccounts') : t('accounts')) : t('creditCards')}
          </button>
        )}
        {filterCardName && (
          <p className="text-xs text-gray-400">{filterCardName} · {t('cardTransactions')}</p>
        )}
        {filterBankName && (
          <p className="text-xs text-gray-400">{filterBankName} · {t('accountActivity')}</p>
        )}
        {!isFiltered && (
          <div className="flex justify-end gap-3 items-center">
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

      <div className="bg-white px-6 py-3 border-b border-gray-100 space-y-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchTransactions')}
            className="w-full border border-gray-200 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              aria-label={t('clearSearch')}
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {TRANSACTION_FILTER_CHIPS.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCategoryFilter(chip.id)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                categoryFilter === chip.id
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {chip.emoji && <span>{chip.emoji}</span>}
              <span>{t(chip.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('loading')}</p>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium text-gray-600">
              {filterCreditCardId
                ? t('noCardTransactions')
                : filterBankId
                  ? t('noAccountTransactions')
                  : t('noTransactions')}
            </p>
            {!isFiltered && (
              <p className="text-sm mt-1">{t('importOrAdd')}</p>
            )}
            {!isFiltered && (
              <div className="flex justify-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowImport(true)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600"
                >
                  {t('importCsv')}
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm"
                >
                  {t('addTransaction')}
                </button>
              </div>
            )}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('noTransactionsFound')}</p>
        ) : (
          renderMonthGroups()
        )}
      </div>

      {!isFiltered && (
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

      {recategorizeTransaction && (
        <RecategorizeTransactionSheet
          transaction={recategorizeTransaction}
          onClose={() => setRecategorizeTransaction(null)}
          onSaved={handleTransactionSaved}
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
          setHideNav={setHideNav}
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
