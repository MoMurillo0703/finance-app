const formatMoney = (value, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(value)

export default function CardRow({ card, utilizationLabel }) {
  const currency = card.currency || 'COP'
  const balance = card.current_balance || 0
  const limit = card.credit_limit || 0
  const utilization = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0

  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 mb-2 w-full text-left">
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs font-medium text-gray-700 truncate pr-2">{card.name}</p>
        <p className="text-xs font-semibold text-purple-600 shrink-0">{formatMoney(balance, currency)}</p>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-0.5">
        <div
          className="bg-purple-400 h-0.5 rounded-full"
          style={{ width: `${utilization}%` }}
        />
      </div>
      {limit > 0 && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          {utilizationLabel}: {Math.round(utilization)}%
        </p>
      )}
    </div>
  )
}
