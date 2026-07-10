import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../utils/currency'

export default function SafeToSpend({ amount }) {
  const { t } = useTranslation()

  return (
    <div className="bg-purple-600 rounded-2xl p-4 mb-4 text-white">
      <p className="text-xs opacity-80 mb-0.5">{t('safeToSpend')}</p>
      <p className="text-3xl font-bold mb-1">
        {formatMoney(amount)}
      </p>
      <p className="text-xs opacity-70">{t('safeToSpendSubtitle')}</p>
    </div>
  )
}