import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { txTypeLabel, txAmountClass, txAmountPrefix } from '../../utils/transactionType'

function groupByMonth(transactions) {
  const groups = {}
  for (const tx of transactions) {
    const monthKey = tx.transaction_date?.slice(0, 7)
    if (!monthKey) continue
    if (!groups[monthKey]) groups[monthKey] = []
    groups[monthKey].push(tx)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, items]) => ({ monthKey, items }))
}

function formatMonthLabel(monthKey, language) {
  const [yyyy, mm] = monthKey.split('-')
  const date = new Date(Number(yyyy), Number(mm) - 1, 1)
  return date.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export default function AccountHistoryModal({ bank, onClose }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedMonths, setExpandedMonths] = useState(new Set())

  const monthGroups = useMemo(() => groupByMonth(transactions), [transactions])

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, type, amount, description, transaction_date, category')
        .eq('user_id', user.id)
        .eq('bank_id', bank.id)
        .order('transaction_date', { ascending: false })

      if (!active) return
      setTransactions(data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, bank.id])

  useEffect(() => {
    if (monthGroups.length > 0) {
      setExpandedMonths(new Set([monthGroups[0].monthKey]))
    }
  }, [monthGroups])

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(monthKey)) next.delete(monthKey)
      else next.add(monthKey)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-gray-50 w-full max-h-[85vh] rounded-t-3xl flex flex-col" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-2 shrink-0" />
        <div className="px-5 pb-3 border-b border-gray-100 shrink-0">
          <p className="text-lg font-bold text-gray-800">{bank.nickname?.trim() || bank.name}</p>
          {bank.nickname?.trim() && (
            <p className="text-xs text-gray-400">{bank.name}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">{t('accountActivity')}</p>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">{t('loading')}</p>
          ) : transactions.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">{t('noAccountTransactions')}</p>
          ) : (
            <div className="space-y-3 pb-4">
              {monthGroups.map(({ monthKey, items }) => {
                const isExpanded = expandedMonths.has(monthKey)
                return (
                  <div key={monthKey} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleMonth(monthKey)}
                      className="w-full px-4 py-3 flex justify-between items-center text-left"
                    >
                      <p className="text-sm font-semibold text-gray-800 capitalize">
                        {formatMonthLabel(monthKey, i18n.language)}
                      </p>
                      <span className="text-gray-400 text-sm">{isExpanded ? '▾' : '▸'}</span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
                        {items.map(tx => (
                          <div
                            key={tx.id}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 flex justify-between items-center"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="text-sm font-medium text-gray-700 truncate">
                                {tx.description || txTypeLabel(tx.type, t)}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {[formatDate(tx.transaction_date), t(tx.category, { defaultValue: tx.category })].join(' · ')}
                              </p>
                            </div>
                            <p className={`text-sm font-bold shrink-0 ${txAmountClass(tx.type)}`}>
                              {txAmountPrefix(tx.type)}{formatMoney(tx.amount)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 pb-6 pt-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-500 bg-white"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
