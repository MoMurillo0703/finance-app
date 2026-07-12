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

export function filterTransactions(
  transactions,
  { search = '', filterCategory = null, filterAccount = null } = {},
) {
  const query = search.trim().toLowerCase()

  return transactions.filter(tx => {
    const matchesSearch = !query
      || (tx.description || '').toLowerCase().includes(query)
      || (tx.category || '').toLowerCase().includes(query)
    const matchesCategory = !filterCategory || getRecategorizeHighlight(tx) === filterCategory
    const matchesAccount = !filterAccount
      || tx.bank_id === filterAccount
      || tx.credit_card_id === filterAccount
    return matchesSearch && matchesCategory && matchesAccount
  })
}
