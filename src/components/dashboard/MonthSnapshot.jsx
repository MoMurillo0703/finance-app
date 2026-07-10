import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import {
  getMonthBounds,
  getRecentMonthKeys,
  detectRecurringCharges,
  summarizeByCategory,
  cleanMerchantName,
  CATEGORY_EMOJI,
} from '../../utils/reports'

export default function MonthSnapshot({ refreshKey, onViewReports }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { firstDay, daysInMonth } = getMonthBounds(year, month)
  const monthKeys = getRecentMonthKeys(3)
  const fetchStart = `${monthKeys[0]}-01`

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, type, amount, description, transaction_date, category')
        .eq('user_id', user.id)
        .gte('transaction_date', fetchStart)

      if (!active) return
      setTransactions(data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey, fetchStart])

  if (loading) return null

  const thisMonth = transactions.filter(tx => tx.transaction_date >= firstDay)
  if (thisMonth.length === 0) return null

  const totalSpent = thisMonth
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const totalIncome = thisMonth
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const dayOfMonth = now.getDate()
  const projected = dayOfMonth > 0 ? (totalSpent / dayOfMonth) * daysInMonth : 0

  const lastMonthKey = monthKeys[monthKeys.length - 2]
  const lastMonthTotal = transactions
    .filter(tx => tx.type === 'expense' && tx.transaction_date?.slice(0, 7) === lastMonthKey)
    .reduce((sum, tx) => sum + tx.amount, 0)

  let barColor = 'bg-purple-600'
  if (totalIncome > 0 && projected > totalIncome) {
    barColor = 'bg-red-500'
  } else if (lastMonthTotal > 0 && projected > lastMonthTotal) {
    barColor = 'bg-amber-500'
  }
  const fillPercent = projected > 0 ? Math.min((totalSpent / projected) * 100, 100) : 0

  const { breakdown } = summarizeByCategory(thisMonth, t)
  const topCategories = breakdown.slice(0, 3)

  const recurringMerchants = new Set(
    detectRecurringCharges(transactions, monthKeys).map(item => item.merchant),
  )
  const recurringThisMonth = thisMonth
    .filter(tx => tx.type === 'expense' && recurringMerchants.has(cleanMerchantName(tx.description)))
    .reduce((sum, tx) => sum + tx.amount, 0)

  return (
    <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{t('thisMonth')}</h2>
        <button
          type="button"
          onClick={onViewReports}
          className="text-xs text-purple-600 font-medium"
        >
          {t('seeAll')} →
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-1.5">
        {t('spentOfProjected', {
          spent: formatMoney(totalSpent),
          projected: formatMoney(projected),
        })}
      </p>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {topCategories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {topCategories.map(row => (
            <button
              key={row.category}
              type="button"
              onClick={onViewReports}
              className="flex items-center gap-1 rounded-full bg-gray-50 border border-gray-100 px-2.5 py-1 text-xs text-gray-700"
            >
              <span>{CATEGORY_EMOJI[row.category] || CATEGORY_EMOJI.other}</span>
              <span className="font-medium">{row.label}</span>
              <span className="font-semibold">{formatMoney(row.amount)}</span>
            </button>
          ))}
        </div>
      )}

      {recurringThisMonth > 0 && (
        <button
          type="button"
          onClick={onViewReports}
          className="mt-3 w-full text-left text-xs text-amber-700 font-medium"
        >
          🔁 {t('recurringThisMonth', { amount: formatMoney(recurringThisMonth) })}
        </button>
      )}
    </div>
  )
}
