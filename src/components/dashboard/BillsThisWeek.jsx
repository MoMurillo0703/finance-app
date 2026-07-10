import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'

const getCurrentBillingMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const isBillPaidThisMonth = (bill) => {
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

export default function BillsThisWeek({ refreshKey }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState(null)
  const [error, setError] = useState('')

  const today = new Date().getDate()

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('due_day')

      if (!active) return
      setBills((data ?? []).filter(isBillDueThisWeek))
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const handleMarkPaid = async (bill) => {
    setPayingId(bill.id)
    setError('')

    let bankId = bill.bank_id

    if (!bankId) {
      const { data: banks } = await supabase
        .from('banks')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')
        .limit(1)

      bankId = banks?.[0]?.id
    }

    if (!bankId) {
      setError(t('noBanksHint'))
      setPayingId(null)
      return
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const currentMonth = getCurrentBillingMonth()

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      bank_id: bankId,
      type: 'expense',
      category: 'bills',
      amount: bill.amount,
      description: bill.name,
      transaction_date: todayStr,
    })

    if (txError) {
      setError(txError.message)
      setPayingId(null)
      return
    }

    const { data: bankData, error: bankFetchError } = await supabase
      .from('banks')
      .select('balance')
      .eq('id', bankId)
      .single()

    if (bankFetchError) {
      setError(bankFetchError.message)
      setPayingId(null)
      return
    }

    const newBalance = (Number(bankData.balance) || 0) - bill.amount
    const { error: bankUpdateError } = await supabase
      .from('banks')
      .update({ balance: newBalance })
      .eq('id', bankId)

    if (bankUpdateError) {
      setError(bankUpdateError.message)
      setPayingId(null)
      return
    }

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

    if (billUpdateError) {
      setError(billUpdateError.message)
      setPayingId(null)
      return
    }

    if (bill.vault_id) {
      await supabase
        .from('vaults')
        .update({ current_amount: 0 })
        .eq('id', bill.vault_id)
    }

    setPayingId(null)
    setBills(prev => prev.map(b => (
      b.id === bill.id
        ? { ...b, is_paid: true, paid_at: new Date().toISOString(), billing_month: currentMonth }
        : b
    )))
  }

  if (loading) return null

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        📅 {t('sectionDueThisWeek')}
      </p>
      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
      {bills.length === 0 ? (
        <p className="text-xs text-gray-400 bg-white rounded-2xl border border-gray-100 p-4 text-center">
          {t('nothingDueThisWeek')}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {bills.map(bill => {
            const paid = isBillPaidThisMonth(bill)
            return (
              <div
                key={bill.id}
                className={`min-w-[130px] bg-white rounded-2xl p-3 border border-gray-100 border-l-4 shadow-sm flex-shrink-0 ${getBillBorderClass(bill, today)}`}
              >
                <p className="text-xs font-semibold text-gray-700 truncate">{bill.name}</p>
                <p className="text-base font-bold text-gray-800 mt-1">{formatMoney(bill.amount)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {t('dueDay')} {bill.due_day}
                </p>
                <p className={`text-[10px] font-medium mt-1 ${paid ? 'text-green-600' : 'text-gray-500'}`}>
                  {paid ? t('paid') : t('pending')}
                </p>
                {!paid && (
                  <button
                    type="button"
                    onClick={() => handleMarkPaid(bill)}
                    disabled={payingId === bill.id}
                    className="mt-2 w-full py-1 rounded-full bg-purple-600 text-white text-[10px] font-medium disabled:opacity-50"
                  >
                    {payingId === bill.id ? '...' : t('pay')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
