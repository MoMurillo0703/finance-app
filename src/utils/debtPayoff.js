import { getEffectiveRate, getCardMinimumAmount } from './creditCard'
import { getMonthBounds, getRecentMonthKeys } from './reports'

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

function soonestPromo(promos = []) {
  return [...promos]
    .filter(p => p?.expiration_date && (p.remaining_balance || 0) > 0)
    .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))[0] || null
}

export function buildDebtList({ creditCards = [], loans = [], statementsByCard = {}, promotionalPurchases = [] }) {
  const cards = creditCards
    .filter(c => c.is_active && (c.current_balance || 0) > 0)
    .map(c => {
      const promoDeadlines = promotionalPurchases
        .filter(p => p.credit_card_id === c.id && p.is_active && (p.remaining_balance || 0) > 0)
        .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))

      return {
        id: c.id,
        name: c.name,
        balance: Number(c.current_balance) || 0,
        minPayment: getCardMinimumAmount(c, statementsByCard[c.id] || []),
        apr: getEffectiveRate(c),
        type: 'card',
        promoDeadlines,
      }
    })

  const loanDebts = loans
    .filter(l => l.is_active && (l.current_balance || 0) > 0)
    .map(l => ({
      id: l.id,
      name: l.name,
      balance: Number(l.current_balance) || 0,
      minPayment: Number(l.monthly_payment) || 0,
      apr: Number(l.interest_rate) || 0,
      type: 'loan',
      promoDeadlines: [],
    }))

  return [...cards, ...loanDebts]
}

export function hasUpcomingPromoDeadlines(debts, withinMonths = 12) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() + withinMonths)
  return debts.some(d =>
    d.promoDeadlines?.some(p => {
      const expires = new Date(p.expiration_date)
      return expires <= cutoff && expires >= new Date()
    }),
  )
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
        tx.type === 'income'
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
        tx.type === 'expense'
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

export function sortDebtsByStrategy(debts, strategy) {
  const sorted = [...debts]

  if (strategy === 'deadline') {
    sorted.sort((a, b) => {
      const aDeadline = soonestPromo(a.promoDeadlines)?.expiration_date
      const bDeadline = soonestPromo(b.promoDeadlines)?.expiration_date
      if (aDeadline && !bDeadline) return -1
      if (!aDeadline && bDeadline) return 1
      if (aDeadline && bDeadline) return new Date(aDeadline) - new Date(bDeadline)
      return b.apr - a.apr
    })
  } else if (strategy === 'avalanche') {
    sorted.sort((a, b) => b.apr - a.apr)
  } else {
    sorted.sort((a, b) => a.balance - b.balance)
  }

  return sorted
}

function monthsToPayoff(balance, apr, payment) {
  if (balance <= 0) return 0
  if (payment <= 0) return Infinity

  const monthlyRate = apr / 100 / 12
  if (monthlyRate === 0) return Math.ceil(balance / payment)

  if (payment <= monthlyRate * balance) return Infinity

  return Math.ceil(
    Math.log(payment / (payment - monthlyRate * balance)) / Math.log(1 + monthlyRate),
  )
}

function interestForPayoff(balance, apr, payment, months) {
  if (!Number.isFinite(months) || months <= 0) return 0
  return Math.max(0, payment * months - balance)
}

/**
 * Approximate ordered plan for UI cards (extra goes to priority #1).
 * For accurate totals, use simulateDebtPayoff.
 */
export function getPayoffOrder(debts, strategy, extraPayment = 0) {
  const sorted = sortDebtsByStrategy(debts, strategy)
  const remainingExtra = Math.max(0, extraPayment)

  return sorted.map((debt, i) => {
    const payment = Math.max(debt.minPayment, 0) + (i === 0 ? remainingExtra : 0)
    const months = monthsToPayoff(debt.balance, debt.apr, payment)
    const totalInterest = interestForPayoff(debt.balance, debt.apr, payment, months)

    return {
      ...debt,
      payoffMonths: Number.isFinite(months) ? months : null,
      totalInterest: Number.isFinite(totalInterest) ? totalInterest : 0,
      monthlyPayment: payment,
      soonestPromo: soonestPromo(debt.promoDeadlines),
    }
  })
}

/**
 * Month-by-month avalanche/snowball simulation with payment rolling.
 * Pays minimums on all debts; puts extra (+ freed mins) on the current focus debt.
 */
export function simulateDebtPayoff(debts, strategy, extraPayment = 0, maxMonths = 600) {
  const order = sortDebtsByStrategy(debts, strategy)
  const state = order.map(d => ({
    id: d.id,
    apr: d.apr,
    minPayment: Math.max(0, d.minPayment || 0),
    remaining: d.balance,
    paidInterest: 0,
    payoffMonth: null,
  }))

  let month = 0
  const baseExtra = Math.max(0, extraPayment)

  while (month < maxMonths && state.some(d => d.remaining > 0.01)) {
    month += 1

    // Accrue interest
    for (const debt of state) {
      if (debt.remaining <= 0.01) continue
      const interest = debt.remaining * (debt.apr / 100 / 12)
      debt.paidInterest += interest
      debt.remaining += interest
    }

    // Freed minimums from already-paid debts roll into the attack payment
    const freedMins = state
      .filter(d => d.remaining <= 0.01)
      .reduce((sum, d) => sum + d.minPayment, 0)
    let attackBudget = baseExtra + freedMins

    // Pay minimums first
    for (const debt of state) {
      if (debt.remaining <= 0.01) continue
      const payment = Math.min(debt.minPayment, debt.remaining)
      debt.remaining -= payment
      if (debt.remaining <= 0.01) {
        attackBudget += Math.max(0, debt.minPayment - payment)
        debt.remaining = 0
        debt.payoffMonth = month
      }
    }

    // Put remaining attack budget on highest-priority unpaid debt
    while (attackBudget > 0.01) {
      const focus = state.find(d => d.remaining > 0.01)
      if (!focus) break
      const payment = Math.min(attackBudget, focus.remaining)
      focus.remaining -= payment
      attackBudget -= payment
      if (focus.remaining <= 0.01) {
        focus.remaining = 0
        focus.payoffMonth = month
      }
    }
  }

  const plan = order.map((debt, i) => {
    const sim = state[i]
    return {
      ...debt,
      payoffMonths: sim.payoffMonth,
      totalInterest: sim.paidInterest,
      monthlyPayment: debt.minPayment + (i === 0 ? baseExtra : 0),
      soonestPromo: soonestPromo(debt.promoDeadlines),
    }
  })

  const maxPayoffMonths = plan.reduce(
    (max, d) => Math.max(max, d.payoffMonths ?? 0),
    0,
  )
  const totalInterestPaid = plan.reduce((sum, d) => sum + (d.totalInterest || 0), 0)

  return { plan, maxPayoffMonths, totalInterestPaid }
}

export function calculateInterestSaved(debts, strategy, extraPayment) {
  const withExtra = simulateDebtPayoff(debts, strategy, extraPayment)
  const minsOnly = simulateDebtPayoff(debts, strategy, 0)
  const interestSaved = Math.max(0, minsOnly.totalInterestPaid - withExtra.totalInterestPaid)
  return { withExtra, minsOnly, interestSaved }
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

  const debtFreeDate = new Date()
  debtFreeDate.setMonth(debtFreeDate.getMonth() + maxMonths)
  const dateLabel = debtFreeDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

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
