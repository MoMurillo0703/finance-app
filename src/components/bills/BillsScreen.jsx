import { useState, useEffect, useMemo } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddBillModal from './AddBillModal'
import EditBillModal from './EditBillModal'
import PayBillModal from './PayBillModal'
import BillsCalendar from './BillsCalendar'
import { formatMoney } from '../../utils/currency'
import {
  isBillPaidThisMonth,
  getBillDisplayAmount,
  groupBillsByStatus,
  BILL_STATUS_BAR,
} from '../../utils/bills'

function BillRow({ bill, displayAmount, paid, statusBar, onEdit, onPay }) {
  return (
    <div className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between border border-gray-100">
      <button
        type="button"
        onClick={() => onEdit(bill)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div className={`w-2 h-10 rounded-full shrink-0 ${statusBar}`} />
        <div className="min-w-0">
          <p className="font-medium text-gray-800 text-sm truncate">
            {bill.loan_id && <span className="mr-1">🏦</span>}
            {bill.name}
          </p>
          <p className="text-xs text-gray-400">Due day {bill.due_day}</p>
        </div>
      </button>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <p className="font-bold text-gray-800">{formatMoney(displayAmount)}</p>
        {!paid ? (
          <button
            type="button"
            onClick={() => onPay(bill)}
            className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-purple-500 hover:bg-purple-50 transition-colors"
            aria-label="Mark as paid"
          >
            <Check size={14} className="text-gray-300" />
          </button>
        ) : (
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Check size={14} className="text-green-500" />
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ emoji, label, count }) {
  if (count === 0) return null
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 first:mt-0">
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
  const [showCalendar, setShowCalendar] = useState(false)
  const [showPaid, setShowPaid] = useState(false)
  const [editingBill, setEditingBill] = useState(null)
  const [payingBill, setPayingBill] = useState(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

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

  const summary = useMemo(() => {
    let totalDue = 0
    let totalPaid = 0

    for (const bill of bills) {
      const amount = getBillDisplayAmount(bill, cardMap)
      if (isBillPaidThisMonth(bill)) {
        totalPaid += amount
      } else {
        totalDue += amount
      }
    }

    return { totalDue, totalPaid, remaining: totalDue }
  }, [bills, cardMap])

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

  const renderBill = (bill, statusKey) => {
    const paid = isBillPaidThisMonth(bill)
    const displayAmount = getBillDisplayAmount(bill, cardMap)
    return (
      <BillRow
        key={bill.id}
        bill={bill}
        displayAmount={displayAmount}
        paid={paid}
        statusBar={BILL_STATUS_BAR[statusKey]}
        onEdit={setEditingBill}
        onPay={setPayingBill}
      />
    )
  }

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
        <>
          <div className="flex justify-between px-4 py-3 bg-purple-50 rounded-2xl mx-4 mt-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">{t('totalDueThisMonth')}</p>
              <p className="font-bold text-gray-800">{formatMoney(summary.totalDue + summary.totalPaid)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">{t('paidSoFar')}</p>
              <p className="font-bold text-green-600">{formatMoney(summary.totalPaid)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{t('remaining')}</p>
              <p className="font-bold text-red-500">{formatMoney(summary.remaining)}</p>
            </div>
          </div>

          <div className="px-4 mb-3">
            <button
              type="button"
              onClick={() => setShowCalendar(v => !v)}
              className="text-xs text-purple-600 font-medium"
            >
              {showCalendar ? t('hideCalendar') : t('showCalendar')}
            </button>
          </div>

          {showCalendar && (
            <div className="px-4 mb-4">
              <BillsCalendar bills={bills} language={i18n.language} />
            </div>
          )}

          <div className="px-4 space-y-2">
            <SectionHeader emoji="🔴" label={t('sectionOverdue')} count={grouped.overdue.length} />
            {grouped.overdue.map(bill => renderBill(bill, 'overdue'))}

            <SectionHeader emoji="🟡" label={t('sectionDueThisWeek')} count={grouped.dueThisWeek.length} />
            {grouped.dueThisWeek.map(bill => renderBill(bill, 'dueThisWeek'))}

            <SectionHeader emoji="⚪" label={t('sectionUpcoming')} count={grouped.upcoming.length} />
            {grouped.upcoming.map(bill => renderBill(bill, 'upcoming'))}

            {grouped.paid.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowPaid(v => !v)}
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"
                >
                  ✅ {t('paidThisMonthToggle', { count: grouped.paid.length })}
                  <span className="text-gray-400 normal-case">{showPaid ? '▾' : '▸'}</span>
                </button>
                {showPaid && grouped.paid.map(bill => renderBill(bill, 'paid'))}
              </div>
            )}
          </div>
        </>
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
