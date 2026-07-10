export const DEFAULT_CARD_APR = 24.99

export function getCardApr(card) {
  return card?.interest_rate ?? DEFAULT_CARD_APR
}

export function calculateMinimumPayment(card, cuotas = []) {
  const balance = Number(card?.current_balance) || 0
  const apr = getCardApr(card)
  const monthlyRate = apr / 100 / 12
  const monthlyInterest = balance * monthlyRate
  const cuotaCommitment = cuotas.reduce((sum, c) => sum + (Number(c.cuota_amount) || 0), 0)
  const minimumBase = Math.max(balance * 0.02, 25)
  const totalMinimum = minimumBase + monthlyInterest + cuotaCommitment

  let monthsToPayoff = null
  if (balance <= 0) {
    monthsToPayoff = 0
  } else if (minimumBase <= 0) {
    monthsToPayoff = null
  } else if (monthlyRate > 0) {
    const ratio = (monthlyRate * balance) / minimumBase
    if (ratio < 1) {
      monthsToPayoff = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + monthlyRate))
    }
  } else {
    monthsToPayoff = Math.ceil(balance / minimumBase)
  }

  const totalInterestCost = monthsToPayoff != null
    ? Math.max(minimumBase * monthsToPayoff - balance, 0)
    : null

  return {
    apr,
    monthlyRate,
    monthlyInterest,
    cuotaCommitment,
    minimumBase,
    totalMinimum,
    monthsToPayoff,
    totalInterestCost,
    showInterestWarning: monthlyInterest > minimumBase * 0.5,
  }
}
