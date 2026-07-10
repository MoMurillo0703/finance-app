import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../utils/currency'

export default function VaultCard({ vault, onClick }) {
  const { t } = useTranslation()

  const percentage = vault.target_amount > 0
    ? Math.min((vault.current_amount / vault.target_amount) * 100, 100)
    : 0

  const currentAmount = vault.current_amount || 0
  const isReady = vault.target_amount > 0 && currentAmount === 0

  const className = 'bg-white border border-gray-100 rounded-xl px-4 py-3 mb-2 w-full text-left'

  const content = (
    <>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-xs font-medium text-gray-700 truncate">{vault.name}</p>
          {isReady && (
            <span className="text-[10px] font-medium text-green-600 shrink-0">✓ {t('vaultReady')}</span>
          )}
        </div>
        {currentAmount > 0 && (
          <p className="text-xs font-semibold text-purple-600 shrink-0">{formatMoney(currentAmount)}</p>
        )}
        {!isReady && currentAmount === 0 && (
          <p className="text-xs font-semibold text-purple-600 shrink-0">{formatMoney(0)}</p>
        )}
      </div>
      <div className="w-full bg-gray-100 rounded-full h-0.5">
        <div
          className="bg-purple-400 h-0.5 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {vault.target_amount > 0 && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          {t('vaultGoal')}: {formatMoney(vault.target_amount)}
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
