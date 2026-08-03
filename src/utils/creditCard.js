export const DEFAULT_CARD_APR = 24.99

/**
 * Effective APR for a card, including intro/promo status.
 * @returns {{ rate: number, isPromo: boolean, promoExpires: Date|null, daysUntilPromoExpires: number|null }}
 */
export function getEffectiveRate(card) {
  const now = new Date()
  const promoActive = card?.intro_rate != null
    && card?.intro_rate_expires
    && new Date(card.intro_rate_expires) > now

  const regularRate = card?.interest_rate != null
    ? Number(card.interest_rate)
    : DEFAULT_CARD_APR
  const promoRate = promoActive ? Number(card.intro_rate) : regularRate
  const rate = Number.isFinite(promoRate) ? promoRate : DEFAULT_CARD_APR

  return {
    rate,
    isPromo: Boolean(promoActive),
    promoExpires: promoActive ? new Date(card.intro_rate_expires) : null,
    daysUntilPromoExpires: promoActive
      ? Math.ceil((new Date(card.intro_rate_expires) - now) / (1000 * 60 * 60 * 24))
      : null,
  }
}

export function isIntroRateActive(card) {
  return getEffectiveRate(card).isPromo
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
  if (balance <= 0) return 0

  const effectiveRate = getEffectiveRate(card).rate
  const monthlyInterest = balance * (effectiveRate / 100 / 12)
  return Math.max(balance * 0.02, 25) + monthlyInterest
}

export function getLastStatementDate(statementDay, asOf = new Date()) {
  const day = Number(statementDay) || 1
  const anchor = new Date(asOf.getFullYear(), asOf.getMonth(), 1)
  if (asOf.getDate() < day) {
    anchor.setMonth(anchor.getMonth() - 1)
  }
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  anchor.setDate(Math.min(day, lastDay))
  return anchor.toISOString().split('T')[0]
}

export function getCardMinimumPayment(card, statements = []) {
  const balance = Number(card?.current_balance) || 0
  if (balance <= 0) {
    return {
      amount: 0,
      confidence: 'none',
      formula: 'zero_balance',
      monthsOfData: statements.length,
    }
  }

  const manual = card?.manual_minimum_payment
  if (manual != null && !Number.isNaN(Number(manual)) && Number(manual) > 0) {
    return {
      amount: Number(manual),
      confidence: 'manual',
      formula: 'manual',
      monthsOfData: statements.length,
    }
  }

  const rate = getEffectiveRate(card).rate
  const monthlyInterest = balance * (rate / 100 / 12)

  if (statements.length >= 3) {
    const formulas = {
      standard: s => Math.max(25, (s.balance * 0.01) + s.interest_charged),
      twopercent: s => Math.max(25, (s.balance * 0.02) + s.interest_charged),
      flatpercent: s => Math.max(25, s.balance * 0.02),
      interestplus: s => Math.max(25, s.interest_charged + (s.balance * 0.01)),
    }

    const scores = Object.entries(formulas).map(([name, fn]) => {
      const avgError = statements.reduce((sum, s) => {
        return sum + Math.abs(fn(s) - Number(s.actual_minimum))
      }, 0) / statements.length
      return { name, avgError, fn }
    })

    const best = scores.sort((a, b) => a.avgError - b.avgError)[0]
    const estimated = best.fn({ balance, interest_charged: monthlyInterest })

    return {
      amount: estimated,
      confidence: best.avgError < 5 ? 'high' : best.avgError < 20 ? 'medium' : 'low',
      formula: best.name,
      monthsOfData: statements.length,
    }
  }

  return {
    amount: Math.max(25, (balance * 0.01) + monthlyInterest),
    confidence: 'estimated',
    formula: 'standard',
    monthsOfData: statements.length,
  }
}

export function getCardMinimumAmount(card, statements = []) {
  return getCardMinimumPayment(card, statements).amount ?? 0
}

export async function syncAutoBillMinimum(supabaseClient, card, statements = []) {
  const { amount } = getCardMinimumPayment(card, statements)
  await supabaseClient
    .from('bills')
    .update({ amount })
    .eq('credit_card_id', card.id)
    .eq('is_auto_card_bill', true)
}
