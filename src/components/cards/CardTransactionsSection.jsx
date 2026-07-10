import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { txTypeLabel, txAmountClass, txAmountPrefix } from '../../utils/transactionType'

export default function CardTransactionsSection({ card, refreshKey }) {
  const { t } = useTranslation()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const currency = card.currency || 'COP'

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, type, amount, description, transaction_date, category')
        .eq('credit_card_id', card.id)
        .order('transaction_date', { ascending: false })
        .limit(50)

      if (!active) return
      if (error) console.error('Failed to fetch card transactions:', error)
      setTransactions(data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [card.id, refreshKey])

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase mb-2">
        {t('cardTransactions')}
      </p>

      {loading ? (
        <p className="text-gray-400 text-xs py-2">{t('loading')}</p>
      ) : transactions.length === 0 ? (
        <p className="text-gray-400 text-xs">{t('noCardTransactions')}</p>
      ) : (
        <div className="space-y-2">
          {transactions.map(tx => (
            <div
              key={tx.id}
              className="bg-gray-50 border border-gray-100 rounded-lg p-3 flex justify-between items-center gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">
                  {tx.description || txTypeLabel(tx.type, t)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {[formatDate(tx.transaction_date), t(tx.category, { defaultValue: tx.category })].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p className={`text-xs font-semibold shrink-0 ${txAmountClass(tx.type)}`}>
                {txAmountPrefix(tx.type)}{formatMoney(tx.amount, currency)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
