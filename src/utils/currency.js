export function getDefaultCurrency() {
  const lang = navigator.language || 'en-US'
  if (lang.includes('MX')) return 'MXN'
  if (lang.includes('GT')) return 'GTQ'
  if (lang.includes('CO')) return 'COP'
  return 'USD'
}

export function getUserCurrency() {
  return localStorage.getItem('currency') || getDefaultCurrency()
}

export function isCOPUser() {
  return getUserCurrency() === 'COP'
}

export function isLatAmUser() {
  return ['COP', 'MXN', 'GTQ'].includes(getUserCurrency())
}

export const PREFS_CHANGED = 'lala:prefs-changed'

export function notifyPrefsChanged() {
  window.dispatchEvent(new Event(PREFS_CHANGED))
}

export function formatMoney(amount, currency = getUserCurrency()) {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount || 0)
  }
  if (currency === 'MXN') {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(amount || 0)
  }
  if (currency === 'GTQ') {
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ',
      minimumFractionDigits: 2,
    }).format(amount || 0)
  }
  // COP
  return '$' + new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(amount || 0)
}
