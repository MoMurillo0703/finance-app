export default function VaultCard({ vault }) {
    const formatCOP = (value) => {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
      }).format(value)
    }
  
    const percentage = vault.target_amount > 0
      ? Math.min((vault.current_amount / vault.target_amount) * 100, 100)
      : 0
  
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-medium text-gray-700">{vault.name}</p>
          <p className="text-sm font-bold text-purple-600">{formatCOP(vault.current_amount)}</p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-purple-400 h-1.5 rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {vault.target_amount > 0 && (
          <p className="text-xs text-gray-400 mt-1">Meta: {formatCOP(vault.target_amount)}</p>
        )}
      </div>
    )
  }