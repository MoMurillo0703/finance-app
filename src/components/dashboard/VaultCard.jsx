import { useTranslation } from 'react-i18next'

export default function VaultCard({ vault, onClick }) {
  const { t } = useTranslation()

  const formatCOP = (value) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value)

  const percentage = vault.target_amount > 0
    ? Math.min((vault.current_amount / vault.target_amount) * 100, 100)
    : 0

  const className = 'bg-white border border-gray-100 rounded-xl px-3 py-2 w-full text-left'

  const content = (
    <>
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs font-medium text-gray-700 truncate pr-2">{vault.name}</p>
        <p className="text-xs font-semibold text-purple-600 shrink-0">{formatCOP(vault.current_amount)}</p>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-0.5">
        <div
          className="bg-purple-400 h-0.5 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {vault.target_amount > 0 && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          {t('vaultGoal')}: {formatCOP(vault.target_amount)}
        </p>
      )}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
