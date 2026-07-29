import { getCardMinimumAmount } from './creditCard'

export function getCurrentBillingMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function isBillPaidThisMonth(bill) {
  const currentMonth = getCurrentBillingMonth()

  if (bill.billing_month != null) {
    return bill.is_paid && bill.billing_month === currentMonth
  }

  if (bill.paid_at) {
    const paidDate = new Date(bill.paid_at)
    const now = new Date()
    return bill.is_paid
      && paidDate.getFullYear() === now.getFullYear()
      && paidDate.getMonth() === now.getMonth()
  }

  if (typeof bill.category === 'string' && bill.category.startsWith('paid:')) {
    return bill.category === `paid:${currentMonth}`
  }

  return false
}

export function getBillDisplayAmount(bill, cardMap = {}, statementsMap = {}, loanMap = {}) {
  if (bill.loan_id) {
    const loan = loanMap[bill.loan_id]
    if (loan != null && (Number(loan.current_balance) || 0) <= 0) return 0
    return Number(bill.amount) || 0
  }

  if (bill.credit_card_id && (bill.is_auto_card_bill || Number(bill.amount) === 0)) {
    const card = cardMap[bill.credit_card_id]
    if (!card || (Number(card.current_balance) || 0) <= 0) return 0
    const statements = statementsMap[bill.credit_card_id] || []
    return getCardMinimumAmount(card, statements)
  }

  return Number(bill.amount) || 0
}

export function shouldShowBill(bill, cardMap = {}, statementsMap = {}, loanMap = {}) {
  if (bill.loan_id || (bill.credit_card_id && bill.is_auto_card_bill)) {
    return getBillDisplayAmount(bill, cardMap, statementsMap, loanMap) > 0
  }
  return true
}

export function getDueDaysThisWeek(asOf = new Date()) {
  const today = asOf.getDate()
  const lastDayOfMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate()
  const days = []
  for (let i = 0; i < 7; i += 1) {
    const day = today + i
    if (day <= lastDayOfMonth) days.push(day)
  }
  return days
}

export function getBillStatus(bill, asOf = new Date()) {
  if (isBillPaidThisMonth(bill)) return 'paid'

  const today = asOf.getDate()
  const dueDay = Number(bill.due_day) || 0

  if (dueDay > 0 && dueDay < today) return 'overdue'

  if (getDueDaysThisWeek(asOf).includes(dueDay)) return 'dueThisWeek'

  return 'upcoming'
}

export const BILL_STATUS_BAR = {
  overdue: 'bg-red-500',
  dueThisWeek: 'bg-amber-500',
  upcoming: 'bg-gray-300',
  paid: 'bg-green-500',
}

export function groupBillsByStatus(bills, asOf = new Date()) {
  const groups = {
    overdue: [],
    dueThisWeek: [],
    upcoming: [],
    paid: [],
  }

  for (const bill of bills) {
    const status = getBillStatus(bill, asOf)
    groups[status].push(bill)
  }

  return groups
}
