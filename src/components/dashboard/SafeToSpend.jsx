import { useTranslation } from 'react-i18next'

export default function SafeToSpend({ amount }) {
  const { t } = useTranslation()

  return (
    <div className="bg-purple-600 rounded-3xl p-6 mb-6 text-white">
      <p className="text-sm opacity-80 mb-1">{t('safeToSpend')}</p>
      <p className="text-4xl font-bold mb-2">
        {new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          minimumFractionDigits: 0,
        }).format(amount)}
      </p>
      <p className="text-sm opacity-70">{t('safeToSpendSubtitle')}</p>
    </div>
  )
}