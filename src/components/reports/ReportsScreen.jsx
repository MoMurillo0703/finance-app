import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LabelList,
  Cell,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import {
  getMonthBounds,
  isCurrentMonth,
  formatMonthYear,
  getRecentMonthKeys,
  detectRecurringCharges,
  summarizeByCategory,
  PURPLE_SHADES,
} from '../../utils/reports'
import {
  LOAN_EMOJI,
  calculateLoanStats,
  loanTypeLabel,
  summarizeLoans,
} from '../../utils/loans'

export default function ReportsScreen() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthTransactions, setMonthTransactions] = useState([])
  const [recurringTransactions, setRecurringTransactions] = useState([])
  const [interestTransactions, setInterestTransactions] = useState([])
  const [cards, setCards] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)

  const { firstDay, lastDay, daysInMonth } = useMemo(
    () => getMonthBounds(year, month),
    [year, month],
  )

  const recentMonthKeys = useMemo(() => getRecentMonthKeys(3), [])
  const recurringStart = recentMonthKeys[0]
  const recurringEnd = recentMonthKeys[recentMonthKeys.length - 1]
  const recurringBounds = useMemo(
    () => getMonthBounds(
      Number(recurringEnd.slice(0, 4)),
      Number(recurringEnd.slice(5, 7)),
    ),
    [recurringEnd],
  )
  const yearStart = `${now.getFullYear()}-01-01`

  useEffect(() => {
    let active = true

    ;(async () => {
      setLoading(true)

      const [
        monthRes,
        recurringRes,
        interestRes,
        cardsRes,
        loansRes,
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category, credit_card_id')
          .eq('user_id', user.id)
          .gte('transaction_date', firstDay)
          .lte('transaction_date', lastDay)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category')
          .eq('user_id', user.id)
          .gte('transaction_date', `${recurringStart}-01`)
          .lte('transaction_date', recurringBounds.lastDay)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category, credit_card_id')
          .eq('user_id', user.id)
          .gte('transaction_date', yearStart)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('credit_cards')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('loans')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
      ])

      if (!active) return

      const interestRows = (interestRes.data ?? []).filter(tx =>
        tx.category === 'interest'
        || (tx.description && /interest charged/i.test(tx.description)),
      )

      setMonthTransactions(monthRes.data ?? [])
      setRecurringTransactions(recurringRes.data ?? [])
      setInterestTransactions(interestRows)
      setCards(cardsRes.data ?? [])
      setLoans(loansRes.data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, firstDay, lastDay, recurringStart, recurringBounds.lastDay, yearStart])

  const shiftMonth = (delta) => {
    const date = new Date(year, month - 1 + delta, 1)
    setYear(date.getFullYear())
    setMonth(date.getMonth() + 1)
  }

  const totalSpent = monthTransactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const totalIncome = monthTransactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const netCashflow = totalIncome - totalSpent
  const dayOfMonth = isCurrentMonth(year, month) ? now.getDate() : daysInMonth
  const projectedMonthEnd = dayOfMonth > 0
    ? (totalSpent / dayOfMonth) * daysInMonth
    : 0

  const { breakdown, totalSpent: categoryTotal } = summarizeByCategory(monthTransactions, t)

  const chartData = breakdown.map(row => ({
    ...row,
    amountLabel: formatMoney(row.amount),
  }))

  const recurringCharges = detectRecurringCharges(recurringTransactions, recentMonthKeys)
  const totalRecurring = recurringCharges.reduce((sum, item) => sum + item.averageAmount, 0)

  const monthlyIncomes = recentMonthKeys.map(key => {
    const [y, m] = key.split('-').map(Number)
    const bounds = getMonthBounds(y, m)
    return recurringTransactions
      .filter(tx =>
        tx.type === 'income'
        && tx.transaction_date >= bounds.firstDay
        && tx.transaction_date <= bounds.lastDay,
      )
      .reduce((sum, tx) => sum + tx.amount, 0)
  })
  const avgMonthlyIncome = monthlyIncomes.reduce((sum, value) => sum + value, 0)
    / Math.max(monthlyIncomes.filter(Boolean).length, 1)
  const recurringWarning = avgMonthlyIncome > 0 && totalRecurring > avgMonthlyIncome * 0.3

  const cardMap = Object.fromEntries(cards.map(card => [card.id, card.name]))
  const interestByCard = interestTransactions.reduce((acc, tx) => {
    const key = tx.credit_card_id || 'unknown'
    if (!acc[key]) acc[key] = { name: cardMap[key] || t('unknownAccount'), total: 0 }
    acc[key].total += tx.amount
    return acc
  }, {})
  const interestYTD = interestTransactions.reduce((sum, tx) => sum + tx.amount, 0)

  const { active: activeLoans, totalInterestRemaining, totalMonthlyPayments } = summarizeLoans(loans)

  return (
    <div className="bg-gray-50 pb-6">
      <div className="px-6 py-6 space-y-6">
        <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="w-10 h-10 rounded-full border border-gray-200 text-gray-500"
              aria-label={t('back')}
            >
              ‹
            </button>
            <p className="text-base font-semibold text-gray-800 capitalize">
              {formatMonthYear(year, month, i18n.language)}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="w-10 h-10 rounded-full border border-gray-200 text-gray-500"
              aria-label={t('next')}
            >
              ›
            </button>
          </div>
        </section>

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('loading')}</p>
        ) : monthTransactions.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
            <p className="text-gray-400 text-sm">{t('noTransactionsMonth')}</p>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3">
              <SummaryCard label={t('totalSpent')} value={formatMoney(totalSpent)} />
              <SummaryCard label={t('totalIncome')} value={formatMoney(totalIncome)} />
              <SummaryCard
                label={t('netCashflow')}
                value={formatMoney(netCashflow)}
                valueClass={netCashflow >= 0 ? 'text-green-600' : 'text-red-600'}
              />
              {isCurrentMonth(year, month) && (
                <SummaryCard
                  label={t('projectedMonthEnd')}
                  value={formatMoney(projectedMonthEnd)}
                />
              )}
            </section>

            <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">{t('spendingByCategory')}</h2>
              {breakdown.length === 0 ? (
                <p className="text-xs text-gray-400">{t('noTransactionsMonth')}</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(breakdown.length * 40, 120)}>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ left: 0, right: 72, top: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide domain={[0, 'dataMax']} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={108}
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                      />
                      <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={18}>
                        {chartData.map((_, index) => (
                          <Cell key={index} fill={PURPLE_SHADES[index % PURPLE_SHADES.length]} />
                        ))}
                        <LabelList dataKey="amountLabel" position="right" style={{ fontSize: 11, fill: '#4b5563' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-4 border-t border-gray-100 pt-3 space-y-2">
                    {breakdown.map(row => (
                      <div key={row.category} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-gray-700">{row.label}</p>
                          <p className="text-xs text-gray-400">
                            {row.count} · {row.percentage.toFixed(1)}%
                          </p>
                        </div>
                        <p className="font-semibold text-gray-800">{formatMoney(row.amount)}</p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-2">
                      <p className="font-semibold text-gray-700">{t('total')}</p>
                      <p className="font-bold text-gray-900">{formatMoney(categoryTotal)}</p>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        <section className={`bg-white border rounded-2xl p-4 shadow-sm ${
          recurringWarning ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'
        }`}>
          <h2 className="text-sm font-semibold text-gray-800 mb-3">{t('recurringCharges')}</h2>
          {recurringCharges.length === 0 ? (
            <p className="text-xs text-gray-400">{t('noTransactionsMonth')}</p>
          ) : (
            <div className="space-y-2">
              {recurringCharges.map(item => (
                <div key={item.merchant} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-700 truncate pr-2">{item.merchant}</p>
                    <p className="text-xs text-gray-400">
                      {item.frequency === 'monthly' ? t('recurring') : t('irregular')}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-800 shrink-0">{formatMoney(item.averageAmount)}</p>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">{t('monthlyCommitments')}</p>
                <p className={`text-sm font-bold ${recurringWarning ? 'text-amber-700' : 'text-gray-900'}`}>
                  {formatMoney(totalRecurring)}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">{t('interestTracker')}</h2>
          <p className="text-sm text-gray-700 mb-3">
            {t('interestYTD', { amount: formatMoney(interestYTD) })}
          </p>
          {Object.keys(interestByCard).length === 0 ? (
            <p className="text-xs text-gray-400">{t('noTransactionsMonth')}</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(interestByCard).map(([cardId, info]) => (
                <div key={cardId} className="flex items-center justify-between text-sm">
                  <p className="text-gray-700">{info.name}</p>
                  <p className="font-semibold text-red-600">{formatMoney(info.total)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">{t('debtOverview')}</h2>
          {activeLoans.length === 0 ? (
            <p className="text-xs text-gray-400">{t('noLoans')}</p>
          ) : (
            <div className="space-y-3">
              {activeLoans.map(loan => {
                const stats = calculateLoanStats(
                  loan.current_balance,
                  loan.interest_rate,
                  loan.monthly_payment,
                )
                return (
                  <div key={loan.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {LOAN_EMOJI[loan.loan_type] || LOAN_EMOJI.other} {loan.name}
                        </p>
                        <p className="text-xs text-gray-400">{loanTypeLabel(loan.loan_type, t)}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-800 shrink-0">
                        {formatMoney(loan.current_balance)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span>{t('interestRateShort', { rate: loan.interest_rate })}</span>
                      <span>{t('paymentPerMonth', { amount: formatMoney(loan.monthly_payment) })}</span>
                      {stats.monthsToPayoff != null && (
                        <span>{stats.monthsToPayoff} {t('monthsLeft')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <p className="text-gray-600">{t('totalInterestLeft')}</p>
                  <p className="font-bold text-red-600">{formatMoney(totalInterestRemaining)}</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <p className="text-gray-600">{t('totalMonthlyLoanCommitment')}</p>
                  <p className="font-bold text-gray-900">{formatMoney(totalMonthlyPayments)}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, valueClass = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-lg font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  )
}
