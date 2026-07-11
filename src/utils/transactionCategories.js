export const BUDGET_CATEGORIES = [
  { key: 'dining', emoji: '🍽️' },
  { key: 'groceries', emoji: '🛒' },
  { key: 'transport', emoji: '🚌' },
  { key: 'utilities', emoji: '💡' },
  { key: 'subscriptions', emoji: '📱' },
  { key: 'health', emoji: '🏥' },
  { key: 'shopping', emoji: '🛍️' },
  { key: 'entertainment', emoji: '🎬' },
  { key: 'travel', emoji: '✈️' },
  { key: 'gas', emoji: '⛽' },
  { key: 'insurance', emoji: '🛡️' },
  { key: 'auto', emoji: '🚗' },
  { key: 'business', emoji: '💼' },
  { key: 'personal', emoji: '👤' },
  { key: 'other', emoji: '📦' },
]

export const BUDGET_CATEGORY_KEYS = BUDGET_CATEGORIES.map(c => c.key)

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
