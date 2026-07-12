import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, bankDelta } from '../../lib/payments'
import { fetchBanks, getBankDropdownLabel } from '../../utils/bank'
import { isBillPaidThisMonth, getCurrentBillingMonth, getBillDisplayAmount } from '../../utils/bills'
import { formatMoney } from '../../utils/currency'

export default function QuickPayBillSheet({ onClose, onPaid }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [bills, setBills] = useState([])
  const [cards, setCards] = useState([])
  const [statementsMap, setStatementsMap] = useState({})
  const [selectedBill, setSelectedBill] = useState(null)
  const [bankId, setBankId] = useState('')
  const [banks, setBanks] = useState([])
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    ;(async () => {
      const [billsRes, banksRes, cardsRes, statementsRes] = await Promise.all([
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
          .eq('is_active', true),
        supabase
          .from('card_statements')
          .select('*')
          .eq('user_id', user.id)
          .order('statement_date', { ascending: false }),
      ])

      if (!active) return

      const cardMap = Object.fromEntries((cardsRes.data ?? []).map(c => [c.id, c]))
      const stmts = (statementsRes.data ?? []).reduce((acc, row) => {
        if (!acc[row.credit_card_id]) acc[row.credit_card_id] = []
        if (acc[row.credit_card_id].length < 12) acc[row.credit_card_id].push(row)
        return acc
      }, {})

      const unpaid = (billsRes.data ?? [])
        .filter(b => !isBillPaidThisMonth(b))
        .map(b => ({
          ...b,
          displayAmount: getBillDisplayAmount(b, cardMap, stmts),
        }))

      setBills(unpaid)
      setCards(cardsRes.data ?? [])
      setStatementsMap(stmts)
      setBanks(banksRes.data ?? [])
      if (banksRes.data?.length) setBankId(banksRes.data[0].id)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id])

  const cardMap = Object.fromEntries(cards.map(c => [c.id, c]))

  const handlePay = async () => {
    if (!selectedBill || !bankId) return

    setPaying(true)
    setError('')

    const billAmount = selectedBill.displayAmount ?? (Number(selectedBill.amount) || 0)
    if (billAmount <= 0) {
      setError(t('invalidAmount'))
      setPaying(false)
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const currentMonth = getCurrentBillingMonth()

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      bank_id: bankId,
      type: 'expense',
      category: 'bills',
      amount: billAmount,
      description: selectedBill.name,
      transaction_date: today,
    })

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

    let { error: billUpdateError } = await supabase
      .from('bills')
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        billing_month: currentMonth,
      })
      .eq('id', selectedBill.id)

    if (billUpdateError) {
      const fallback = await supabase
        .from('bills')
        .update({ category: `paid:${currentMonth}` })
        .eq('id', selectedBill.id)
      billUpdateError = fallback.error
    }

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
              const amount = bill.displayAmount ?? getBillDisplayAmount(bill, cardMap, statementsMap)
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
                    }`}>
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

  return (
    <div className="p-6 pb-8">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">{t('confirmPayment')}</p>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      <div className="bg-lala-50 rounded-2xl p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800">{selectedBill?.name}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{formatMoney(amount)}</p>
      </div>

      <div className="mb-6">
        <label className="text-xs text-gray-400 mb-1 block">{t('deductFrom')}</label>
        <select
          value={bankId}
          onChange={e => setBankId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-lala-400"
        >
          {banks.length === 0 && <option value="">{t('noBanksHint')}</option>}
          {banks.map(b => (
            <option key={b.id} value={b.id}>{getBankDropdownLabel(b)}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={!bankId || paying}
        className="w-full py-4 rounded-2xl bg-lala-600 text-white font-semibold disabled:opacity-30"
      >
        {paying ? t('loading') : t('confirm')}
      </button>
      <button type="button" onClick={() => setStep(1)} className="w-full py-3 text-sm text-gray-400 mt-2">
        ← {t('back')}
      </button>
    </div>
  )
}
