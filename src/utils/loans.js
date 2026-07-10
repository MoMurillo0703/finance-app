export const LOAN_EMOJI = {
  auto: '🚗',
  mortgage: '🏠',
  personal: '💵',
  heloc: '🏦',
  student: '🎓',
  other: '📋',
}

export const LOAN_TYPES = ['auto', 'mortgage', 'personal', 'heloc', 'student', 'other']

const LOAN_TYPE_I18N = {
  auto: 'loanAuto',
  mortgage: 'loanMortgage',
  personal: 'loanPersonal',
  heloc: 'loanHeloc',
  student: 'loanStudent',
  other: 'loanOther',
}

export function loanTypeLabel(type, t) {
  return t(LOAN_TYPE_I18N[type] || 'loanOther')
}

export function calculateLoanStats(balance, rate, monthlyPayment) {
  const bal = Number(balance) || 0
  const apr = Number(rate) || 0
  const payment = Number(monthlyPayment) || 0
  const interestPortion = (apr / 100 / 12) * bal
  const principalPortion = Math.max(payment - interestPortion, 0)
  const monthsToPayoff = principalPortion > 0 ? Math.ceil(bal / principalPortion) : null
  const totalInterestRemaining = monthsToPayoff != null
    ? Math.max(payment * monthsToPayoff - bal, 0)
    : null

  return {
    interestPortion,
    principalPortion,
    monthsToPayoff,
    totalInterestRemaining,
  }
}

export function estimatePayoffDate(monthsToPayoff, fromDate = new Date()) {
  if (!monthsToPayoff || monthsToPayoff <= 0) return null
  const date = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
  date.setMonth(date.getMonth() + monthsToPayoff)
  return date.toISOString().split('T')[0]
}

export function summarizeLoans(loans) {
  const active = loans.filter(l => l.is_active !== false)
  const totalDebt = active.reduce((sum, l) => sum + (Number(l.current_balance) || 0), 0)
  const totalMonthlyPayments = active.reduce((sum, l) => sum + (Number(l.monthly_payment) || 0), 0)
  const totalInterestRemaining = active.reduce((sum, l) => {
    const stats = calculateLoanStats(l.current_balance, l.interest_rate, l.monthly_payment)
    return sum + (stats.totalInterestRemaining || 0)
  }, 0)

  return { totalDebt, totalMonthlyPayments, totalInterestRemaining, active }
}
