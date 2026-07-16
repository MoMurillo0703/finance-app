import { useState, useEffect, useMemo } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddTransactionModal from './AddTransactionModal'
import EditTransactionModal from './EditTransactionModal'
import RecategorizeTransactionSheet from './RecategorizeTransactionSheet'
import ImportCSVSheet from './ImportCSVSheet'
import { useDevice } from '../../hooks/useDevice'
import PaydayWizard from '../payday/PaydayWizard'
import FilterSheet from './FilterSheet'
import { PageHeader } from '../layout/PageHeader'

import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'
import { txTypeLabel, txAmountClass, txAmountPrefix, isSpendingTransaction, isIncomeTransaction } from '../../utils/transactionType'
import {
  filterTransactions,
  DEFAULT_ADVANCED_FILTERS,
  countActiveAdvancedFilters,
  getTransactionCategoryLabel,
} from '../../utils/transactionFilters'

const CATEGORY_FILTER_CHIPS = [
  { labelKey: 'all', key: null },
  { labelKey: 'categoryDining', key: 'dining' },
  { labelKey: 'categoryGroceries', key: 'groceries' },
  { labelKey: 'categoryTransport', key: 'transport' },
  { labelKey: 'categoryUtilities', key: 'utilities' },
  { labelKey: 'categorySubscriptions', key: 'subscriptions' },
  { labelKey: 'categoryHealth', key: 'health' },
  { labelKey: 'categoryShopping', key: 'shopping' },
  { labelKey: 'categoryEntertainment', key: 'entertainment' },
  { labelKey: 'categoryTravel', key: 'travel' },
  { labelKey: 'categoryGas', key: 'gas' },
  { labelKey: 'categoryInsurance', key: 'insurance' },
  { labelKey: 'categoryAuto', key: 'auto' },
  { labelKey: 'categoryBusiness', key: 'business' },
  { labelKey: 'categoryPersonal', key: 'personal' },
  { labelKey: 'categoryOther', key: 'other' },
]

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
    if (isSpendingTransaction(tx)) charges += tx.amount
    else if (isIncomeTransaction(tx)) payments += tx.amount
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
  onSettings,
  showToast,
}) {
  const { t, i18n } = useTranslation()
  const { isWeb } = useDevice()
  const isFiltered = Boolean(filterCreditCardId || filterBankId)
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [recategorizeTransaction, setRecategorizeTransaction] = useState(null)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [wizardPrefill, setWizardPrefill] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState(null)
  const [filterAccount, setFilterAccount] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState(DEFAULT_ADVANCED_FILTERS)

  const activeFilterCount = countActiveAdvancedFilters(advancedFilters)

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, {
      search,
      filterCategory,
      filterAccount,
      ...advancedFilters,
    }),
    [transactions, search, filterCategory, filterAccount, advancedFilters],
  )
  const monthGroups = useMemo(() => groupByMonth(filteredTransactions), [filteredTransactions])
  const listKey = `${filterCreditCardId ?? ''}-${filterBankId ?? ''}-${refreshKey}`
  const filtersActive = Boolean(
    search || filterCategory || filterAccount || activeFilterCount > 0,
  )

  useEffect(() => {
    if (monthGroups.length === 0) {
      setExpandedMonths(new Set())
      return
    }
    setExpandedMonths(new Set([monthGroups[0].monthKey]))
  }, [listKey, monthGroups.length, monthGroups[0]?.monthKey])

  const overlayOpen =
    showAdd ||
    showImport ||
    showFilters ||
    !!editingTransaction ||
    !!recategorizeTransaction ||
    !!wizardPrefill

  useEffect(() => {
    setHideNav?.(overlayOpen)
    return () => setHideNav?.(false)
  }, [overlayOpen, setHideNav])

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
          ? 'bg-lala-50 rounded-xl p-3'
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
            getTransactionCategoryLabel(tx.category, t),
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className={`text-sm font-bold shrink-0 ${txAmountClass(tx.type, tx)}`}>
        {txAmountPrefix(tx.type, tx)}{formatMoney(tx.amount)}
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
      const selectWithPairing =
        'id, type, amount, description, category, transaction_date, bank_id, credit_card_id, vault_id, is_transfer, paired_transaction_id, transfer_direction, banks(name, nickname)'
      const selectBasic =
        'id, type, amount, description, category, transaction_date, bank_id, credit_card_id, vault_id, is_transfer, banks(name, nickname)'

      const buildTxQuery = (select) => {
        let q = supabase
          .from('transactions')
          .select(select)
          .eq('user_id', user.id)
          .order('transaction_date', { ascending: false })
        if (filterCreditCardId) q = q.eq('credit_card_id', filterCreditCardId)
        if (filterBankId) q = q.eq('bank_id', filterBankId)
        return q
      }

      const [txResInitial, banksRes, cardsRes] = await Promise.all([
        buildTxQuery(selectWithPairing),
        fetchBanks(supabase, user.id, { orderByName: true }),
        supabase
          .from('credit_cards')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
      ])

      let txRes = txResInitial
      if (
        txRes.error
        && (txRes.error.message?.includes('paired_transaction_id')
          || txRes.error.message?.includes('transfer_direction'))
      ) {
        txRes = await buildTxQuery(selectBasic)
      }

      if (!active) return

      if (txRes.error) {
        console.error('Failed to fetch transactions:', txRes.error)
      }

      setBanks(banksRes.data ?? [])
      setCreditCards(cardsRes.data ?? [])
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

  const resultCountLabel = filteredTransactions.length === 1
    ? t('transactionResultCount', { count: filteredTransactions.length })
    : t('transactionResultCount_plural', { count: filteredTransactions.length })

  return (
    <div className="bg-lala-50 pb-24">
      <PageHeader title={t('transactions')} onSettings={onSettings} />

      <div className="bg-white px-4 py-3 border-b border-gray-100">
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
          <p className="text-xs text-gray-400 mb-2">{filterCardName} · {t('cardTransactions')}</p>
        )}
        {filterBankName && (
          <p className="text-xs text-gray-400 mb-2">{filterBankName} · {t('accountActivity')}</p>
        )}
        {!isFiltered && (
          <div className="flex justify-end gap-3 items-center mb-1">
            {isWeb && (
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="inline-flex items-center min-h-[44px] text-sm px-4 py-2 rounded-xl font-medium"
                style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}
              >
                {t('importCsv')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-xs text-purple-600 font-medium"
            >
              {t('addTransaction')}
            </button>
          </div>
        )}
      </div>

      {!isFiltered && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterAccount(null)}
            className="flex-shrink-0 inline-flex items-center min-h-[44px] px-3 py-2 rounded-full text-xs font-medium"
            style={{
              backgroundColor: !filterAccount ? '#EDE9FE' : '#F9FAFB',
              color: !filterAccount ? '#6D28D9' : '#6B7280',
            }}
          >
            {t('allAccounts')}
          </button>
          {banks.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => setFilterAccount(b.id)}
              className="flex-shrink-0 inline-flex items-center min-h-[44px] px-3 py-2 rounded-full text-xs font-medium"
              style={{
                backgroundColor: filterAccount === b.id ? '#EDE9FE' : '#F9FAFB',
                color: filterAccount === b.id ? '#6D28D9' : '#6B7280',
              }}
            >
              {b.nickname?.trim() || b.name}
            </button>
          ))}
          {creditCards.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilterAccount(c.id)}
              className="flex-shrink-0 inline-flex items-center min-h-[44px] px-3 py-2 rounded-full text-xs font-medium"
              style={{
                backgroundColor: filterAccount === c.id ? '#EDE9FE' : '#F9FAFB',
                color: filterAccount === c.id ? '#6D28D9' : '#6B7280',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 px-4 pt-4 pb-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchTransactions')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-10 py-3 rounded-2xl text-sm bg-gray-50 border border-gray-100 outline-none focus:border-purple-300"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={t('clearSearch')}
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="relative flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: activeFilterCount > 0 ? '#7C3AED' : '#F5F3FF' }}
          aria-label={t('filters')}
        >
          <SlidersHorizontal size={18} color={activeFilterCount > 0 ? 'white' : '#7C3AED'} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
        {CATEGORY_FILTER_CHIPS.map(({ labelKey, key }) => {
          const isActive = filterCategory === key || (!filterCategory && key === null)
          return (
            <button
              key={labelKey}
              type="button"
              onClick={() => setFilterCategory(key)}
              className="flex-shrink-0 inline-flex items-center min-h-[44px] px-3 py-2 rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: isActive ? '#7C3AED' : '#F5F3FF',
                color: isActive ? 'white' : '#7C3AED',
              }}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>

      {filtersActive && !loading && transactions.length > 0 && (
        <p className="px-4 pb-2 text-xs text-gray-400">{resultCountLabel}</p>
      )}

      <div className="px-4 py-4">
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
                {isWeb && (
                  <button
                    type="button"
                    onClick={() => setShowImport(true)}
                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 min-h-[44px]"
                  >
                    {t('importCsv')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm"
                >
                  {t('addTransaction')}
                </button>
              </div>
            )}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-medium text-gray-500">{t('noTransactionsFoundTitle')}</p>
            <p className="text-sm mt-1">{t('noTransactionsFoundHint')}</p>
          </div>
        ) : (
          renderMonthGroups()
        )}
      </div>

      {!isFiltered && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-purple-600 text-white text-3xl leading-none shadow-lg flex items-center justify-center z-[100]"
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
          showToast={showToast}
        />
      )}

      {showImport && isWeb && (
        <ImportCSVSheet
          onClose={() => setShowImport(false)}
          onImport={() => handleTransactionSaved()}
          showToast={showToast}
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

      {showFilters && (
        <FilterSheet
          appliedFilters={advancedFilters}
          onClose={() => setShowFilters(false)}
          onApply={setAdvancedFilters}
        />
      )}
    </div>
  )
}
