import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LabelList,
  Cell,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import { getEffectiveRate } from '../../utils/creditCard'
import { calculateNetWorth } from '../../utils/netWorth'
import {
  getMonthBounds,
  isCurrentMonth,
  formatMonthYear,
  getRecentMonthKeys,
  summarizeByCategory,
  PURPLE_SHADES,
  CATEGORY_EMOJI,
} from '../../utils/reports'
import {
  detectRecurring,
  isChargeAlreadyABill,
  formatRecurringDate,
} from '../../utils/recurringDetector'
import { isSpendingTransaction, isIncomeTransaction } from '../../utils/transactionType'
import {
  LOAN_EMOJI,
  calculateLoanStats,
  loanTypeLabel,
  summarizeLoans,
} from '../../utils/loans'
import {
  buildMonthlyTrends,
  averageTrendMetrics,
  formatTrendMonthLabel,
  buildTrendInsight,
} from '../../utils/financialTrends'
import BudgetsScreen from '../budgets/BudgetsScreen'
import DebtPayoffPlanner from '../debt/DebtPayoffPlanner'
import { PageHeader } from '../layout/PageHeader'

const SECTION_CLASS = 'bg-white rounded-2xl mx-4 mb-4 p-4 shadow-sm border border-gray-100'

function SectionTitle({ children }) {
  return <p className="text-sm font-semibold text-gray-700 mb-3">{children}</p>
}

export default function ReportsScreen({ setHideNav, onSettings, showToast }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const now = new Date()
  const [showBudgets, setShowBudgets] = useState(false)
  const [showDebtPlanner, setShowDebtPlanner] = useState(false)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthTransactions, setMonthTransactions] = useState([])
  const [recurringTransactions, setRecurringTransactions] = useState([])
  const [interestTransactions, setInterestTransactions] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [loans, setLoans] = useState([])
  const [banks, setBanks] = useState([])
  const [bills, setBills] = useState([])
  const [convertingCharge, setConvertingCharge] = useState(null)
  const [trendTransactions, setTrendTransactions] = useState([])
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
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const trendStart = sixMonthsAgo.toISOString().split('T')[0]

  useEffect(() => {
    setHideNav?.(showBudgets || showDebtPlanner)
    return () => setHideNav?.(false)
  }, [showBudgets, showDebtPlanner, setHideNav])

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
        trendRes,
        banksRes,
        billsRes,
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category, credit_card_id, is_transfer')
          .eq('user_id', user.id)
          .gte('transaction_date', firstDay)
          .lte('transaction_date', lastDay)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category, is_transfer')
          .eq('user_id', user.id)
          .gte('transaction_date', `${recurringStart}-01`)
          .lte('transaction_date', recurringBounds.lastDay)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category, credit_card_id, is_transfer')
          .eq('user_id', user.id)
          .gte('transaction_date', yearStart)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('loans')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('transactions')
          .select('type, amount, transaction_date, category, is_transfer')
          .eq('user_id', user.id)
          .gte('transaction_date', trendStart)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('banks')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('bills')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      if (!active) return

      const interestRows = (interestRes.data ?? []).filter(tx =>
        tx.category === 'interest'
        || (tx.description && /interest charged/i.test(tx.description)),
      )

      setMonthTransactions(monthRes.data ?? [])
      setRecurringTransactions(recurringRes.data ?? [])
      setInterestTransactions(interestRows)
      setCreditCards(cardsRes.data ?? [])
      setLoans(loansRes.data ?? [])
      setBanks(banksRes.data ?? [])
      setBills(billsRes.data ?? [])
      setTrendTransactions(trendRes.data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, firstDay, lastDay, recurringStart, recurringBounds.lastDay, yearStart, trendStart])

  const trendBuckets = useMemo(
    () => buildMonthlyTrends(trendTransactions, 6),
    [trendTransactions],
  )

  const trendMetrics = useMemo(
    () => averageTrendMetrics(trendBuckets),
    [trendBuckets],
  )

  const trendChartData = useMemo(
    () => trendBuckets.map(bucket => ({
      ...bucket,
      label: formatTrendMonthLabel(bucket.year, bucket.month, i18n.language),
    })),
    [trendBuckets, i18n.language],
  )

  const trendInsight = useMemo(
    () => buildTrendInsight(trendMetrics, t, formatMoney),
    [trendMetrics, t],
  )

  const monthsWithTrendData = useMemo(
    () => trendBuckets.filter(b => b.income > 0 || b.expenses > 0).length,
    [trendBuckets],
  )

  const showIncomeTrendLine = useMemo(
    () => trendBuckets.some(b => b.income > 0),
    [trendBuckets],
  )

  const locale = i18n.language === 'es' ? 'es-CO' : 'en-US'

  const convertToBill = useCallback(async (charge) => {
    const dueDay = new Date(charge.lastCharged).getDate()
    const displayName = charge.name.charAt(0).toUpperCase() + charge.name.slice(1)
    const row = {
      user_id: user.id,
      name: displayName,
      amount: Math.round(charge.amount * 100) / 100,
      due_day: dueDay,
      frequency: 'monthly',
      category: charge.category || 'subscriptions',
      is_active: true,
      auto_detected: true,
    }

    setConvertingCharge(charge.name)
    let { data, error } = await supabase.from('bills').insert(row).select().single()

    if (error && (error.message.includes('frequency') || error.message.includes('auto_detected'))) {
      const { frequency: _f, auto_detected: _a, ...fallbackRow } = row
      ;({ data, error } = await supabase.from('bills').insert(fallbackRow).select().single())
    }

    setConvertingCharge(null)

    if (error) {
      showToast?.(error.message)
      return
    }

    setBills(prev => [...prev, data ?? { name: displayName, amount: row.amount }])
    showToast?.(t('billAdded'))
  }, [user.id, showToast, t])

  const shiftMonth = (delta) => {
    const date = new Date(year, month - 1 + delta, 1)
    setYear(date.getFullYear())
    setMonth(date.getMonth() + 1)
  }

  const totalSpent = monthTransactions
    .filter(tx => isSpendingTransaction(tx))
    .reduce((sum, tx) => sum + tx.amount, 0)

  const totalIncome = monthTransactions
    .filter(tx => isIncomeTransaction(tx))
    .reduce((sum, tx) => sum + tx.amount, 0)

  const netCashflow = totalIncome - totalSpent
  const dayOfMonth = isCurrentMonth(year, month) ? now.getDate() : daysInMonth
  const projectedMonthEnd = isCurrentMonth(year, month) && dayOfMonth > 0
    ? (totalSpent / dayOfMonth) * daysInMonth
    : totalSpent

  const { breakdown } = summarizeByCategory(monthTransactions, t)

  const chartData = breakdown.map(row => ({
    ...row,
    amountLabel: formatMoney(row.amount),
  }))

  const recurringCharges = useMemo(
    () => detectRecurring(recurringTransactions),
    [recurringTransactions],
  )
  const confirmedRecurring = recurringCharges
  const totalMonthlyRecurring = confirmedRecurring.reduce((sum, item) => sum + item.amount, 0)

  const monthlyIncomes = recentMonthKeys.map(key => {
    const [y, m] = key.split('-').map(Number)
    const bounds = getMonthBounds(y, m)
    return recurringTransactions
      .filter(tx =>
        isIncomeTransaction(tx)
        && tx.transaction_date >= bounds.firstDay
        && tx.transaction_date <= bounds.lastDay,
      )
      .reduce((sum, tx) => sum + tx.amount, 0)
  })
  const avgMonthlyIncome = monthlyIncomes.reduce((sum, value) => sum + value, 0)
    / Math.max(monthlyIncomes.filter(Boolean).length, 1)
  const recurringWarning = avgMonthlyIncome > 0 && totalMonthlyRecurring > avgMonthlyIncome * 0.3

  const cardMap = Object.fromEntries(creditCards.map(card => [card.id, card.name]))

  const {
    totalAssets,
    totalCreditCardDebt,
    totalLoanDebt,
    netWorth,
  } = calculateNetWorth({ banks, creditCards, loans })

  const activeCardsWithBalance = creditCards.filter(c => c.is_active && c.current_balance > 0)
  const activeLoansWithBalance = loans.filter(l => l.is_active && l.current_balance > 0)

  const totalMonthlyInterest = [
    ...activeCardsWithBalance.map(card => {
      const rate = getEffectiveRate(card)
      return card.current_balance * (rate / 100 / 12)
    }),
    ...activeLoansWithBalance.map(loan =>
      loan.current_balance * ((loan.interest_rate || 0) / 100 / 12),
    ),
  ].reduce((sum, value) => sum + value, 0)
  const interestByCard = interestTransactions.reduce((acc, tx) => {
    const key = tx.credit_card_id || 'unknown'
    if (!acc[key]) acc[key] = { name: cardMap[key] || t('unknownAccount'), total: 0 }
    acc[key].total += tx.amount
    return acc
  }, {})
  const interestYTD = interestTransactions.reduce((sum, tx) => sum + tx.amount, 0)

  const { active: activeLoans, totalInterestRemaining, totalMonthlyPayments } = summarizeLoans(loans)

  return (
    <div className="bg-lala-50 pb-6 min-h-full">
      <PageHeader title={t('reports')} onSettings={onSettings} />
      <div className="flex justify-end px-5 pb-2">
        <button
          type="button"
          onClick={() => setShowBudgets(true)}
          className="text-sm text-purple-600 font-medium flex items-center gap-1"
        >
          🎯 {t('budgets')}
        </button>
      </div>

      <section className={SECTION_CLASS}>
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
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-4 mb-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t('totalSpent')}</p>
              <p className="text-xl font-bold text-red-500">{formatMoney(totalSpent)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t('totalIncome')}</p>
              <p className="text-xl font-bold text-green-500">{formatMoney(totalIncome)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t('netCashflow')}</p>
              <p className={`text-xl font-bold ${netCashflow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatMoney(netCashflow)}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t('projectedMonthEnd')}</p>
              <p className="text-xl font-bold text-purple-600">{formatMoney(projectedMonthEnd)}</p>
            </div>
          </div>

          <section className={SECTION_CLASS}>
            <SectionTitle>{t('spendingByCategory')}</SectionTitle>
            {breakdown.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">{t('noTransactionsMonth')}</p>
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

                <div className="mt-5 space-y-4">
                  {breakdown.map(row => (
                    <div key={row.category}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-gray-700 truncate">
                          {CATEGORY_EMOJI[row.category] || CATEGORY_EMOJI.other} {row.label}
                        </span>
                        <span className="font-semibold text-gray-800 shrink-0">
                          {formatMoney(row.amount)}
                          <span className="text-gray-400 font-normal ml-1.5">
                            {row.percentage.toFixed(1)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-500"
                          style={{ width: `${Math.min(row.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className={SECTION_CLASS}>
            <SectionTitle>{t('financialTrends')}</SectionTitle>
            {monthsWithTrendData < 2 ? (
              <p className="text-sm text-gray-400 text-center py-8">{t('notEnoughTrendData')}</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} width={48} />
                    <Tooltip formatter={(value) => formatMoney(value)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {showIncomeTrendLine && (
                      <Line
                        type="monotone"
                        dataKey="income"
                        name={t('income')}
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      name={t('expense')}
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name={t('netCashflow')}
                      stroke="#9333ea"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <div className="mt-4 space-y-2 text-sm text-gray-600">
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    <span className="font-semibold text-gray-700">3-month avg:</span>
                    {showIncomeTrendLine && (
                      <span>{t('avgIncome')} {formatMoney(trendMetrics.avg3Income)}</span>
                    )}
                    <span>{t('avgExpenses')} {formatMoney(trendMetrics.avg3Expenses)}</span>
                    <span>
                      {t('avgNet')} {trendMetrics.avg3Net >= 0 ? '+' : ''}{formatMoney(trendMetrics.avg3Net)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    <span className="font-semibold text-gray-700">6-month avg:</span>
                    {showIncomeTrendLine && (
                      <span>{t('avgIncome')} {formatMoney(trendMetrics.avg6Income)}</span>
                    )}
                    <span>{t('avgExpenses')} {formatMoney(trendMetrics.avg6Expenses)}</span>
                    <span>
                      {t('avgNet')} {trendMetrics.avg6Net >= 0 ? '+' : ''}{formatMoney(trendMetrics.avg6Net)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm italic text-gray-500">{trendInsight}</p>
              </>
            )}
          </section>

          <section className={SECTION_CLASS}>
            <SectionTitle>{t('netWorth')}</SectionTitle>
            <p className={`text-2xl font-bold mb-1 ${netWorth >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
              {formatMoney(netWorth)}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {formatMoney(totalAssets)} {t('assets')} − {formatMoney(totalCreditCardDebt + totalLoanDebt)} {t('liabilities')}
            </p>
          </section>

          <section className={SECTION_CLASS}>
            <SectionTitle>{t('debtBreakdown')}</SectionTitle>
            {activeCardsWithBalance.length === 0 && activeLoansWithBalance.length === 0 ? (
              <p className="text-xs text-gray-400">{t('noLoans')}</p>
            ) : (
              <>
                {activeCardsWithBalance.map(card => {
                  const rate = getEffectiveRate(card)
                  const monthlyInterest = card.current_balance * (rate / 100 / 12)
                  const utilization = card.credit_limit
                    ? Math.round((card.current_balance / card.credit_limit) * 100)
                    : null
                  return (
                    <div key={card.id} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{card.name}</p>
                        <p className="text-xs text-gray-400">
                          {t('interestPerMonthLine', { rate, amount: formatMoney(monthlyInterest) })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-500">{formatMoney(card.current_balance)}</p>
                        {utilization != null && (
                          <p className="text-xs text-gray-400">
                            {utilization}% {t('utilized')}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {activeLoansWithBalance.map(loan => {
                  const monthlyInterest = loan.current_balance * ((loan.interest_rate || 0) / 100 / 12)
                  return (
                    <div key={loan.id} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{loan.name}</p>
                        <p className="text-xs text-gray-400">
                          {t('interestPerMonthLine', { rate: loan.interest_rate, amount: formatMoney(monthlyInterest) })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-500">{formatMoney(loan.current_balance)}</p>
                        {loan.monthly_payment > 0 && (
                          <p className="text-xs text-gray-400">
                            {t('paymentPerMonth', { amount: formatMoney(loan.monthly_payment) })}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}

                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                  <p className="text-sm text-gray-500">{t('totalMonthlyInterest')}</p>
                  <p className="font-bold text-red-500">{formatMoney(totalMonthlyInterest)}</p>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-sm text-gray-500">{t('totalYearlyInterest')}</p>
                  <p className="font-bold text-red-500">{formatMoney(totalMonthlyInterest * 12)}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDebtPlanner(true)}
                  className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 transition-colors"
                >
                  {t('payoffPlannerLink')} →
                </button>
              </>
            )}
          </section>

          <section className={SECTION_CLASS}>
            <SectionTitle>{t('assetBreakdown')}</SectionTitle>
            {banks.filter(b => b.is_active).length === 0 ? (
              <p className="text-xs text-gray-400">{t('noAccounts')}</p>
            ) : (
              <>
                {banks.filter(b => b.is_active).map(bank => (
                  <div key={bank.id} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {bank.nickname ? `${bank.nickname} (${bank.name})` : bank.name}
                      </p>
                      <p className="text-xs text-gray-400 capitalize">{bank.type}</p>
                    </div>
                    <p className="font-bold text-green-600">{formatMoney(bank.balance)}</p>
                  </div>
                ))}

                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                  <p className="text-sm text-gray-500">{t('totalAssets')}</p>
                  <p className="font-bold text-green-600">{formatMoney(totalAssets)}</p>
                </div>
              </>
            )}
          </section>

          <section className={`${SECTION_CLASS} ${recurringWarning ? 'border-amber-300 bg-amber-50/40' : ''}`}>
            <SectionTitle>{t('detectedRecurringCharges')}</SectionTitle>
            {recurringCharges.length === 0 ? (
              <p className="text-xs text-gray-400">{t('noTransactionsMonth')}</p>
            ) : (
              <div className="space-y-2">
                {recurringCharges.map(charge => {
                  const alreadyABill = isChargeAlreadyABill(charge, bills)
                  return (
                    <div
                      key={charge.name}
                      className="flex items-center justify-between p-4 rounded-2xl mb-2"
                      style={{ backgroundColor: '#F9FAFB', border: '1px solid #F3F4F6' }}
                    >
                      <div className="min-w-0 pr-3">
                        <p className="font-semibold text-gray-900 capitalize">{charge.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatMoney(charge.amount)}/mo · {charge.occurrences}x {t('detected')} · {t('nextExpected', { date: formatRecurringDate(charge.nextExpected, locale) })}
                        </p>
                      </div>
                      {alreadyABill ? (
                        <span
                          className="text-xs px-3 py-1.5 rounded-full font-medium shrink-0"
                          style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}
                        >
                          ✓ {t('inBills')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => convertToBill(charge)}
                          disabled={convertingCharge === charge.name}
                          className="text-xs px-3 py-1.5 rounded-full font-medium shrink-0 disabled:opacity-50"
                          style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}
                        >
                          {convertingCharge === charge.name ? '...' : t('addBillAction')}
                        </button>
                      )}
                    </div>
                  )
                })}
                {confirmedRecurring.length > 0 && (
                  <div className="pt-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">{t('monthlyCommitments')}</p>
                    <p className={`text-sm font-bold ${recurringWarning ? 'text-amber-700' : 'text-gray-900'}`}>
                      {formatMoney(totalMonthlyRecurring)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={SECTION_CLASS}>
            <SectionTitle>{t('interestTracker')}</SectionTitle>
            <p className="text-sm text-gray-700 mb-3">
              {t('interestYTD', { amount: formatMoney(interestYTD) })}
            </p>
            {Object.keys(interestByCard).length === 0 ? (
              <p className="text-xs text-gray-400">{t('noTransactionsMonth')}</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(interestByCard).map(([cardId, info]) => (
                  <div key={cardId} className="flex items-center justify-between text-sm">
                    <p className="text-gray-700">{info.name}</p>
                    <p className="font-semibold text-red-600">{formatMoney(info.total)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={SECTION_CLASS}>
            <SectionTitle>{t('debtOverview')}</SectionTitle>
            {activeLoans.length === 0 ? (
              <p className="text-xs text-gray-400">{t('noLoans')}</p>
            ) : (
              <div className="space-y-4">
                {activeLoans.map(loan => {
                  const stats = calculateLoanStats(
                    loan.current_balance,
                    loan.interest_rate,
                    loan.monthly_payment,
                  )
                  return (
                    <div key={loan.id}>
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
                <div className="pt-2 space-y-2">
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
        </>
      )}

      {showBudgets && (
        <BudgetsScreen onClose={() => setShowBudgets(false)} />
      )}

      {showDebtPlanner && (
        <DebtPayoffPlanner
          onClose={() => setShowDebtPlanner(false)}
          setHideNav={setHideNav}
        />
      )}
    </div>
  )
}
