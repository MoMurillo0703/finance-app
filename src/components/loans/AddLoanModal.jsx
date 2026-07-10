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

export default function AddLoanModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [loanType, setLoanType] = useState('auto')
  const [lender, setLender] = useState('')
  const [originalAmount, setOriginalAmount] = useState('')
  const [currentBalance, setCurrentBalance] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [monthlyPayment, setMonthlyPayment] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError(t('loanNameRequired')); return }
    if (!originalAmount || isNaN(originalAmount)) { setError(t('invalidAmount')); return }
    if (!currentBalance || isNaN(currentBalance)) { setError(t('invalidAmount')); return }
    if (!interestRate || isNaN(interestRate)) { setError(t('invalidAmount')); return }
    if (!monthlyPayment || isNaN(monthlyPayment)) { setError(t('invalidAmount')); return }

    const balance = parseFloat(currentBalance)
    const payment = parseFloat(monthlyPayment)
    const rate = parseFloat(interestRate)
    const resolvedEndDate = resolveEndDate(endDate, balance, rate, payment)

    setSaving(true)
    const { error: dbError } = await supabase.from('loans').insert({
      user_id: user.id,
      name: name.trim(),
      loan_type: loanType,
      lender: lender.trim() || null,
      original_amount: parseFloat(originalAmount),
      current_balance: balance,
      interest_rate: rate,
      monthly_payment: payment,
      due_day: dueDay ? parseInt(dueDay, 10) : null,
      start_date: startDate || null,
      end_date: resolvedEndDate,
      is_active: true,
    })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addLoan')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <LoanFormFields
          name={name} setName={setName}
          loanType={loanType} setLoanType={setLoanType}
          lender={lender} setLender={setLender}
          originalAmount={originalAmount} setOriginalAmount={setOriginalAmount}
          currentBalance={currentBalance} setCurrentBalance={setCurrentBalance}
          interestRate={interestRate} setInterestRate={setInterestRate}
          monthlyPayment={monthlyPayment} setMonthlyPayment={setMonthlyPayment}
          dueDay={dueDay} setDueDay={setDueDay}
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
        />

        <LoanCalcPreview
          balance={currentBalance}
          rate={interestRate}
          monthlyPayment={monthlyPayment}
        />

        <div className="flex gap-3 mt-6">
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
      </div>
    </div>
  )
}
