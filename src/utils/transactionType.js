export function txTypeLabel(type, t) {
  if (type === 'payment') return t('payment')
  if (type === 'income') return t('income')
  return t('expense')
}

export function txAmountClass(type) {
  if (type === 'income') return 'text-green-500'
  if (type === 'payment') return 'text-blue-600'
  return 'text-red-500'
}

export function txAmountPrefix(type) {
  return type === 'income' ? '+' : '-'
}

export function txBadgeClass(type) {
  if (type === 'income') return 'bg-green-100 text-green-700'
  if (type === 'payment') return 'bg-blue-100 text-blue-700'
  return 'bg-red-100 text-red-700'
}
