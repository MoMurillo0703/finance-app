import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../utils/currency'

export function getUtilizationMeta(pct) {
  if (pct <= 10) return { bar: '#16A34A', labelKey: 'utilizationExcellent', bg: '#DCFCE7' }
  if (pct <= 30) return { bar: '#65A30D', labelKey: 'utilizationGood', bg: '#ECFCCB' }
  if (pct <= 50) return { bar: '#D97706', labelKey: 'utilizationFair', bg: '#FEF3C7' }
  if (pct <= 70) return { bar: '#EA580C', labelKey: 'utilizationHigh', bg: '#FFF7ED' }
  return { bar: '#DC2626', labelKey: 'utilizationCritical', bg: '#FEF2F2' }
}

export function getUtilizationPercent(currentBalance, creditLimit) {
  if (!creditLimit || creditLimit <= 0) return 0
  return Math.min((Number(currentBalance) || 0) / creditLimit * 100, 100)
}

export function getUtilizationColor(card) {
  const pct = getUtilizationPercent(card?.current_balance, card?.credit_limit)
  if (!card?.credit_limit || card.credit_limit <= 0) return '#9CA3AF'
  return getUtilizationMeta(pct).bar
}

export function CreditUtilizationBar({
  currentBalance,
  creditLimit,
  showLabel = true,
  currency,
}) {
  const { t } = useTranslation()

  if (!creditLimit || creditLimit <= 0) return null

  const utilization = getUtilizationPercent(currentBalance, creditLimit)
  const { bar, labelKey, bg } = getUtilizationMeta(utilization)

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-500 font-medium">{t('creditUtilization')}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold" style={{ color: bar }}>
              {utilization.toFixed(1)}%
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: bg, color: bar }}
            >
              {t(labelKey)}
            </span>
          </div>
        </div>
      )}

      <div className={`w-full rounded-full bg-gray-100 overflow-hidden ${showLabel ? 'h-2.5' : 'h-1.5'}`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${utilization}%`, backgroundColor: bar }}
        />
      </div>

      {showLabel && (
        <div className="relative w-full mt-1">
          {[10, 30, 50, 70].map(threshold => (
            <div
              key={threshold}
              className="absolute top-0 w-px h-2 bg-gray-300"
              style={{ left: `${threshold}%` }}
            />
          ))}
          <div className="flex justify-between text-gray-300 mt-2" style={{ fontSize: '9px' }}>
            <span>0%</span>
            <span style={{ marginLeft: '6%' }}>10%</span>
            <span style={{ marginLeft: '14%' }}>30%</span>
            <span style={{ marginLeft: '14%' }}>50%</span>
            <span style={{ marginLeft: '14%' }}>70%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {showLabel && (
        <p className="text-xs text-gray-400 mt-2">
          {t('limitUsed', {
            balance: formatMoney(currentBalance, currency),
            limit: formatMoney(creditLimit, currency),
          })}
        </p>
      )}
    </div>
  )
}

export default CreditUtilizationBar
