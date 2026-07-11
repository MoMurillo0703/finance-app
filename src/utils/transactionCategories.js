export const RECATEGORIZE_CATEGORIES = [
  'dining', 'groceries', 'transport', 'utilities', 'subscriptions', 'health',
  'shopping', 'entertainment', 'travel', 'gas', 'insurance', 'auto',
  'business', 'personal', 'interest', 'income', 'other',
]

export const CATEGORY_EMOJIS = {
  dining: '🍽️',
  groceries: '🛒',
  transport: '🚌',
  utilities: '💡',
  subscriptions: '📱',
  health: '🏥',
  shopping: '🛍️',
  entertainment: '🎬',
  travel: '✈️',
  gas: '⛽',
  insurance: '🛡️',
  auto: '🚗',
  business: '💼',
  personal: '👤',
  interest: '💸',
  income: '💰',
  other: '📦',
}

const LEGACY_CATEGORY_MAP = {
  food: 'dining',
  fun: 'entertainment',
  essential: 'groceries',
  bills: 'utilities',
  debt: 'other',
  weeklyLiving: 'other',
  emergency: 'other',
  salary: 'income',
  commission: 'income',
  reimbursement: 'income',
  loan: 'other',
}

export function getRecategorizeHighlight(tx) {
  if (tx.type === 'income') return 'income'
  if (RECATEGORIZE_CATEGORIES.includes(tx.category)) return tx.category
  return LEGACY_CATEGORY_MAP[tx.category] || 'other'
}
