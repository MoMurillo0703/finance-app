/*
-- Run in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS loans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  loan_type text NOT NULL, -- 'auto' | 'mortgage' | 'personal' | 'heloc' | 'student' | 'other'
  lender text,
  original_amount numeric NOT NULL,
  current_balance numeric NOT NULL,
  interest_rate numeric NOT NULL, -- APR as percentage e.g. 6.5
  monthly_payment numeric NOT NULL,
  due_day integer, -- day of month payment is due (1-31)
  start_date date,
  end_date date,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own loans" ON loans
  FOR ALL USING (auth.uid() = user_id);
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { LoanFormFields, LoanCalcPreview, resolveEndDate } from './LoanFormFields'
import { useCurrencyInput } from '../../hooks/useCurrencyInput'

export default function EditLoanModal({ loan, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState(loan.name ?? '')
  const [loanType, setLoanType] = useState(loan.loan_type ?? 'auto')
  const [lender, setLender] = useState(loan.lender ?? '')
  const originalAmountInput = useCurrencyInput(loan.original_amount)
  const currentBalanceInput = useCurrencyInput(loan.current_balance)
  const monthlyPaymentInput = useCurrencyInput(loan.monthly_payment)
  const [interestRate, setInterestRate] = useState(String(loan.interest_rate ?? ''))
  const [dueDay, setDueDay] = useState(loan.due_day != null ? String(loan.due_day) : '')
  const [startDate, setStartDate] = useState(loan.start_date ?? '')
  const [endDate, setEndDate] = useState(loan.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError(t('loanNameRequired')); return }
    if (!originalAmountInput.raw || originalAmountInput.numericValue <= 0) { setError(t('invalidAmount')); return }
    if (!currentBalanceInput.raw || currentBalanceInput.numericValue < 0) { setError(t('invalidAmount')); return }
    if (!interestRate || isNaN(interestRate)) { setError(t('invalidAmount')); return }
    if (!monthlyPaymentInput.raw || monthlyPaymentInput.numericValue <= 0) { setError(t('invalidAmount')); return }

    const balance = currentBalanceInput.numericValue
    const payment = monthlyPaymentInput.numericValue
    const rate = parseFloat(interestRate)
    const resolvedEndDate = resolveEndDate(endDate, balance, rate, payment)

    setSaving(true)
    const { error: dbError } = await supabase
      .from('loans')
      .update({
        name: name.trim(),
        loan_type: loanType,
        lender: lender.trim() || null,
        original_amount: originalAmountInput.numericValue,
        current_balance: balance,
        interest_rate: rate,
        monthly_payment: payment,
        due_day: dueDay ? parseInt(dueDay, 10) : null,
        start_date: startDate || null,
        end_date: resolvedEndDate,
      })
      .eq('id', loan.id)

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  const handleMakePayment = async () => {
    const payment = monthlyPaymentInput.numericValue
    const balance = currentBalanceInput.numericValue
    if (!payment || isNaN(payment) || payment <= 0) {
      setError(t('invalidAmount'))
      return
    }
    if (balance <= 0) {
      setError(t('loanAlreadyPaidOff'))
      return
    }

    setPaying(true)
    setError('')

    const today = new Date().toISOString().split('T')[0]
    const newBalance = Math.max(balance - payment, 0)

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'expense',
      description: `${name.trim()} payment`,
      amount: payment,
      category: 'loan',
      transaction_date: today,
    })

    if (txError) {
      setError(txError.message)
      setPaying(false)
      return
    }

    const rate = parseFloat(interestRate)
    const resolvedEndDate = resolveEndDate(endDate, newBalance, rate, payment)

    const { error: loanError } = await supabase
      .from('loans')
      .update({
        current_balance: newBalance,
        end_date: resolvedEndDate,
      })
      .eq('id', loan.id)

    if (loanError) {
      setError(loanError.message)
      setPaying(false)
    } else {
      onSaved()
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error: dbError } = await supabase
      .from('loans')
      .update({ is_active: false })
      .eq('id', loan.id)

    if (dbError) {
      setError(dbError.message)
      setDeleting(false)
      return
    }

    await supabase
      .from('bills')
      .update({ is_active: false })
      .eq('loan_id', loan.id)

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('editLoan')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <LoanFormFields
          name={name} setName={setName}
          loanType={loanType} setLoanType={setLoanType}
          lender={lender} setLender={setLender}
          originalAmountInput={originalAmountInput}
          currentBalanceInput={currentBalanceInput}
          interestRate={interestRate} setInterestRate={setInterestRate}
          monthlyPaymentInput={monthlyPaymentInput}
          dueDay={dueDay} setDueDay={setDueDay}
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
        />

        <LoanCalcPreview
          balance={currentBalanceInput.numericValue}
          rate={interestRate}
          monthlyPayment={monthlyPaymentInput.numericValue}
        />

        <button
          type="button"
          onClick={handleMakePayment}
          disabled={paying || currentBalanceInput.numericValue <= 0}
          className="w-full mt-4 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {paying ? '...' : t('makePayment')}
        </button>

        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full mt-3 py-3 rounded-xl border border-red-200 text-red-500 text-sm disabled:opacity-50"
        >
          {deleting ? '...' : t('delete')}
        </button>
      </div>
    </div>
  )
}
