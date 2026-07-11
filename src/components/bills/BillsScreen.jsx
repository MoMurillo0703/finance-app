import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddBillModal from './AddBillModal'
import EditBillModal from './EditBillModal'
import PayBillModal from './PayBillModal'
import BillsCalendar from './BillsCalendar'
import { formatMoney } from '../../utils/currency'
import { isBillPaidThisMonth, getBillDisplayAmount } from '../../utils/bills'

export default function BillsScreen({ onBillPaid }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [bills, setBills] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
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

  return (
    <div className="bg-gray-50">
      <div className="px-5 py-4">
        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        {!loading && bills.length > 0 && (
          <BillsCalendar bills={bills} language={i18n.language} />
        )}

        {loading ? (
          <p className="text-gray-400 text-xs text-center py-8">{t('loading')}</p>
        ) : bills.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-medium text-gray-600">{t('noBills')}</p>
            <p className="text-sm mt-1">{t('addBillPrompt')}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm"
            >
              {t('addBill')}
            </button>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase mb-2">
              {t('sectionAllBills')}
            </p>
            <div className="space-y-2">
            {bills.map(bill => {
              const paid = isBillPaidThisMonth(bill)
              const displayAmount = getBillDisplayAmount(bill, cardMap)
              return (
                <div
                  key={bill.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setEditingBill(bill)}
                    className="w-full text-left"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {bill.loan_id && <span className="mr-1">🏦</span>}
                          {bill.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t('dueDay')}: {bill.due_day}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-800">{formatMoney(displayAmount)}</p>
                        <p className={`text-xs font-medium mt-0.5 ${paid ? 'text-green-500' : 'text-orange-500'}`}>
                          {paid ? t('paid') : t('pending')}
                        </p>
                      </div>
                    </div>
                  </button>

                  {!paid && (
                    <button
                      onClick={() => setPayingBill(bill)}
                      className="w-full mt-2 py-2 rounded-xl bg-purple-600 text-white text-xs font-medium"
                    >
                      {t('markAsPaid')}
                    </button>
                  )}
                </div>
              )
            })}
            </div>
          </>
        )}
      </div>

      <button
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
