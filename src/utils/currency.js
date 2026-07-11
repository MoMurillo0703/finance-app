// Default currency for new users: US English devices (except en-CO) get USD,
// everyone else gets COP.
export function getDefaultCurrency() {
  const lang = navigator.language || ''
  return lang.startsWith('en') && lang !== 'en-CO' ? 'USD' : 'COP'
}

export function getUserCurrency() {
  return localStorage.getItem('currency') || getDefaultCurrency()
}

export function isCOPUser() {
  return getUserCurrency() === 'COP'
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
      maximumFractionDigits: 2,
    }).format(amount || 0)
  }

  // COP: dot-separated thousands, no decimals ($1.234.567)
  return '$' + new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(amount || 0)
}
