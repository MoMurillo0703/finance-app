import { adjustBankBalance, adjustCardBalance, bankDelta, cardDelta } from '../lib/payments'
import { getCurrentBillingMonth } from './bills'

async function recordBillPayment(supabase, row) {
  let { error } = await supabase.from('bill_payments').insert(row)
  if (!error) return null

  if (
    error.message?.includes('payment_source')
    || error.message?.includes('credit_card_id')
    || error.message?.includes('bank_id')
  ) {
    const fallback = { ...row }
    if (error.message.includes('payment_source')) delete fallback.payment_source
    if (error.message.includes('credit_card_id')) delete fallback.credit_card_id
    if (error.message.includes('bank_id')) delete fallback.bank_id
    ;({ error } = await supabase.from('bill_payments').insert(fallback))
  }

  if (error?.message?.includes('bill_payments') || error?.code === '42P01') {
    console.warn('bill_payments insert skipped:', error.message)
    return null
  }

  return error
}

async function insertTransaction(supabase, row) {
  let payload = { ...row }
  let { error } = await supabase.from('transactions').insert(payload)
  if (error?.message?.includes('source')) {
    const { source: _s, ...rest } = payload
    ;({ error } = await supabase.from('transactions').insert(rest))
  }
  return error
}

async function markBillPaid(supabase, bill) {
  const currentMonth = getCurrentBillingMonth()
  let { error } = await supabase
    .from('bills')
    .update({
      is_paid: true,
      paid_at: new Date().toISOString(),
      billing_month: currentMonth,
    })
    .eq('id', bill.id)

  if (error) {
    ;({ error } = await supabase
      .from('bills')
      .update({ category: `paid:${currentMonth}` })
      .eq('id', bill.id))
  }

  return error
}

async function adjustLoanBalance(supabase, loanId, amountPaid) {
  const { data, error: fetchError } = await supabase
    .from('loans')
    .select('current_balance')
    .eq('id', loanId)
    .single()

  if (fetchError) return fetchError

  const next = Math.max(0, (Number(data.current_balance) || 0) - amountPaid)
  const { error } = await supabase
    .from('loans')
    .update({ current_balance: next })
    .eq('id', loanId)

  return error
}

/**
 * Confirm a bill payment against a bank or credit card.
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {string} args.userId
 * @param {object} args.bill
 * @param {number} args.amount
 * @param {{ type: 'bank' | 'credit_card', id: string }} args.source
 */
export async function confirmBillPayment({ supabase, userId, bill, amount, source }) {
  const billAmount = Number(amount) || 0
  if (billAmount <= 0) {
    return { error: { message: 'invalid_amount' } }
  }
  if (!source?.id || !['bank', 'credit_card'].includes(source.type)) {
    return { error: { message: 'missing_payment_source' } }
  }

  // Don't charge a card's own minimum-payment bill to itself
  if (
    source.type === 'credit_card'
    && bill.credit_card_id
    && bill.credit_card_id === source.id
  ) {
    return { error: { message: 'same_card' } }
  }

  const today = new Date().toISOString().split('T')[0]
  const category = (bill.category && !String(bill.category).startsWith('paid:'))
    ? bill.category
    : 'bills'
  const isAutoCardBill = Boolean(bill.is_auto_card_bill && bill.credit_card_id)
  const isLoanBill = Boolean(bill.loan_id)

  // Paying a card min from bank is a payment toward the card, not a generic expense charge
  const txType = isAutoCardBill && source.type === 'bank' ? 'payment' : 'expense'

  const txRow = {
    user_id: userId,
    description: bill.name,
    amount: billAmount,
    type: txType,
    category,
    transaction_date: today,
    bank_id: source.type === 'bank' ? source.id : null,
    credit_card_id: source.type === 'credit_card' ? source.id : null,
    source: 'manual',
  }

  const txError = await insertTransaction(supabase, txRow)
  if (txError) return { error: txError }

  if (source.type === 'bank') {
    const bankError = await adjustBankBalance(source.id, bankDelta('expense', billAmount))
    if (bankError) return { error: bankError }
  } else {
    // Charged to credit card → increase amount owed
    const cardError = await adjustCardBalance(source.id, cardDelta('expense', billAmount))
    if (cardError) return { error: cardError }
  }

  // Auto card minimum paid from bank → pay down that card
  if (isAutoCardBill && source.type === 'bank') {
    const payDownError = await adjustCardBalance(
      bill.credit_card_id,
      cardDelta('payment', billAmount),
    )
    if (payDownError) return { error: payDownError }
  }

  // Loan bill paid from bank → reduce loan principal
  if (isLoanBill && source.type === 'bank') {
    const loanError = await adjustLoanBalance(supabase, bill.loan_id, billAmount)
    if (loanError) return { error: loanError }
  }

  const paymentError = await recordBillPayment(supabase, {
    user_id: userId,
    bill_id: bill.id,
    amount_paid: billAmount,
    paid_date: today,
    payment_source: source.type === 'credit_card' ? 'credit_card' : 'bank',
    bank_id: source.type === 'bank' ? source.id : null,
    credit_card_id: source.type === 'credit_card' ? source.id : null,
  })
  if (paymentError) return { error: paymentError }

  const billError = await markBillPaid(supabase, bill)
  if (billError) return { error: billError }

  if (bill.vault_id) {
    await supabase
      .from('vaults')
      .update({ current_amount: 0 })
      .eq('id', bill.vault_id)
  }

  return { error: null }
}
