import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustCardBalance, bankDelta } from '../../lib/payments'
import { fetchBanks, getBankDropdownLabel } from '../../utils/bank'
import { isBillPaidThisMonth, getCurrentBillingMonth, getBillDisplayAmount, shouldShowBill } from '../../utils/bills'
import { formatMoney } from '../../utils/currency'

async function recordBillPayment(row) {
  let { error } = await supabase.from('bill_payments').insert(row)
  if (!error) return null

  // Table or columns may be missing — try without optional fields, then ignore
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

export default function QuickPayBillSheet({ onClose, onPaid }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [bills, setBills] = useState([])
  const [cards, setCards] = useState([])
  const [loans, setLoans] = useState([])
  const [statementsMap, setStatementsMap] = useState({})
  const [selectedBill, setSelectedBill] = useState(null)
  const [paymentSourceType, setPaymentSourceType] = useState('bank')
  const [bankId, setBankId] = useState('')
  const [cardId, setCardId] = useState('')
  const [banks, setBanks] = useState([])
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    ;(async () => {
      const [billsRes, banksRes, cardsRes, loansRes, statementsRes] = await Promise.all([
        supabase
          .from('bills')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('due_day'),
        fetchBanks(supabase, user.id, { orderByName: true }),
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('loans')
          .select('id, current_balance, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('card_statements')
          .select('*')
          .eq('user_id', user.id)
          .order('statement_date', { ascending: false }),
      ])

      if (!active) return

      const cardMapLocal = Object.fromEntries((cardsRes.data ?? []).map(c => [c.id, c]))
      const loanMapLocal = Object.fromEntries((loansRes.data ?? []).map(l => [l.id, l]))
      const stmts = (statementsRes.data ?? []).reduce((acc, row) => {
        if (!acc[row.credit_card_id]) acc[row.credit_card_id] = []
        if (acc[row.credit_card_id].length < 12) acc[row.credit_card_id].push(row)
        return acc
      }, {})

      const unpaid = (billsRes.data ?? [])
        .filter(b => !isBillPaidThisMonth(b))
        .filter(b => shouldShowBill(b, cardMapLocal, stmts, loanMapLocal))
        .map(b => ({
          ...b,
          displayAmount: getBillDisplayAmount(b, cardMapLocal, stmts, loanMapLocal),
        }))

      setBills(unpaid)
      setCards(cardsRes.data ?? [])
      setLoans(loansRes.data ?? [])
      setStatementsMap(stmts)
      setBanks(banksRes.data ?? [])
      if (banksRes.data?.length) setBankId(banksRes.data[0].id)
      if (cardsRes.data?.length) setCardId(cardsRes.data[0].id)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id])

  const cardMap = Object.fromEntries(cards.map(c => [c.id, c]))
  const loanMap = Object.fromEntries(loans.map(l => [l.id, l]))

  const markBillPaid = async (bill) => {
    const currentMonth = getCurrentBillingMonth()
    let { error: billUpdateError } = await supabase
      .from('bills')
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        billing_month: currentMonth,
      })
      .eq('id', bill.id)

    if (billUpdateError) {
      const fallback = await supabase
        .from('bills')
        .update({ category: `paid:${currentMonth}` })
        .eq('id', bill.id)
      billUpdateError = fallback.error
    }

    return billUpdateError
  }

  const handlePay = async () => {
    if (!selectedBill) return
    if (paymentSourceType === 'bank' && !bankId) return
    if (paymentSourceType === 'card' && !cardId) return

    setPaying(true)
    setError('')

    const billAmount = selectedBill.displayAmount ?? (Number(selectedBill.amount) || 0)
    if (billAmount <= 0) {
      setError(t('invalidAmount'))
      setPaying(false)
      return
    }

    const today = new Date().toISOString().split('T')[0]

    if (paymentSourceType === 'card') {
      if (selectedBill.credit_card_id && selectedBill.credit_card_id === cardId) {
        setError(t('cannotPayCardBillWithSameCard'))
        setPaying(false)
        return
      }

      let txRow = {
        user_id: user.id,
        credit_card_id: cardId,
        bank_id: null,
        type: 'expense',
        category: selectedBill.category || 'bills',
        amount: billAmount,
        description: `${selectedBill.name} payment`,
        transaction_date: today,
        source: 'manual',
      }

      let { error: txError } = await supabase.from('transactions').insert(txRow)
      if (txError?.message?.includes('source')) {
        const { source: _s, ...rest } = txRow
        ;({ error: txError } = await supabase.from('transactions').insert(rest))
      }

      if (txError) {
        setError(txError.message)
        setPaying(false)
        return
      }

      const cardError = await adjustCardBalance(cardId, billAmount)
      if (cardError) {
        setError(cardError.message)
        setPaying(false)
        return
      }

      await recordBillPayment({
        user_id: user.id,
        bill_id: selectedBill.id,
        amount_paid: billAmount,
        paid_date: today,
        payment_source: 'credit_card',
        credit_card_id: cardId,
      })
    } else {
      let txRow = {
        user_id: user.id,
        bank_id: bankId,
        credit_card_id: null,
        type: 'expense',
        category: 'bills',
        amount: billAmount,
        description: selectedBill.name,
        transaction_date: today,
        source: 'manual',
      }

      let { error: txError } = await supabase.from('transactions').insert(txRow)
      if (txError?.message?.includes('source')) {
        const { source: _s, ...rest } = txRow
        ;({ error: txError } = await supabase.from('transactions').insert(rest))
      }

      if (txError) {
        setError(txError.message)
        setPaying(false)
        return
      }

      const bankError = await adjustBankBalance(bankId, bankDelta('expense', billAmount))
      if (bankError) {
        setError(bankError.message)
        setPaying(false)
        return
      }

      await recordBillPayment({
        user_id: user.id,
        bill_id: selectedBill.id,
        amount_paid: billAmount,
        paid_date: today,
        payment_source: 'bank',
        bank_id: bankId,
      })
    }

    const billUpdateError = await markBillPaid(selectedBill)
    if (billUpdateError) {
      setError(billUpdateError.message)
      setPaying(false)
      return
    }

    if (selectedBill.vault_id) {
      await supabase
        .from('vaults')
        .update({ current_amount: 0 })
        .eq('id', selectedBill.vault_id)
    }

    setPaying(false)
    onPaid?.()
    onClose?.()
  }

  if (loading) {
    return (
      <div className="p-6 pb-8 text-center text-gray-400 text-sm">{t('loading')}</div>
    )
  }

  if (step === 1) {
    return (
      <div className="p-6 pb-8">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">{t('payBill')}</p>
        {bills.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{t('noBills')}</p>
        ) : (
          <div className="space-y-2 mb-4">
            {bills.map(bill => {
              const amount = bill.displayAmount ?? getBillDisplayAmount(bill, cardMap, statementsMap, loanMap)
              const isOverdue = Number(bill.due_day) < new Date().getDate()
              return (
                <button
                  key={bill.id}
                  type="button"
                  onClick={() => {
                    setSelectedBill({ ...bill, displayAmount: amount })
                    setStep(2)
                  }}
                  className="w-full flex justify-between items-center p-4 rounded-2xl border border-lala-100 hover:bg-lala-50 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{bill.name}</p>
                    <p className="text-xs text-gray-400">{t('dayLabel', { day: bill.due_day })}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatMoney(amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isOverdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                    }`}
                    >
                      {isOverdue ? t('overdue') : t('pending')}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <button type="button" onClick={onClose} className="w-full py-3 text-sm text-gray-400">
          {t('cancel')}
        </button>
      </div>
    )
  }

  const amount = selectedBill?.displayAmount ?? 0
  const canConfirm = paymentSourceType === 'bank' ? Boolean(bankId) : Boolean(cardId)

  return (
    <div className="p-6 pb-8">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">{t('confirmPayment')}</p>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      <div className="bg-lala-50 rounded-2xl p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800">{selectedBill?.name}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{formatMoney(amount)}</p>
      </div>

      <p className="text-sm font-semibold text-gray-700 mb-3">{t('payFrom')}</p>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setPaymentSourceType('bank')}
          className="flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px]"
          style={{
            backgroundColor: paymentSourceType === 'bank' ? '#7C3AED' : '#F5F3FF',
            color: paymentSourceType === 'bank' ? 'white' : '#7C3AED',
          }}
        >
          🏦 {t('bank')}
        </button>
        <button
          type="button"
          onClick={() => setPaymentSourceType('card')}
          className="flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px]"
          style={{
            backgroundColor: paymentSourceType === 'card' ? '#7C3AED' : '#F5F3FF',
            color: paymentSourceType === 'card' ? 'white' : '#7C3AED',
          }}
        >
          💳 {t('creditCard')}
        </button>
      </div>

      <div className="space-y-2 mb-6">
        {paymentSourceType === 'bank' ? (
          banks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">{t('noBanksHint')}</p>
          ) : (
            banks.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBankId(b.id)}
                className="w-full flex justify-between items-center p-4 rounded-2xl text-left min-h-[44px]"
                style={{
                  backgroundColor: bankId === b.id ? '#F5F3FF' : '#F9FAFB',
                  border: bankId === b.id ? '2px solid #7C3AED' : '2px solid transparent',
                }}
              >
                <span className="font-medium text-gray-800">{getBankDropdownLabel(b)}</span>
                <span className="text-sm text-gray-500">{formatMoney(b.balance)}</span>
              </button>
            ))
          )
        ) : (
          cards.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">{t('noCardsHint')}</p>
          ) : (
            cards.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCardId(c.id)}
                className="w-full flex justify-between items-center p-4 rounded-2xl text-left min-h-[44px]"
                style={{
                  backgroundColor: cardId === c.id ? '#F5F3FF' : '#F9FAFB',
                  border: cardId === c.id ? '2px solid #7C3AED' : '2px solid transparent',
                }}
              >
                <span className="font-medium text-gray-800">{c.name}</span>
                <span className="text-sm text-red-500">
                  {formatMoney(c.current_balance)} {t('owed')}
                </span>
              </button>
            ))
          )
        )}
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={!canConfirm || paying}
        className="w-full py-4 rounded-2xl text-white font-semibold disabled:opacity-30 min-h-[44px]"
        style={{ backgroundColor: '#7C3AED' }}
      >
        {paying ? t('loading') : t('confirm')}
      </button>
      <button type="button" onClick={() => setStep(1)} className="w-full py-3 text-sm text-gray-400 mt-2">
        ← {t('back')}
      </button>
    </div>
  )
}
