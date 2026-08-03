import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import PayBillModal from '../bills/PayBillModal'
import { formatMoney } from '../../utils/currency'
import { isBillPaidThisMonth, getBillDisplayAmount, shouldShowBill } from '../../utils/bills'

const getDueDaysThisWeek = () => {
  const now = new Date()
  const today = now.getDate()
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const days = []
  for (let i = 0; i < 7; i++) {
    const day = today + i
    if (day <= lastDayOfMonth) days.push(day)
  }
  return days
}

function isBillDueThisWeek(bill) {
  const dueDays = getDueDaysThisWeek()
  return dueDays.includes(bill.due_day)
}

function getBillBorderClass(bill, today) {
  const paid = isBillPaidThisMonth(bill)
  if (paid) return 'border-l-green-400'
  if (bill.due_day <= today) return 'border-l-red-400'
  return 'border-l-gray-300'
}

export default function BillsThisWeek({ refreshKey, showToast }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [bills, setBills] = useState([])
  const [cards, setCards] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [payingBill, setPayingBill] = useState(null)

  const today = new Date().getDate()

  const cardMap = useMemo(
    () => Object.fromEntries(cards.map(card => [card.id, card])),
    [cards],
  )

  const loanMap = useMemo(
    () => Object.fromEntries(loans.map(loan => [loan.id, loan])),
    [loans],
  )

  useEffect(() => {
    let active = true

    ;(async () => {
      const [billsRes, cardsRes, loansRes] = await Promise.all([
        supabase
          .from('bills')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('due_day'),
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('loans')
          .select('id, current_balance, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      if (!active) return
      setBills(
        (billsRes.data ?? [])
          .filter(isBillDueThisWeek)
          .filter(b => shouldShowBill(b, Object.fromEntries((cardsRes.data ?? []).map(c => [c.id, c])), {}, Object.fromEntries((loansRes.data ?? []).map(l => [l.id, l])))),
      )
      setCards(cardsRes.data ?? [])
      setLoans(loansRes.data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const handleBillPaid = () => {
    const paidId = payingBill?.id
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    setPayingBill(null)
    if (!paidId) return
    setBills(prev => prev.map(b => (
      b.id === paidId
        ? {
          ...b,
          is_paid: true,
          paid_at: new Date().toISOString(),
          billing_month: currentMonth,
        }
        : b
    )))
  }

  if (loading) return null

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        📅 {t('sectionDueThisWeek')}
      </p>
      {bills.length === 0 ? (
        <p className="text-xs text-gray-400 bg-white rounded-2xl border border-gray-100 p-4 text-center">
          {t('nothingDueThisWeek')}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {bills.map(bill => {
            const paid = isBillPaidThisMonth(bill)
            const displayAmount = getBillDisplayAmount(bill, cardMap, {}, loanMap)
            return (
              <div
                key={bill.id}
                className={`min-w-[130px] bg-white rounded-2xl p-3 border border-gray-100 border-l-4 shadow-sm flex-shrink-0 ${getBillBorderClass(bill, today)}`}
              >
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {bill.loan_id && <span className="mr-0.5">🏦</span>}
                  {bill.name}
                </p>
                <p className="text-base font-bold text-gray-800 mt-1">{formatMoney(displayAmount)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {t('dueDay')} {bill.due_day}
                </p>
                <p className={`text-[10px] font-medium mt-1 ${paid ? 'text-green-600' : 'text-gray-500'}`}>
                  {paid ? t('paid') : t('pending')}
                </p>
                {!paid && (
                  <button
                    type="button"
                    onClick={() => setPayingBill(bill)}
                    className="mt-2 w-full py-1 rounded-full bg-purple-600 text-white text-[10px] font-medium"
                  >
                    {t('pay')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {payingBill && (
        <PayBillModal
          bill={payingBill}
          cardMap={cardMap}
          onClose={() => setPayingBill(null)}
          onPaid={handleBillPaid}
          showToast={showToast}
        />
      )}
    </div>
  )
}
