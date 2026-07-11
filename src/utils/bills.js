import { calculateAutoBillMinimum } from './creditCard'

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

export function getBillDisplayAmount(bill, cardMap = {}) {
  if (bill.is_auto_card_bill && bill.credit_card_id) {
    const card = cardMap[bill.credit_card_id]
    if (card) return calculateAutoBillMinimum(card)
  }
  return Number(bill.amount) || 0
}
