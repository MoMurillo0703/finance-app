import { getEffectiveRate, getCardMinimumPayment, DEFAULT_CARD_APR } from './creditCard'
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
  return getCardMinimumPayment(card, statements).amount ?? 0
}

function monthsUntilDate(dateValue, today = new Date()) {
  if (!dateValue) return null
  const expires = new Date(dateValue)
  const days = Math.ceil((expires - today) / (1000 * 60 * 60 * 24))
  return Math.ceil(days / 30)
}

/** Active promo purchases that would add deferred interest if unpaid at expiry */
export function hasDeferredInterest(debt) {
  const promos = debt?.promotional_purchases || debt?.promos || debt?.promoDeadlines || []
  return promos.some(p =>
    Number(p.remaining_balance) > 0
    && Number(p.deferred_interest) > 0,
  )
}

export function getDebtRateInfo(debt) {
  if (debt?.rateInfo) return debt.rateInfo
  if (debt?.type === 'loan') {
    return {
      rate: Number(debt.apr) || 0,
      isPromo: false,
      promoExpires: null,
      daysUntilPromoExpires: null,
    }
  }
  return getEffectiveRate(debt)
}

/** 0% intro with no deferred-interest cliff — pay minimum only */
export function isTrue0PromoDebt(debt) {
  const info = getDebtRateInfo(debt)
  return Boolean(info.isPromo && Number(info.rate) === 0 && !hasDeferredInterest(debt))
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
      const promos = promotionalPurchases
        .filter(p => p.credit_card_id === c.id && p.is_active !== false && Number(p.remaining_balance) > 0)
        .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))
      const rateInfo = getEffectiveRate(c)
      const regularRate = c.interest_rate != null ? Number(c.interest_rate) : DEFAULT_CARD_APR

      return {
        id: c.id,
        name: c.name,
        nickname: c.nickname,
        balance: Number(c.current_balance),
        originalBalance: Number(c.current_balance),
        minPayment: resolveCardMinimum(c, statements),
        apr: rateInfo.rate,
        interest_rate: Number.isFinite(regularRate) ? regularRate : DEFAULT_CARD_APR,
        intro_rate: c.intro_rate,
        intro_rate_expires: c.intro_rate_expires,
        rateInfo,
        type: 'card',
        introRateExpires: rateInfo.isPromo ? c.intro_rate_expires : null,
        promoDeadlines: promos,
        promos,
        promotional_purchases: promos,
      }
    })

  const loanDebts = loans
    .filter(l => l.is_active && Number(l.current_balance) > 0)
    .map(l => {
      const apr = Number(l.interest_rate) || 0
      const rateInfo = {
        rate: apr,
        isPromo: false,
        promoExpires: null,
        daysUntilPromoExpires: null,
      }
      return {
        id: l.id,
        name: l.name,
        balance: Number(l.current_balance),
        originalBalance: Number(l.current_balance),
        minPayment: Number(l.monthly_payment) || 0,
        apr,
        interest_rate: apr,
        rateInfo,
        type: 'loan',
        introRateExpires: null,
        promoDeadlines: [],
        promos: [],
        promotional_purchases: [],
      }
    })

  return [...cards, ...loanDebts]
}

export function hasUpcomingPromoDeadlines(debts, withinMonths = 12) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() + withinMonths)
  const now = new Date()
  return debts.some(d => {
    if (hasDeferredInterest(d)) {
      return d.promoDeadlines?.some(p => {
        const expires = new Date(p.expiration_date)
        return expires <= cutoff && expires >= now && Number(p.deferred_interest) > 0
      })
    }
    if (d.introRateExpires) {
      const expires = new Date(d.introRateExpires)
      if (expires <= cutoff && expires >= now) return true
    }
    return false
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
  if (hasDeferredInterest(debt)) {
    for (const p of debt.promoDeadlines || []) {
      if (Number(p.deferred_interest) > 0 && p.expiration_date) {
        dates.push(new Date(p.expiration_date))
      }
    }
  }
  if (dates.length === 0 && debt.introRateExpires) {
    dates.push(new Date(debt.introRateExpires))
  }
  if (dates.length === 0) return FAR_FUTURE
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

function sortAvalanche(debts) {
  return [...debts].sort((a, b) => {
    const aTrue0 = isTrue0PromoDebt(a)
    const bTrue0 = isTrue0PromoDebt(b)
    if (aTrue0 && !bTrue0) return 1
    if (!aTrue0 && bTrue0) return -1
    return getDebtRateInfo(b).rate - getDebtRateInfo(a).rate
  })
}

function sortSnowball(debts) {
  return [...debts].sort((a, b) => {
    const aTrue0 = isTrue0PromoDebt(a)
    const bTrue0 = isTrue0PromoDebt(b)
    if (aTrue0 && !bTrue0) return 1
    if (!aTrue0 && bTrue0) return -1
    return a.balance - b.balance
  })
}

function sortDeadlineFirst(debts) {
  return [...debts].sort((a, b) => {
    const aInfo = getDebtRateInfo(a)
    const bInfo = getDebtRateInfo(b)
    const aHasDeferred = hasDeferredInterest(a)
    const bHasDeferred = hasDeferredInterest(b)
    const aTrue0 = isTrue0PromoDebt(a)
    const bTrue0 = isTrue0PromoDebt(b)

    // Deferred interest promos first
    if (aHasDeferred && !bHasDeferred) return -1
    if (!aHasDeferred && bHasDeferred) return 1

    // Both deferred: soonest expiry first
    if (aHasDeferred && bHasDeferred) {
      const diff = getDebtDeadline(a) - getDebtDeadline(b)
      if (diff !== 0) return diff
    }

    // True 0% last
    if (aTrue0 && !bTrue0) return 1
    if (!aTrue0 && bTrue0) return -1

    return bInfo.rate - aInfo.rate
  })
}

export function sortDebtsByStrategy(debts, strategy) {
  if (strategy === 'deadline') return sortDeadlineFirst(debts)
  if (strategy === 'avalanche') return sortAvalanche(debts)
  return sortSnowball(debts)
}

function buildPromoEvents(debt, today = new Date()) {
  return (debt.promos || debt.promoDeadlines || []).map(p => ({
    ...p,
    monthsUntilExpiry: monthsUntilDate(p.expiration_date, today) ?? 0,
    fired: false,
    wasTriggered: false,
  }))
}

function rateForMonth(debt, monthsFromNow) {
  const info = getDebtRateInfo(debt)
  const regular = Number(debt.interest_rate)
  const fallback = Number.isFinite(regular) ? regular : (Number(debt.apr) || 0)

  if (!info.isPromo) return fallback

  const promoMonthsLeft = info.daysUntilPromoExpires != null
    ? Math.ceil(info.daysUntilPromoExpires / 30)
    : 0

  if (monthsFromNow <= promoMonthsLeft) return Number(info.rate) || 0
  return fallback
}

/**
 * Month-by-month waterfall simulation with promo rates + deferred interest cliffs.
 */
export function simulateDebtPayoff(debts, strategy, extraPayment = 0, maxMonths = 600) {
  const today = new Date()
  const order = sortDebtsByStrategy(debts, strategy)
  const state = order.map(d => ({
    id: d.id,
    debt: d,
    apr: d.apr,
    interest_rate: d.interest_rate,
    rateInfo: getDebtRateInfo(d),
    isTrue0: isTrue0PromoDebt(d),
    minPayment: Math.max(0, d.minPayment || 0),
    originalBalance: d.originalBalance ?? d.balance,
    remaining: d.balance,
    paidInterest: 0,
    paidPrincipal: 0,
    payoffMonth: null,
    peakMonthlyPayment: 0,
    promoEvents: buildPromoEvents(d, today),
  }))

  let month = 0
  let deferredInterestHits = 0
  const baseExtra = Math.max(0, extraPayment)

  while (month < maxMonths && state.some(d => d.remaining > 0.01)) {
    month += 1
    const monthPayments = Object.fromEntries(state.map(d => [d.id, 0]))

    // 1. Deferred interest deadlines
    for (const debt of state) {
      for (const event of debt.promoEvents) {
        if (event.fired) continue
        const dueMonth = Math.max(1, event.monthsUntilExpiry || 0)
        if (month < dueMonth) continue

        const promoRemaining = Math.min(Number(event.remaining_balance) || 0, debt.remaining)
        if (promoRemaining > 0.01) {
          const hit = Number(event.deferred_interest) || 0
          debt.remaining += hit
          debt.paidInterest += hit
          deferredInterestHits += hit
          event.wasTriggered = true
        } else {
          event.wasTriggered = false
        }
        event.fired = true
      }
    }

    // 2. Monthly interest at effective rate
    for (const debt of state) {
      if (debt.remaining <= 0.01) continue
      const currentRate = rateForMonth(debt.debt, month)
      const interest = debt.remaining * (currentRate / 100 / 12)
      debt.paidInterest += interest
      debt.remaining += interest
    }

    // 3. Minimums + freed mins for attack budget
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

    // 4. Extra — skip true 0% first, then spill to them
    const applyExtra = (predicate) => {
      while (attackBudget > 0.01) {
        const focus = state.find(d => d.remaining > 0.01 && predicate(d))
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
    }

    applyExtra(d => !d.isTrue0)
    applyExtra(() => true)

    for (const debt of state) {
      debt.peakMonthlyPayment = Math.max(debt.peakMonthlyPayment, monthPayments[debt.id])
    }
  }

  // Deadlines never reached because debt cleared earlier → safe
  for (const debt of state) {
    for (const event of debt.promoEvents) {
      if (!event.fired) {
        event.fired = true
        event.wasTriggered = false
      }
    }
  }

  const allPromoEvents = state.flatMap(d => d.promoEvents)

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
      rateInfo: getDebtRateInfo(debt),
      isTrue0: isTrue0PromoDebt(debt),
      hasDeferred: hasDeferredInterest(debt),
      payoffMonths,
      payoffDate: payoffMonths ? addMonths(today, payoffMonths) : null,
      totalInterest: sim.paidInterest,
      monthlyPayment: sim.peakMonthlyPayment || debt.minPayment,
      paidSoFar,
      progressPct,
      soonestPromo: soonestPromo(debt.promoDeadlines),
      promoEvents: sim.promoEvents,
    }
  })

  const maxPayoffMonths = plan.reduce(
    (max, d) => Math.max(max, d.payoffMonths ?? 0),
    0,
  )
  const totalInterestPaid = plan.reduce((sum, d) => sum + (d.totalInterest || 0), 0)
  const debtFreeDate = maxPayoffMonths > 0 ? addMonths(today, maxPayoffMonths) : null

  return {
    plan,
    maxPayoffMonths,
    totalInterestPaid,
    debtFreeDate,
    deferredInterestHits,
    promoEvents: allPromoEvents,
  }
}

/** Binary search: minimum extra $/mo that avoids all deferred interest cliffs */
export function findMinimumExtraToAvoidDeferred(debts, strategy = 'deadline', maxExtra = 5000) {
  const baseline = simulateDebtPayoff(debts, strategy, 0)
  if ((baseline.deferredInterestHits || 0) <= 0) return 0

  let low = 0
  let high = maxExtra
  while (high - low > 5) {
    const mid = Math.floor((low + high) / 2)
    const test = simulateDebtPayoff(debts, strategy, mid)
    if ((test.deferredInterestHits || 0) <= 0) high = mid
    else low = mid
  }
  return high
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
  debts = [],
  formatMoney,
  formatPayoffMonthLong,
  t,
  locale,
}) {
  const true0 = (debts || []).filter(isTrue0PromoDebt)
  if (true0.length > 0) {
    const names = true0.map(c => c.nickname || c.name).join(', ')
    return t('insightTrue0Promo', {
      names,
      verb: true0.length > 1 ? t('are') : t('is'),
    })
  }

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
