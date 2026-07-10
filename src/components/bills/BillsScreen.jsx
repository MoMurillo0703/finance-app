import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddBillModal from './AddBillModal'

const formatCOP = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)

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

export default function BillsScreen({ onBillPaid }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [payingId, setPayingId] = useState(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data, error: fetchError } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('due_day')

      if (!active) return
      if (fetchError) setError(fetchError.message)
      else setBills(data ?? [])
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

    const today = new Date().toISOString().split('T')[0]
    const currentMonth = getCurrentBillingMonth()

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      bank_id: bankId,
      type: 'expense',
      category: 'bills',
      amount: bill.amount,
      description: bill.name,
      transaction_date: today,
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
    setRefreshKey(k => k + 1)
    onBillPaid?.()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-6 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-gray-800">{t('billsTitle')}</h1>
      </div>

      <div className="px-6 py-6">
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('loading')}</p>
        ) : bills.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">{t('noBills')}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-purple-600 text-sm font-medium"
            >
              {t('addFirstBill')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {bills.map(bill => {
              const paid = isBillPaidThisMonth(bill)
              return (
                <div
                  key={bill.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{bill.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t('dueDay')}: {bill.due_day}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">{formatCOP(bill.amount)}</p>
                      <p className={`text-xs font-medium mt-0.5 ${paid ? 'text-green-500' : 'text-orange-500'}`}>
                        {paid ? t('paid') : t('pending')}
                      </p>
                    </div>
                  </div>

                  {!paid && (
                    <button
                      onClick={() => handleMarkPaid(bill)}
                      disabled={payingId === bill.id}
                      className="w-full mt-2 py-2 rounded-xl bg-purple-600 text-white text-xs font-medium disabled:opacity-50"
                    >
                      {payingId === bill.id ? '...' : t('markAsPaid')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
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
          onSaved={() => { setShowAdd(false); setRefreshKey(k => k + 1) }}
        />
      )}
    </div>
  )
}
