import { useTranslation } from 'react-i18next'
import { formatMoney, isLatAmUser } from '../../utils/currency'
import { calculateMinimumPayment } from '../../utils/cards'

export default function CardEstimatorPanel({ card, cuotas = [] }) {
  const { t } = useTranslation()
  const latAmUser = isLatAmUser()
  const currency = card.currency || 'COP'
  const currentBalance = card.current_balance || 0
  const estimate = calculateMinimumPayment(card, latAmUser ? cuotas : [])
  const showCuotaWarning = latAmUser && currentBalance > 0 && estimate.cuotaCommitment > currentBalance * 0.40

  return (
    <div className="space-y-3">
      {showCuotaWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-amber-800">{t('cuotaWarning')}</p>
        </div>
      )}

      {estimate.showInterestWarning && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-red-700">⚠️ {t('interestWarning')}</p>
        </div>
      )}

      <div className="bg-lala-50 border border-gray-100 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200 flex justify-between text-[10px] text-gray-600">
          <span>{t('interestRateShort', { rate: estimate.apr.toFixed(2) })}</span>
          <span>
            {t('monthlyRate')}: {(estimate.monthlyRate * 100).toFixed(2)}%
          </span>
        </div>

        <div className="p-3 space-y-2">
          <p className="text-[10px] font-semibold text-gray-700">{t('minimumBreakdown')}</p>

          <div className="flex justify-between items-center gap-2 text-[10px]">
            <p className="text-gray-500">{t('baseMinimum')}</p>
            <p className="font-medium text-gray-800">{formatMoney(estimate.minimumBase, currency)}</p>
          </div>
          <div className="flex justify-between items-center gap-2 text-[10px]">
            <p className="text-gray-500">+ {t('monthlyInterest')}</p>
            <p className="font-medium text-gray-800">{formatMoney(estimate.monthlyInterest, currency)}</p>
          </div>
          {latAmUser && (
          <div className="flex justify-between items-center gap-2 text-[10px]">
            <p className="text-gray-500">+ {t('cuotaPayments')}</p>
            <p className="font-medium text-gray-800">{formatMoney(estimate.cuotaCommitment, currency)}</p>
          </div>
          )}

          <div className="border-t border-gray-200 pt-2 flex justify-between items-center gap-2">
            <p className="text-[10px] font-bold text-gray-800 uppercase">{t('totalDue')}</p>
            <p className="text-xs font-bold text-gray-900">{formatMoney(estimate.totalMinimum, currency)}</p>
          </div>
        </div>

        <div className="px-3 py-2 border-t border-gray-200 space-y-2">
          <div className="flex justify-between items-center gap-2 text-[10px]">
            <p className="text-gray-500">{t('estNextStatement')}</p>
            <p className="font-medium text-gray-800">{formatMoney(currentBalance, currency)}</p>
          </div>
          <div className="flex justify-between items-center gap-2 text-[10px]">
            <p className="text-gray-500">{t('monthsToPayoff')}*</p>
            <p className="font-medium text-gray-800">
              {estimate.monthsToPayoff != null
                ? `${estimate.monthsToPayoff} ${t('monthsLeft')}`
                : '—'}
            </p>
          </div>
          <div className="flex justify-between items-center gap-2 text-[10px]">
            <p className="text-gray-500">{t('totalInterestCost')}</p>
            <p className="font-medium text-red-600">
              {estimate.totalInterestCost != null
                ? formatMoney(estimate.totalInterestCost, currency)
                : '—'}
            </p>
          </div>
          <p className="text-[9px] text-gray-400 italic">* {t('payingMinimumOnly')}</p>
        </div>
      </div>

      {latAmUser && cuotas.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-gray-500 mb-2">{t('payoffTimeline')}</p>
          <div className="space-y-1.5">
            {cuotas.map(cuota => {
              const monthsLeft = Math.max(0, (cuota.total_cuotas || 0) - (cuota.paid_cuotas || 0))
              return (
                <div
                  key={cuota.id}
                  className="flex justify-between items-center gap-2 text-[10px]"
                >
                  <p className="text-gray-600 truncate">{cuota.description}</p>
                  <p className="text-gray-400 shrink-0">{t('monthsRemaining', { count: monthsLeft })}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
