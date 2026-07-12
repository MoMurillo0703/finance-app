import { BUDGET_CATEGORIES, getRecategorizeHighlight } from './transactionCategories'

export const TRANSACTION_FILTER_CHIPS = [
  { id: 'all', labelKey: 'all' },
  { id: 'income', labelKey: 'income', emoji: '💰', match: tx => tx.type === 'income' },
  { id: 'expense', labelKey: 'expense', emoji: '💸', match: tx => tx.type === 'expense' },
  ...BUDGET_CATEGORIES.map(({ key, emoji }) => ({
    id: key,
    labelKey: `category${key.charAt(0).toUpperCase()}${key.slice(1)}`,
    emoji,
    match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === key,
  })),
]

export const DEFAULT_ADVANCED_FILTERS = {
  datePreset: null,
  customFrom: '',
  customTo: '',
  filterType: 'all',
  minAmount: '',
  maxAmount: '',
  sortBy: 'newest',
}

export function getTransactionCategoryLabel(category, t) {
  if (!category) return ''
  const stripped = category.replace(/^category/i, '')
  const key = stripped.charAt(0).toLowerCase() + stripped.slice(1)
  if (key === 'income') return t('income')
  const labelKey = `category${key.charAt(0).toUpperCase()}${key.slice(1)}`
  const categoryLabel = t(labelKey)
  if (categoryLabel !== labelKey) return categoryLabel
  const direct = t(key)
  if (direct !== key) return direct
  return stripped
}

export function countActiveAdvancedFilters(filters = DEFAULT_ADVANCED_FILTERS) {
  let count = 0
  if (filters.datePreset) count++
  if (filters.filterType !== 'all') count++
  if (filters.minAmount) count++
  if (filters.maxAmount) count++
  if (filters.sortBy !== 'newest') count++
  return count
}

function parseTxDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function matchesDatePreset(tx, { datePreset, customFrom, customTo }) {
  if (!datePreset) return true
  const txDate = parseTxDate(tx.transaction_date)
  if (!txDate) return false
  const now = new Date()

  if (datePreset === 'this_month') {
    return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()
  }
  if (datePreset === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return txDate.getMonth() === lm.getMonth() && txDate.getFullYear() === lm.getFullYear()
  }
  if (datePreset === 'last_3_months') {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
    return txDate >= cutoff
  }
  if (datePreset === 'this_year') {
    return txDate.getFullYear() === now.getFullYear()
  }
  if (datePreset === 'custom') {
    const from = customFrom ? parseTxDate(customFrom) : null
    const to = customTo ? parseTxDate(customTo) : null
    if (from && txDate < from) return false
    if (to && txDate > to) return false
    return true
  }
  return true
}

function sortTransactions(transactions, sortBy = 'newest') {
  const sorted = [...transactions]
  sorted.sort((a, b) => {
    if (sortBy === 'oldest') {
      return parseTxDate(a.transaction_date) - parseTxDate(b.transaction_date)
    }
    if (sortBy === 'highest') return b.amount - a.amount
    if (sortBy === 'lowest') return a.amount - b.amount
    return parseTxDate(b.transaction_date) - parseTxDate(a.transaction_date)
  })
  return sorted
}

export function filterTransactions(
  transactions,
  {
    search = '',
    filterCategory = null,
    filterAccount = null,
    ...advanced
  } = {},
) {
  const filters = { ...DEFAULT_ADVANCED_FILTERS, ...advanced }
  const query = search.trim().toLowerCase()

  const filtered = transactions.filter(tx => {
    const matchesSearch = !query
      || (tx.description || '').toLowerCase().includes(query)
      || (tx.category || '').toLowerCase().includes(query)
    const matchesCategory = !filterCategory || getRecategorizeHighlight(tx) === filterCategory
    const matchesAccount = !filterAccount
      || tx.bank_id === filterAccount
      || tx.credit_card_id === filterAccount
    const matchesType = filters.filterType === 'all'
      || (filters.filterType === 'income' && tx.type === 'income')
      || (filters.filterType === 'expense' && tx.type === 'expense')
    const min = filters.minAmount ? parseFloat(filters.minAmount) : null
    const max = filters.maxAmount ? parseFloat(filters.maxAmount) : null
    const matchesMin = min == null || Number.isNaN(min) || tx.amount >= min
    const matchesMax = max == null || Number.isNaN(max) || tx.amount <= max
    const matchesDate = matchesDatePreset(tx, filters)
    return matchesSearch && matchesCategory && matchesAccount
      && matchesType && matchesMin && matchesMax && matchesDate
  })

  return sortTransactions(filtered, filters.sortBy)
}
