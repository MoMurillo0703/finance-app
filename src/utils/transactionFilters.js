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

export function filterTransactions(transactions, { search = '', categoryFilter = 'all' } = {}) {
  let result = transactions

  const query = search.trim().toLowerCase()
  if (query) {
    result = result.filter(tx => (tx.description || '').toLowerCase().includes(query))
  }

  if (categoryFilter !== 'all') {
    const chip = TRANSACTION_FILTER_CHIPS.find(c => c.id === categoryFilter)
    if (chip?.match) {
      result = result.filter(chip.match)
    }
  }

  return result
}
