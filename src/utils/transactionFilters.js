import { getRecategorizeHighlight } from './transactionCategories'

export const TRANSACTION_FILTER_CHIPS = [
  { id: 'all', labelKey: 'all' },
  { id: 'income', labelKey: 'income', match: tx => tx.type === 'income' },
  { id: 'dining', labelKey: 'categoryDining', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'dining' },
  { id: 'groceries', labelKey: 'categoryGroceries', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'groceries' },
  { id: 'transport', labelKey: 'categoryTransport', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'transport' },
  { id: 'utilities', labelKey: 'categoryUtilities', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'utilities' },
  { id: 'subscriptions', labelKey: 'categorySubscriptions', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'subscriptions' },
  { id: 'health', labelKey: 'categoryHealth', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'health' },
  { id: 'shopping', labelKey: 'categoryShopping', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'shopping' },
  { id: 'entertainment', labelKey: 'categoryEntertainment', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'entertainment' },
  { id: 'travel', labelKey: 'categoryTravel', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'travel' },
  { id: 'gas', labelKey: 'categoryGas', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'gas' },
  { id: 'insurance', labelKey: 'categoryInsurance', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'insurance' },
  { id: 'auto', labelKey: 'categoryAuto', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'auto' },
  { id: 'business', labelKey: 'categoryBusiness', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'business' },
  { id: 'personal', labelKey: 'categoryPersonal', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'personal' },
  { id: 'other', labelKey: 'categoryOther', match: tx => tx.type === 'expense' && getRecategorizeHighlight(tx) === 'other' },
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
