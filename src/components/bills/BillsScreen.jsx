import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
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

function BillCard({ bill, displayAmount, paid, isOverdue, isDueSoon, faded, cardId, selected, onEdit, onPay, onUndo, t }) {
  const borderClass = selected
    ? 'border-purple-400 shadow-purple-100 shadow-md ring-2 ring-purple-300'
    : paid
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
      className={`bg-white rounded-2xl p-4 border shadow-sm relative transition-all duration-300 ${borderClass} ${
        faded ? 'opacity-60' : ''
      }`}
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
  const [statementsMap, setStatementsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingBill, setEditingBill] = useState(null)
  const [payingBill, setPayingBill] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const todayDate = new Date().getDate()

  const cardMap = useMemo(
    () => Object.fromEntries(cards.map(card => [card.id, card])),
    [cards],
  )

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('due_day')

      if (!active) return
      if (billsError) {
        setError(billsError.message)
        setLoading(false)
        return
      }

      const billsList = billsData ?? []
      const autoCardIds = [
        ...new Set(
          billsList
            .filter(b => b.is_auto_card_bill && b.credit_card_id)
            .map(b => b.credit_card_id),
        ),
      ]

      const cardSelect = 'id, name, current_balance, interest_rate, intro_rate, intro_rate_expires, is_active'

      const cardQueries = [
        supabase
          .from('credit_cards')
          .select(cardSelect)
          .eq('user_id', user.id)
          .eq('is_active', true),
      ]

      if (autoCardIds.length > 0) {
        cardQueries.push(
          supabase
            .from('credit_cards')
            .select(cardSelect)
            .in('id', autoCardIds),
        )
      }

      const fetches = [...cardQueries]
      if (autoCardIds.length > 0) {
        fetches.push(
          supabase
            .from('card_statements')
            .select('*')
            .in('credit_card_id', autoCardIds)
            .order('statement_date', { ascending: false }),
        )
      }

      const results = await Promise.all(fetches)
      const cardResults = results.slice(0, cardQueries.length)
      const statementsResult = autoCardIds.length > 0 ? results[results.length - 1] : null
      const cardsById = new Map()
      for (const result of cardResults) {
        for (const card of result.data ?? []) {
          cardsById.set(card.id, card)
        }
      }

      const stmtsByCard = {}
      for (const stmt of statementsResult?.data ?? []) {
        if (!stmtsByCard[stmt.credit_card_id]) stmtsByCard[stmt.credit_card_id] = []
        if (stmtsByCard[stmt.credit_card_id].length < 12) {
          stmtsByCard[stmt.credit_card_id].push(stmt)
        }
      }

      setBills(billsList)
      setCards([...cardsById.values()])
      setStatementsMap(stmtsByCard)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const grouped = useMemo(() => groupBillsByStatus(bills), [bills])

  const summary = useMemo(() => {
    let totalDue = 0
    let totalPaid = 0

    for (const bill of bills) {
      const amount = getBillDisplayAmount(bill, cardMap, statementsMap)
      totalDue += amount
      if (isBillPaidThisMonth(bill)) totalPaid += amount
    }

    return { totalDue, totalPaid }
  }, [bills, cardMap, statementsMap])

  const dayBills = useMemo(() => {
    if (selectedDay == null) return []
    return bills
      .filter(b => b.due_day === selectedDay)
      .map(bill => ({
        ...bill,
        displayAmount: getBillDisplayAmount(bill, cardMap, statementsMap),
        is_paid: isBillPaidThisMonth(bill),
      }))
  }, [bills, selectedDay, cardMap, statementsMap])

  useEffect(() => {
    if (selectedDay == null) return
    const el = document.getElementById(`bill-${selectedDay}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [selectedDay])

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
    const displayAmount = getBillDisplayAmount(bill, cardMap, statementsMap)
    const isOverdue = !paid && bill.due_day < todayDate
    const isDueSoon = !paid && dueSoonDays.has(bill.due_day)
    const isSelected = selectedDay != null && bill.due_day === selectedDay

    let cardId
    if (!seenDays.has(bill.due_day)) {
      seenDays.add(bill.due_day)
      cardId = `bill-${bill.due_day}`
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
        selected={isSelected}
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

          {selectedDay && dayBills.length > 0 && (
            <div className="mx-4 mb-3 bg-white rounded-2xl border border-purple-200 shadow-md p-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-purple-600">{t('dayLabel', { day: selectedDay })}</p>
                <button type="button" onClick={() => setSelectedDay(null)}>
                  <X size={14} className="text-gray-400" />
                </button>
              </div>
              {dayBills.map(bill => (
                <div key={bill.id} className="flex justify-between items-center py-1.5 border-t border-gray-50 first:border-t-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${bill.is_paid ? 'bg-green-400' : 'bg-red-400'}`} />
                    <p className="text-sm text-gray-700 truncate">{bill.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <p className="text-sm font-semibold text-gray-800">{formatMoney(bill.displayAmount)}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      bill.is_paid ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                    }`}
                    >
                      {bill.is_paid ? '✓' : t('due')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

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
          statementsMap={statementsMap}
          onClose={() => setPayingBill(null)}
          onPaid={handleBillPaid}
        />
      )}
    </div>
  )
}
