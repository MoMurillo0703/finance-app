import { getEffectiveRate, getCardMinimumPayment, isIntroRateActive } from './creditCard'
import { getMonthBounds, getRecentMonthKeys } from './reports'
import { isSpendingTransaction, isIncomeTransaction } from './transactionType'

export const PAYOFF_STRATEGIES = [
  {
    key: 'deadline',
    emoji: '🚨',
    labelKey: 'deadlineFirst',
    descriptionKey: 'deadlineFirstDesc',
  },
  {
    key: 'avalanche',
    emoji: '🏔️',
    labelKey: 'avalanche',
    descriptionKey: 'avalancheDesc',
  },
  {
    key: 'snowball',
    emoji: '⛄',
    labelKey: 'snowball',
    descriptionKey: 'snowballDesc',
  },
]

const FAR_FUTURE = new Date('2099-01-01')

export function addMonths(date, months) {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

export function formatPayoffMonth(date, locale = 'en-US') {
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
}

export function formatPayoffMonthLong(date, locale = 'en-US') {
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

function soonestPromo(promos = []) {
  return [...promos]
    .filter(p => p?.expiration_date && (p.remaining_balance || 0) > 0)
    .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))[0] || null
}

function resolveCardMinimum(card, statements = []) {
  const { amount: computed } = getCardMinimumPayment(card, statements)
  const manual = card?.manual_minimum_payment
  if (manual != null && !Number.isNaN(Number(manual))) {
    return Math.max(computed, Number(manual))
  }
  return computed
}

export function buildDebtList({
  creditCards = [],
  loans = [],
  statementsByCard = {},
  promotionalPurchases = [],
}) {
  const cards = creditCards
    .filter(c => c.is_active && Number(c.current_balance) > 0)
    .map(c => {
      const statements = statementsByCard[c.id] || []
      const promoDeadlines = promotionalPurchases
        .filter(p => p.credit_card_id === c.id && p.is_active && Number(p.remaining_balance) > 0)
        .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))

      return {
        id: c.id,
        name: c.name,
        balance: Number(c.current_balance),
        originalBalance: Number(c.current_balance),
        minPayment: resolveCardMinimum(c, statements),
        apr: getEffectiveRate(c),
        type: 'card',
        introRateExpires: isIntroRateActive(c) ? c.intro_rate_expires : null,
        promoDeadlines,
      }
    })

  const loanDebts = loans
    .filter(l => l.is_active && Number(l.current_balance) > 0)
    .map(l => ({
      id: l.id,
      name: l.name,
      balance: Number(l.current_balance),
      originalBalance: Number(l.current_balance),
      minPayment: Number(l.monthly_payment) || 0,
      apr: Number(l.interest_rate) || 0,
      type: 'loan',
      introRateExpires: null,
      promoDeadlines: [],
    }))

  return [...cards, ...loanDebts]
}

export function hasUpcomingPromoDeadlines(debts, withinMonths = 12) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() + withinMonths)
  const now = new Date()
  return debts.some(d => {
    if (d.introRateExpires) {
      const expires = new Date(d.introRateExpires)
      if (expires <= cutoff && expires >= now) return true
    }
    return d.promoDeadlines?.some(p => {
      const expires = new Date(p.expiration_date)
      return expires <= cutoff && expires >= now
    })
  })
}

export function averageMonthlyTotals(transactions = [], monthKeys = getRecentMonthKeys(3)) {
  if (monthKeys.length === 0) {
    return { avgMonthlyIncome: 0, avgMonthlyExpenses: 0 }
  }

  const incomeTotals = monthKeys.map(key => {
    const [y, m] = key.split('-').map(Number)
    const { firstDay, lastDay } = getMonthBounds(y, m)
    return transactions
      .filter(tx =>
        isIncomeTransaction(tx)
        && tx.transaction_date >= firstDay
        && tx.transaction_date <= lastDay,
      )
      .reduce((sum, tx) => sum + (tx.amount || 0), 0)
  })

  const expenseTotals = monthKeys.map(key => {
    const [y, m] = key.split('-').map(Number)
    const { firstDay, lastDay } = getMonthBounds(y, m)
    return transactions
      .filter(tx =>
        isSpendingTransaction(tx)
        && tx.transaction_date >= firstDay
        && tx.transaction_date <= lastDay,
      )
      .reduce((sum, tx) => sum + (tx.amount || 0), 0)
  })

  const incomeMonths = incomeTotals.filter(v => v > 0).length || 1
  const expenseMonths = expenseTotals.filter(v => v > 0).length || monthKeys.length

  return {
    avgMonthlyIncome: incomeTotals.reduce((s, v) => s + v, 0) / incomeMonths,
    avgMonthlyExpenses: expenseTotals.reduce((s, v) => s + v, 0) / expenseMonths,
  }
}

function getDebtDeadline(debt) {
  const dates = []
  if (debt.introRateExpires) {
    dates.push(new Date(debt.introRateExpires))
  }
  const promo = soonestPromo(debt.promoDeadlines)
  if (promo?.expiration_date) {
    dates.push(new Date(promo.expiration_date))
  }
  if (dates.length === 0) return FAR_FUTURE
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

export function sortDebtsByStrategy(debts, strategy) {
  const sorted = [...debts]

  if (strategy === 'deadline') {
    sorted.sort((a, b) => {
      const diff = getDebtDeadline(a) - getDebtDeadline(b)
      if (diff !== 0) return diff
      return b.apr - a.apr
    })
  } else if (strategy === 'avalanche') {
    sorted.sort((a, b) => b.apr - a.apr)
  } else {
    sorted.sort((a, b) => a.balance - b.balance)
  }

  return sorted
}

/**
 * Month-by-month waterfall simulation.
 * Pays minimums on all debts; rolls extra (+ freed mins) onto the current focus debt.
 */
export function simulateDebtPayoff(debts, strategy, extraPayment = 0, maxMonths = 600) {
  const order = sortDebtsByStrategy(debts, strategy)
  const state = order.map(d => ({
    id: d.id,
    apr: d.apr,
    minPayment: Math.max(0, d.minPayment || 0),
    originalBalance: d.originalBalance ?? d.balance,
    remaining: d.balance,
    paidInterest: 0,
    paidPrincipal: 0,
    payoffMonth: null,
    peakMonthlyPayment: 0,
  }))

  const paymentByDebt = Object.fromEntries(state.map(d => [d.id, 0]))

  let month = 0
  const baseExtra = Math.max(0, extraPayment)

  while (month < maxMonths && state.some(d => d.remaining > 0.01)) {
    month += 1
    const monthPayments = Object.fromEntries(state.map(d => [d.id, 0]))

    for (const debt of state) {
      if (debt.remaining <= 0.01) continue
      const interest = debt.remaining * (debt.apr / 100 / 12)
      debt.paidInterest += interest
      debt.remaining += interest
    }

    const freedMins = state
      .filter(d => d.remaining <= 0.01)
      .reduce((sum, d) => sum + d.minPayment, 0)
    let attackBudget = baseExtra + freedMins

    for (const debt of state) {
      if (debt.remaining <= 0.01) continue
      const payment = Math.min(debt.minPayment, debt.remaining)
      debt.remaining -= payment
      debt.paidPrincipal += payment
      monthPayments[debt.id] += payment
      if (debt.remaining <= 0.01) {
        attackBudget += Math.max(0, debt.minPayment - payment)
        debt.remaining = 0
        if (!debt.payoffMonth) debt.payoffMonth = month
      }
    }

    while (attackBudget > 0.01) {
      const focus = state.find(d => d.remaining > 0.01)
      if (!focus) break
      const payment = Math.min(attackBudget, focus.remaining)
      focus.remaining -= payment
      focus.paidPrincipal += payment
      monthPayments[focus.id] += payment
      attackBudget -= payment
      if (focus.remaining <= 0.01) {
        focus.remaining = 0
        if (!focus.payoffMonth) focus.payoffMonth = month
      }
    }

    for (const debt of state) {
      debt.peakMonthlyPayment = Math.max(debt.peakMonthlyPayment, monthPayments[debt.id])
    }
  }

  const now = new Date()
  const plan = order.map((debt, i) => {
    const sim = state[i]
    const payoffMonths = sim.payoffMonth
    const original = sim.originalBalance || debt.balance
    const paidSoFar = payoffMonths
      ? original
      : Math.max(0, original - Math.min(sim.remaining, original))
    const progressPct = payoffMonths
      ? 100
      : original > 0
        ? Math.max(0, Math.min(99, (paidSoFar / original) * 100))
        : 0

    return {
      ...debt,
      payoffMonths,
      payoffDate: payoffMonths ? addMonths(now, payoffMonths) : null,
      totalInterest: sim.paidInterest,
      monthlyPayment: sim.peakMonthlyPayment || debt.minPayment,
      paidSoFar,
      progressPct,
      soonestPromo: soonestPromo(debt.promoDeadlines),
    }
  })

  const maxPayoffMonths = plan.reduce(
    (max, d) => Math.max(max, d.payoffMonths ?? 0),
    0,
  )
  const totalInterestPaid = plan.reduce((sum, d) => sum + (d.totalInterest || 0), 0)
  const debtFreeDate = maxPayoffMonths > 0 ? addMonths(now, maxPayoffMonths) : null

  return { plan, maxPayoffMonths, totalInterestPaid, debtFreeDate }
}

export function calculateInterestSaved(debts, strategy, extraPayment) {
  const withExtra = simulateDebtPayoff(debts, strategy, extraPayment)
  const minsOnly = simulateDebtPayoff(debts, strategy, 0)
  const interestSaved = Math.max(0, minsOnly.totalInterestPaid - withExtra.totalInterestPaid)
  return { withExtra, minsOnly, interestSaved }
}

export function monthsSoonerWithExtra(debts, strategy, extraPayment) {
  if (extraPayment <= 0 || debts.length === 0) return 0
  const withExtra = simulateDebtPayoff(debts, strategy, extraPayment)
  const minsOnly = simulateDebtPayoff(debts, strategy, 0)
  return Math.max(0, minsOnly.maxPayoffMonths - withExtra.maxPayoffMonths)
}

export function buildStrategyInsight({
  strategy,
  interestSaved,
  firstDebtPayoffDate,
  formatMoney,
  formatPayoffMonthLong,
  t,
  locale,
}) {
  if (strategy === 'avalanche') {
    return t('insightAvalanche', { saved: formatMoney(interestSaved) })
  }
  if (strategy === 'snowball') {
    const date = firstDebtPayoffDate
      ? formatPayoffMonthLong(firstDebtPayoffDate, locale)
      : t('soon')
    return t('insightSnowball', { date })
  }
  return t('insightDeadline')
}

export function buildPayoffInsight({
  availableForDebt,
  extraPayment,
  maxMonths,
  interestSaved,
  totalInterestPaid,
  interestSavedWith100,
  formatMoney,
  t,
  locale = 'en-US',
}) {
  if (!maxMonths || maxMonths <= 0) {
    return t('payoffInsightNoDebt')
  }

  const debtFreeDate = addMonths(new Date(), maxMonths)
  const dateLabel = formatPayoffMonthLong(debtFreeDate, locale)

  if (extraPayment > 0 && availableForDebt > 0) {
    return t('payoffInsightExtra', {
      extra: formatMoney(extraPayment),
      date: dateLabel,
      saved: formatMoney(interestSaved),
    })
  }

  return t('payoffInsightMinimums', {
    months: maxMonths,
    interest: formatMoney(totalInterestPaid),
    extraExample: formatMoney(100),
    savedExample: formatMoney(interestSavedWith100),
  })
}
