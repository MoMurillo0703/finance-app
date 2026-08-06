import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getBankDropdownLabel } from '../../utils/bank'
import { isBillPaidThisMonth, getBillDisplayAmount, shouldShowBill } from '../../utils/bills'
import { confirmBillPayment } from '../../utils/billPayment'
import { formatMoney } from '../../utils/currency'

export default function QuickPayBillSheet({ onClose, onPaid, showToast }) {
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
      setLoading(true)

      const [
        billsRes,
        banksRes,
        cardsRes,
        loansRes,
        statementsRes,
      ] = await Promise.all([
        supabase
          .from('bills')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('due_day'),
        supabase
          .from('banks')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
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

      if (banksRes.error) console.error('QuickPayBillSheet banks fetch:', banksRes.error)
      if (cardsRes.error) console.error('QuickPayBillSheet cards fetch:', cardsRes.error)

      const bankList = banksRes.data || []
      const cardList = (cardsRes.data || []).filter(c => c.is_active !== false)
      const cardMapLocal = Object.fromEntries(cardList.map(c => [c.id, c]))
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
      setCards(cardList)
      setLoans(loansRes.data ?? [])
      setStatementsMap(stmts)
      setBanks(bankList)
      if (bankList.length) setBankId(bankList[0].id)
      if (cardList.length) setCardId(cardList[0].id)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id])

  const cardMap = Object.fromEntries(cards.map(c => [c.id, c]))
  const loanMap = Object.fromEntries(loans.map(l => [l.id, l]))

  useEffect(() => {
    if (!selectedBill) return
    const src = selectedBill.default_payment_source || 'bank'
    if (src === 'credit_card') {
      setPaymentSourceType('card')
      if (selectedBill.default_credit_card_id) {
        setCardId(selectedBill.default_credit_card_id)
      }
    } else {
      setPaymentSourceType('bank')
      if (selectedBill.default_bank_id || selectedBill.bank_id) {
        setBankId(selectedBill.default_bank_id || selectedBill.bank_id)
      }
    }
  }, [selectedBill])

  const mapPaymentError = (err) => {
    if (!err) return t('transferFailed')
    if (err.message === 'invalid_amount') return t('invalidAmount')
    if (err.message === 'missing_payment_source') return t('selectBank')
    if (err.message === 'same_card') return t('cannotPayCardBillWithSameCard')
    return err.message || t('transferFailed')
  }

  const handlePay = async () => {
    if (!selectedBill) return
    if (paymentSourceType === 'bank' && !bankId) return
    if (paymentSourceType === 'card' && !cardId) return

    setPaying(true)
    setError('')

    const billAmount = selectedBill.displayAmount ?? (Number(selectedBill.amount) || 0)
    const source = paymentSourceType === 'card'
      ? { type: 'credit_card', id: cardId }
      : { type: 'bank', id: bankId }

    const { error: payError } = await confirmBillPayment({
      supabase,
      userId: user.id,
      bill: selectedBill,
      amount: billAmount,
      source,
    })

    if (payError) {
      setError(mapPaymentError(payError))
      setPaying(false)
      return
    }

    setPaying(false)
    showToast?.(t('billMarkedPaid', { name: selectedBill.name }))
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
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.issuing_bank ? `${c.issuing_bank} · ` : ''}
                    {formatMoney(c.current_balance)} {t('owed')}
                  </p>
                </div>
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
