export const BUDGET_CATEGORIES = [
  { key: 'transfer', emoji: '↔️' },
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

export const EDIT_EXPENSE_CATEGORIES = [
  ...BUDGET_CATEGORIES,
  { key: 'income', emoji: '💰' },
]

export const RECATEGORIZE_CATEGORIES = [
  'transfer',
  'dining', 'groceries', 'transport', 'utilities', 'subscriptions', 'health',
  'shopping', 'entertainment', 'travel', 'gas', 'insurance', 'auto',
  'business', 'personal', 'interest', 'income', 'other',
]

export const CATEGORY_EMOJIS = {
  transfer: '↔️',
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
  if (tx?.is_transfer || (tx?.category || '').toLowerCase() === 'transfer') return 'transfer'
  if (tx.type === 'income') return 'income'
  if (RECATEGORIZE_CATEGORIES.includes(tx.category)) return tx.category
  return LEGACY_CATEGORY_MAP[tx.category] || 'other'
}

export function getCategoryPickerLabel(key, t) {
  if (key === 'salary') return t('categoryIncome', { defaultValue: 'Income' })
  if (key === 'commission') return t('categoryCommission', { defaultValue: 'Commission' })
  if (key === 'reimbursement') return t('categoryReimbursement', { defaultValue: 'Reimbursement' })
  return t(`category${key.charAt(0).toUpperCase()}${key.slice(1)}`, {
    defaultValue: key.charAt(0).toUpperCase() + key.slice(1),
  })
}
