export const DEFAULT_CARD_APR = 24.99

export function getEffectiveRate(card) {
  if (
    card?.intro_rate != null
    && card?.intro_rate_expires
    && new Date(card.intro_rate_expires) > new Date()
  ) {
    return Number(card.intro_rate)
  }
  return card?.interest_rate ?? DEFAULT_CARD_APR
}

export function isIntroRateActive(card) {
  return Boolean(
    card?.intro_rate != null
    && card?.intro_rate_expires
    && new Date(card.intro_rate_expires) > new Date(),
  )
}

export function getIntroRateDaysLeft(card) {
  if (!card?.intro_rate_expires) return null
  const expires = new Date(card.intro_rate_expires)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  expires.setHours(0, 0, 0, 0)
  const diff = Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : null
}

export function isIntroRateExpiringSoon(card, withinDays = 30) {
  const daysLeft = getIntroRateDaysLeft(card)
  return daysLeft != null && daysLeft <= withinDays
}

function dateWithDay(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const clampedDay = Math.min(Number(day) || 1, lastDay)
  return new Date(year, month, clampedDay)
}

export function getBillingCycleStart(statementDay, asOf = new Date()) {
  const day = Number(statementDay) || 1
  const year = asOf.getFullYear()
  const month = asOf.getMonth()

  if (asOf.getDate() >= day) {
    return dateWithDay(year, month, day).toISOString().split('T')[0]
  }

  return dateWithDay(year, month - 1, day).toISOString().split('T')[0]
}

export function calculateAutoBillMinimum(card) {
  const balance = Number(card?.current_balance) || 0
  const effectiveRate = getEffectiveRate(card)
  const monthlyInterest = balance * (effectiveRate / 100 / 12)
  return Math.max(balance * 0.02, 25) + monthlyInterest
}

export function getCardMinimumPayment(card) {
  if (card?.manual_minimum_payment != null && !Number.isNaN(Number(card.manual_minimum_payment))) {
    return Number(card.manual_minimum_payment)
  }
  return calculateAutoBillMinimum(card)
}
