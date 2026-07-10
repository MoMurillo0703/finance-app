import { useTranslation } from 'react-i18next'
import { formatMoney, getUserCurrency } from '../../utils/currency'

export default function VaultMiniCard({ vault, onClick }) {
  const { t } = useTranslation()
  const currency = getUserCurrency()
  const pct = vault.target_amount > 0
    ? Math.min((vault.current_amount / vault.target_amount) * 100, 100)
    : 0
  const isReady = vault.current_amount >= vault.target_amount && vault.target_amount > 0

  const className = 'min-w-[140px] bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex-shrink-0 text-left'

  const content = (
    <>
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs font-semibold text-gray-700 leading-tight">{vault.name}</p>
        {isReady && (
          <span className="text-[9px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium">
            ✓
          </span>
        )}
      </div>
      <p className="text-base font-bold text-gray-800">{formatMoney(vault.current_amount, currency)}</p>
      {vault.target_amount > 0 && (
        <>
          <p className="text-[10px] text-gray-400 mb-1.5">
            {t('vaultGoal')}: {formatMoney(vault.target_amount, currency)}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-1">
            <div className="bg-purple-400 h-1 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </>
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
