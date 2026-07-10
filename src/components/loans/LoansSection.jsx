import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../utils/currency'
import {
  LOAN_EMOJI,
  calculateLoanStats,
  loanTypeLabel,
  summarizeLoans,
} from '../../utils/loans'

export default function LoansSection({ loans, loading, onEdit }) {
  const { t } = useTranslation()
  const { totalDebt, totalMonthlyPayments, active } = summarizeLoans(loans)

  if (loading) {
    return <p className="text-gray-400 text-sm text-center py-6">{t('loading')}</p>
  }

  if (active.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
        <p className="text-gray-400 text-sm">{t('noLoans')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {active.map(loan => {
        const stats = calculateLoanStats(
          loan.current_balance,
          loan.interest_rate,
          loan.monthly_payment,
        )
        const original = Number(loan.original_amount) || 0
        const balance = Number(loan.current_balance) || 0
        const paidPercent = original > 0
          ? Math.min(((original - balance) / original) * 100, 100)
          : 0

        return (
          <div
            key={loan.id}
            className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <button
                type="button"
                onClick={() => onEdit?.(loan)}
                className="text-left flex-1 min-w-0"
              >
                <p className="text-sm font-semibold text-gray-800">
                  {LOAN_EMOJI[loan.loan_type] || LOAN_EMOJI.other} {loan.name}
                </p>
                <p className="text-xs text-gray-400">
                  {loan.lender ? `${loan.lender} · ` : ''}{loanTypeLabel(loan.loan_type, t)}
                </p>
              </button>
              <div className="text-right shrink-0 pl-3">
                <p className="text-base font-bold text-gray-800">{formatMoney(balance)}</p>
                <p className="text-[10px] text-gray-400">{t('of')} {formatMoney(original)}</p>
                <button
                  type="button"
                  onClick={() => onEdit?.(loan)}
                  className="text-[10px] text-purple-600 mt-1"
                >
                  {t('edit')}
                </button>
              </div>
            </div>

            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
              <div
                className="bg-purple-400 h-1.5 rounded-full"
                style={{ width: `${paidPercent}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-gray-400">
              <span>{t('interestRateShort', { rate: loan.interest_rate })}</span>
              <span>{t('paymentPerMonth', { amount: formatMoney(loan.monthly_payment) })}</span>
              {stats.monthsToPayoff != null && (
                <span>{stats.monthsToPayoff} {t('monthsLeft')}</span>
              )}
            </div>
          </div>
        )
      })}

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">{t('totalDebt')}</span>
          <span className="font-bold text-gray-800">{formatMoney(totalDebt)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{t('totalMonthlyPayments')}</span>
          <span className="font-bold text-gray-800">{formatMoney(totalMonthlyPayments)}</span>
        </div>
      </div>
    </div>
  )
}
