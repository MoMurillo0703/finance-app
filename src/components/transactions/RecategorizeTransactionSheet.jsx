import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import {
  RECATEGORIZE_CATEGORIES,
  CATEGORY_EMOJIS,
  getRecategorizeHighlight,
} from '../../utils/transactionCategories'

export default function RecategorizeTransactionSheet({ transaction, onClose, onSaved }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const activeCategory = getRecategorizeHighlight(transaction)

  const handleSelect = async (newCategory) => {
    if (newCategory === activeCategory) {
      onClose()
      return
    }

    setSaving(true)
    setError('')

    const { error: dbError } = await supabase
      .from('transactions')
      .update({ category: newCategory })
      .eq('id', transaction.id)

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-800 mb-4">{t('recategorize')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-3 mb-5">
          <div>
            <p className="text-xs text-gray-400 mb-1">{t('description')}</p>
            <p className="text-sm text-gray-500">{transaction.description || '—'}</p>
          </div>
          <div className="flex gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">{t('amount')}</p>
              <p className="text-sm font-semibold text-gray-800">{formatMoney(transaction.amount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t('date')}</p>
              <p className="text-sm text-gray-800">{formatDate(transaction.transaction_date)}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-3">{t('category')}</p>
        <div className="grid grid-cols-3 gap-2">
          {RECATEGORIZE_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              disabled={saving}
              onClick={() => handleSelect(cat)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-colors disabled:opacity-50 ${
                activeCategory === cat
                  ? 'border-purple-600 bg-purple-50 text-purple-700 ring-2 ring-purple-400'
                  : 'border-gray-200 text-gray-700 hover:border-purple-300'
              }`}
            >
              <span className="text-lg">{CATEGORY_EMOJIS[cat]}</span>
              <span className="text-center leading-tight">
                {t(`category${cat.charAt(0).toUpperCase()}${cat.slice(1)}`)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
