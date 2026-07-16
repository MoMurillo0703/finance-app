export function isTransferTransaction(tx) {
  if (!tx) return false
  if (tx.is_transfer === true) return true
  const category = (tx.category || '').toLowerCase()
  return category === 'transfer'
}

export function isSpendingTransaction(tx) {
  return tx?.type === 'expense' && !isTransferTransaction(tx)
}

export function isIncomeTransaction(tx) {
  return tx?.type === 'income' && !isTransferTransaction(tx)
}

export function txTypeLabel(type, t) {
  if (type === 'payment') return t('payment')
  if (type === 'income') return t('income')
  return t('expense')
}

export function txAmountClass(type, tx = null) {
  if (tx && isTransferTransaction(tx)) return 'text-gray-400'
  if (type === 'income') return 'text-green-500'
  if (type === 'payment') return 'text-blue-600'
  return 'text-red-500'
}

export function txAmountPrefix(type, tx = null) {
  if (tx && isTransferTransaction(tx)) return ''
  return type === 'income' ? '+' : '-'
}

export function txBadgeClass(type) {
  if (type === 'income') return 'bg-green-100 text-green-700'
  if (type === 'payment') return 'bg-blue-100 text-blue-700'
  return 'bg-red-100 text-red-700'
}
