import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustCardBalance, bankDelta } from '../../lib/payments'
import AddBillModal from './AddBillModal'
import EditBillModal from './EditBillModal'
import PayBillModal from './PayBillModal'
import BillsCalendar from './BillsCalendar'
import { formatMoney } from '../../utils/currency'
import {
  isBillPaidThisMonth,
  getBillDisplayAmount,
  groupBillsByStatus,
  getCurrentBillingMonth,
} from '../../utils/bills'

function BillCard({ bill, displayAmount, paid, isOverdue, isDueSoon, faded, cardId, flashing, onEdit, onPay, onUndo, t }) {
  const borderClass = paid
    ? 'border-green-100'
    : isOverdue
      ? 'border-red-200'
      : isDueSoon
        ? 'border-amber-200'
        : 'border-gray-100'

  const barClass = paid
    ? 'bg-green-400'
    : isOverdue
      ? 'bg-red-400'
      : isDueSoon
        ? 'bg-amber-400'
        : 'bg-gray-200'

  return (
    <div
      id={cardId}
      className={`bg-white rounded-2xl p-4 border shadow-sm relative transition-all ${borderClass} ${
        faded ? 'opacity-60' : ''
      } ${flashing ? 'ring-2 ring-purple-400 animate-pulse' : ''}`}
    >
      <div className={`absolute top-0 left-4 right-4 h-1 rounded-full ${barClass}`} />

      <button type="button" onClick={() => onEdit(bill)} className="block w-full text-left">
        <p className="font-semibold text-gray-800 text-sm mt-1 truncate">
          {bill.loan_id && <span className="mr-1">🏦</span>}
          {bill.name}
        </p>
        <p className="text-xs text-gray-400 mb-2">{t('dayLabel', { day: bill.due_day })}</p>
        <p className="text-lg font-bold text-gray-900">{formatMoney(displayAmount)}</p>
      </button>

      <div className="mt-2 mb-3">
        {paid ? (
          <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">✓ {t('paid')}</span>
        ) : isOverdue ? (
          <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full">{t('sectionOverdue')}</span>
        ) : isDueSoon ? (
          <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">{t('dueSoon')}</span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">{t('sectionUpcoming')}</span>
        )}
      </div>

      {!paid ? (
        <button
          type="button"
          onClick={() => onPay(bill)}
          className="w-full py-1.5 rounded-xl bg-purple-600 text-white text-xs font-medium"
        >
          {t('markAsPaid')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onUndo(bill)}
          className="w-full py-1.5 rounded-xl border border-gray-200 text-gray-400 text-xs"
        >
          {t('undo')}
        </button>
      )}
    </div>
  )
}

function SectionHeader({ emoji, label, count }) {
  if (count === 0) return null
  return (
    <p className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 mt-4 first:mt-0">
      {emoji} {label}
    </p>
  )
}

export default function BillsScreen({ onBillPaid }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [bills, setBills] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingBill, setEditingBill] = useState(null)
  const [payingBill, setPayingBill] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [flashDay, setFlashDay] = useState(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const flashTimer = useRef(null)

  const todayDate = new Date().getDate()

  const cardMap = useMemo(
    () => Object.fromEntries(cards.map(card => [card.id, card])),
    [cards],
  )

  useEffect(() => {
    let active = true

    ;(async () => {
      const [billsRes, cardsRes] = await Promise.all([
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
      ])

      if (!active) return
      if (billsRes.error) setError(billsRes.error.message)
      else setBills(billsRes.data ?? [])
      setCards(cardsRes.data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const grouped = useMemo(() => groupBillsByStatus(bills), [bills])

  const orderedBills = useMemo(
    () => [...grouped.overdue, ...grouped.dueThisWeek, ...grouped.upcoming, ...grouped.paid],
    [grouped],
  )

  const summary = useMemo(() => {
    let totalDue = 0
    let totalPaid = 0

    for (const bill of bills) {
      const amount = getBillDisplayAmount(bill, cardMap)
      totalDue += amount
      if (isBillPaidThisMonth(bill)) totalPaid += amount
    }

    return { totalDue, totalPaid }
  }, [bills, cardMap])

  useEffect(() => {
    if (selectedDay == null) return
    const firstBill = orderedBills.find(b => b.due_day === selectedDay)
    if (!firstBill) return

    const el = document.getElementById(`bill-day-${selectedDay}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    setFlashDay(selectedDay)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashDay(null), 1000)
  }, [selectedDay, orderedBills])

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
  }, [])

  const handleBillSaved = () => {
    setEditingBill(null)
    setRefreshKey(k => k + 1)
    onBillPaid?.()
  }

  const handleBillPaid = () => {
    setPayingBill(null)
    setRefreshKey(k => k + 1)
    onBillPaid?.()
  }

  const handleUndo = async (bill) => {
    const currentMonth = getCurrentBillingMonth()

    const monthStart = `${currentMonth}-01`
    const now = new Date()
    const monthEnd = `${currentMonth}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

    const { data: matches } = await supabase
      .from('transactions')
      .select('id, amount, bank_id, credit_card_id')
      .eq('user_id', user.id)
      .eq('category', 'bills')
      .eq('description', bill.name)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
      .order('created_at', { ascending: false })
      .limit(1)

    const tx = matches?.[0]
    if (tx) {
      if (tx.bank_id) {
        await adjustBankBalance(tx.bank_id, -bankDelta('expense', tx.amount))
      } else if (tx.credit_card_id) {
        await adjustCardBalance(tx.credit_card_id, -tx.amount)
      }
      await supabase.from('transactions').delete().eq('id', tx.id)
    }

    const { error: updateError } = await supabase
      .from('bills')
      .update({ is_paid: false, paid_at: null, billing_month: null })
      .eq('id', bill.id)

    if (updateError) {
      await supabase.from('bills').update({ category: 'bills' }).eq('id', bill.id)
    }

    setRefreshKey(k => k + 1)
    onBillPaid?.()
  }

  const dueSoonDays = useMemo(() => {
    const set = new Set()
    for (let i = 0; i < 7; i += 1) set.add(todayDate + i)
    return set
  }, [todayDate])

  const renderCard = (bill, seenDays) => {
    const paid = isBillPaidThisMonth(bill)
    const displayAmount = getBillDisplayAmount(bill, cardMap)
    const isOverdue = !paid && bill.due_day < todayDate
    const isDueSoon = !paid && dueSoonDays.has(bill.due_day)

    let cardId
    if (!seenDays.has(bill.due_day)) {
      seenDays.add(bill.due_day)
      cardId = `bill-day-${bill.due_day}`
    }

    return (
      <BillCard
        key={bill.id}
        bill={bill}
        displayAmount={displayAmount}
        paid={paid}
        isOverdue={isOverdue}
        isDueSoon={isDueSoon}
        faded={paid}
        cardId={cardId}
        flashing={flashDay != null && bill.due_day === flashDay}
        onEdit={setEditingBill}
        onPay={setPayingBill}
        onUndo={handleUndo}
        t={t}
      />
    )
  }

  const seenDays = new Set()

  return (
    <div className="bg-gray-50 min-h-full pb-24">
      {error && <p className="text-red-500 text-xs px-4 pt-3">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-xs text-center py-10">{t('loading')}</p>
      ) : bills.length === 0 ? (
        <div className="text-center py-12 text-gray-400 px-5">
          <p className="text-4xl mb-3">🎉</p>
          <p className="font-medium text-gray-600">{t('noBills')}</p>
          <p className="text-sm mt-1">{t('addBillPrompt')}</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm"
          >
            {t('addBill')}
          </button>
        </div>
      ) : (
        <div className="pt-4">
          <BillsCalendar
            bills={bills}
            language={i18n.language}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />

          <div className="grid grid-cols-3 gap-2 mx-4 mb-4">
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">{t('due')}</p>
              <p className="font-bold text-red-500 text-sm">{formatMoney(summary.totalDue)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">{t('paid')}</p>
              <p className="font-bold text-green-500 text-sm">{formatMoney(summary.totalPaid)}</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">{t('remaining')}</p>
              <p className="font-bold text-purple-600 text-sm">{formatMoney(summary.totalDue - summary.totalPaid)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-4 items-start">
            <SectionHeader emoji="🔴" label={t('sectionOverdue')} count={grouped.overdue.length} />
            {grouped.overdue.map(bill => renderCard(bill, seenDays))}

            <SectionHeader emoji="🟡" label={t('sectionDueThisWeek')} count={grouped.dueThisWeek.length} />
            {grouped.dueThisWeek.map(bill => renderCard(bill, seenDays))}

            <SectionHeader emoji="⚪" label={t('sectionUpcoming')} count={grouped.upcoming.length} />
            {grouped.upcoming.map(bill => renderCard(bill, seenDays))}

            <SectionHeader emoji="✅" label={t('paid')} count={grouped.paid.length} />
            {grouped.paid.map(bill => renderCard(bill, seenDays))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-purple-600 text-white text-3xl leading-none shadow-lg flex items-center justify-center"
        aria-label={t('addBill')}
      >
        +
      </button>

      {showAdd && (
        <AddBillModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); setRefreshKey(k => k + 1); onBillPaid?.() }}
        />
      )}

      {editingBill && (
        <EditBillModal
          bill={editingBill}
          onClose={() => setEditingBill(null)}
          onSaved={handleBillSaved}
        />
      )}

      {payingBill && (
        <PayBillModal
          bill={payingBill}
          cardMap={cardMap}
          onClose={() => setPayingBill(null)}
          onPaid={handleBillPaid}
        />
      )}
    </div>
  )
}
