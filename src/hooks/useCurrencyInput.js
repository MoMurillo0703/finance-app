import { useState } from 'react'
import { getUserCurrency } from '../utils/currency'

export function useCurrencyInput(initialValue = '') {
  const currency = getUserCurrency()
  const [raw, setRaw] = useState(initialValue ? String(initialValue) : '')

  const handleChange = (e) => {
    let val = e.target.value

    if (currency === 'COP') {
      val = val.replace(/\D/g, '')
    } else {
      val = val.replace(/[^\d.]/g, '')
      const parts = val.split('.')
      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
      if (parts[1]?.length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
    }

    setRaw(val)
  }

  const displayValue = (() => {
    if (!raw) return ''
    const [intPart, decPart] = raw.split('.')
    const formatted = currency === 'COP'
      ? Number(intPart || 0).toLocaleString('es-CO')
      : Number(intPart || 0).toLocaleString('en-US')
    if (decPart !== undefined) return formatted + '.' + decPart
    if (raw.endsWith('.')) return formatted + '.'
    return formatted
  })()

  const numericValue = parseFloat(raw) || 0

  const reset = (val = '') => setRaw(val ? String(val) : '')

  return { displayValue, numericValue, handleChange, reset, currency, raw }
}

export function currencyAmountPlaceholder(currency) {
  return currency === 'COP' ? '0' : '0.00'
}

export function sanitizeCurrencyRaw(val, currency = getUserCurrency()) {
  if (currency === 'COP') {
    return val.replace(/\D/g, '')
  }

  let cleaned = val.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('')
  if (parts[1]?.length > 2) cleaned = parts[0] + '.' + parts[1].slice(0, 2)
  return cleaned
}

export function formatCurrencyRaw(raw, currency = getUserCurrency()) {
  if (!raw) return ''
  const [intPart, decPart] = raw.split('.')
  const formatted = currency === 'COP'
    ? Number(intPart || 0).toLocaleString('es-CO')
    : Number(intPart || 0).toLocaleString('en-US')
  if (decPart !== undefined) return formatted + '.' + decPart
  if (raw.endsWith('.')) return formatted + '.'
  return formatted
}

export function parseCurrencyRaw(raw) {
  return parseFloat(raw) || 0
}
