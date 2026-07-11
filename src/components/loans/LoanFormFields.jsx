import { useTranslation } from 'react-i18next'
import { getUserCurrency } from '../../utils/currency'
import { formatMoney } from '../../utils/currency'
import { currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import { calculateLoanStats, estimatePayoffDate, LOAN_TYPES, loanTypeLabel } from '../../utils/loans'

export function LoanCalcPreview({ balance, rate, monthlyPayment }) {
  const { t } = useTranslation()
  const stats = calculateLoanStats(balance, rate, monthlyPayment)
  const payoffDate = stats.monthsToPayoff ? estimatePayoffDate(stats.monthsToPayoff) : null

  if (!balance || !monthlyPayment) return null

  return (
    <div className="mt-4 p-4 bg-purple-50 rounded-xl space-y-2 text-xs text-gray-700">
      <p className="font-semibold text-gray-800 mb-2">{t('loanEstimates')}</p>
      <div className="flex justify-between">
        <span className="text-gray-500">{t('monthlyInterestPortion')}</span>
        <span className="font-medium">{formatMoney(stats.interestPortion)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">{t('monthlyPrincipalPortion')}</span>
        <span className="font-medium">{formatMoney(stats.principalPortion)}</span>
      </div>
      {stats.monthsToPayoff != null && (
        <div className="flex justify-between">
          <span className="text-gray-500">{t('monthsLeft')}</span>
          <span className="font-medium">{stats.monthsToPayoff}</span>
        </div>
      )}
      {stats.totalInterestRemaining != null && (
        <div className="flex justify-between">
          <span className="text-gray-500">{t('totalInterestLeft')}</span>
          <span className="font-medium">{formatMoney(stats.totalInterestRemaining)}</span>
        </div>
      )}
      {payoffDate && (
        <div className="flex justify-between">
          <span className="text-gray-500">{t('payoffDate')}</span>
          <span className="font-medium">{payoffDate}</span>
        </div>
      )}
    </div>
  )
}

export function LoanFormFields({
  name, setName,
  loanType, setLoanType,
  lender, setLender,
  originalAmountInput,
  currentBalanceInput,
  interestRate, setInterestRate,
  monthlyPaymentInput,
  dueDay, setDueDay,
  startDate, setStartDate,
  endDate, setEndDate,
}) {
  const { t } = useTranslation()
  const currency = getUserCurrency()

  return (
    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('loanName')}</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          placeholder={t('loanNamePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('loanType')}</label>
        <select
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          value={loanType}
          onChange={e => setLoanType(e.target.value)}
        >
          {LOAN_TYPES.map(type => (
            <option key={type} value={type}>
              {loanTypeLabel(type, t)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('lender')}</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          placeholder={t('lenderPlaceholder')}
          value={lender}
          onChange={e => setLender(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('originalAmount')} ({currency})</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          type="text"
          inputMode="decimal"
          placeholder={currencyAmountPlaceholder(currency)}
          value={originalAmountInput.displayValue}
          onChange={originalAmountInput.handleChange}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('currentBalance')} ({currency})</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          type="text"
          inputMode="decimal"
          placeholder={currencyAmountPlaceholder(currency)}
          value={currentBalanceInput.displayValue}
          onChange={currentBalanceInput.handleChange}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('interestRate')}</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          type="number"
          step="0.01"
          placeholder="6.5"
          value={interestRate}
          onChange={e => setInterestRate(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('monthlyPayment')} ({currency})</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          type="text"
          inputMode="decimal"
          placeholder={currencyAmountPlaceholder(currency)}
          value={monthlyPaymentInput.displayValue}
          onChange={monthlyPaymentInput.handleChange}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('dueDay')}</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          type="number"
          min="1"
          max="31"
          placeholder="1-31"
          value={dueDay}
          onChange={e => setDueDay(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('startDate')}</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">{t('endDate')}</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
        <p className="text-[10px] text-gray-400 mt-1">{t('endDateHint')}</p>
      </div>
    </div>
  )
}

export function resolveEndDate(endDate, balance, rate, monthlyPayment) {
  if (endDate?.trim()) return endDate
  const stats = calculateLoanStats(balance, rate, monthlyPayment)
  return estimatePayoffDate(stats.monthsToPayoff) || null
}
