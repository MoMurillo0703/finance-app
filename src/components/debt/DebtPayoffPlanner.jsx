import { useState, useEffect, useMemo, useCallback } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getRecentMonthKeys } from '../../utils/reports'
import {
  PAYOFF_STRATEGIES,
  buildDebtList,
  hasUpcomingPromoDeadlines,
  averageMonthlyTotals,
  calculateInterestSaved,
  buildStrategyInsight,
  monthsSoonerWithExtra,
  formatPayoffMonth,
  formatPayoffMonthLong,
} from '../../utils/debtPayoff'

const SLIDER_MAX = 500
const SLIDER_STEP = 25

function snapToStep(value) {
  return Math.round(Math.max(0, value) / SLIDER_STEP) * SLIDER_STEP
}

function payOffBadge(index, t) {
  if (index === 0) return t('payOffFirst')
  if (index === 1) return t('payOffSecond')
  if (index === 2) return t('payOffThird')
  return t('payOffNth', { n: index + 1 })
}

export default function DebtPayoffPlanner({ onClose, setHideNav }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const locale = i18n.language === 'es' ? 'es-CO' : 'en-US'
  const [loading, setLoading] = useState(true)
  const [debts, setDebts] = useState([])
  const [avgMonthlyIncome, setAvgMonthlyIncome] = useState(0)
  const [avgMonthlyExpenses, setAvgMonthlyExpenses] = useState(0)
  const [strategy, setStrategy] = useState('avalanche')
  const [strategyReady, setStrategyReady] = useState(false)
  const [extraPayment, setExtraPayment] = useState(0)
  const [suggestedExtra, setSuggestedExtra] = useState(0)

  useEffect(() => {
    setHideNav?.(true)
    return () => setHideNav?.(false)
  }, [setHideNav])

  useEffect(() => {
    let active = true

    ;(async () => {
      setLoading(true)
      const monthKeys = getRecentMonthKeys(3)
      const startKey = monthKeys[0]
      const endKey = monthKeys[monthKeys.length - 1]
      const [startYear, startMonth] = startKey.split('-').map(Number)
      const endBounds = (() => {
        const [y, m] = endKey.split('-').map(Number)
        const lastDay = new Date(y, m, 0).getDate()
        return `${endKey}-${String(lastDay).padStart(2, '0')}`
      })()
      const rangeStart = `${startYear}-${String(startMonth).padStart(2, '0')}-01`

      const [
        cardsRes,
        loansRes,
        promosRes,
        statementsRes,
        txRes,
      ] = await Promise.all([
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('loans')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('promotional_purchases')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gt('remaining_balance', 0),
        supabase
          .from('card_statements')
          .select('*')
          .eq('user_id', user.id)
          .order('statement_date', { ascending: false }),
        supabase
          .from('transactions')
          .select('type, amount, transaction_date')
          .eq('user_id', user.id)
          .gte('transaction_date', rangeStart)
          .lte('transaction_date', endBounds),
      ])

      if (!active) return

      const statementsByCard = (statementsRes.data ?? []).reduce((acc, row) => {
        if (!acc[row.credit_card_id]) acc[row.credit_card_id] = []
        if (acc[row.credit_card_id].length < 12) acc[row.credit_card_id].push(row)
        return acc
      }, {})

      const debtList = buildDebtList({
        creditCards: cardsRes.data ?? [],
        loans: loansRes.data ?? [],
        statementsByCard,
        promotionalPurchases: promosRes.data ?? [],
      })

      const { avgMonthlyIncome: income, avgMonthlyExpenses: expenses } = averageMonthlyTotals(
        txRes.data ?? [],
        monthKeys,
      )

      const totalMinPayments = debtList.reduce((sum, d) => sum + (d.minPayment || 0), 0)
      const disposableIncome = income - expenses
      const available = Math.max(0, disposableIncome - totalMinPayments)

      setDebts(debtList)
      setAvgMonthlyIncome(income)
      setAvgMonthlyExpenses(expenses)
      setSuggestedExtra(available)

      const defaultStrategy = hasUpcomingPromoDeadlines(debtList) ? 'deadline' : 'avalanche'
      setStrategy(defaultStrategy)
      setStrategyReady(true)

      const initialExtra = available > 0 ? snapToStep(Math.min(available, SLIDER_MAX)) : 0
      setExtraPayment(initialExtra)

      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id])

  const totalMinPayments = useMemo(
    () => debts.reduce((sum, d) => sum + (d.minPayment || 0), 0),
    [debts],
  )

  const totalMonthlyPayment = totalMinPayments + extraPayment
  const availableForDebt = suggestedExtra

  const { withExtra, interestSaved } = useMemo(() => {
    if (debts.length === 0) {
      return {
        withExtra: {
          plan: [],
          maxPayoffMonths: 0,
          totalInterestPaid: 0,
          debtFreeDate: null,
        },
        interestSaved: 0,
      }
    }
    return calculateInterestSaved(debts, strategy, extraPayment)
  }, [debts, strategy, extraPayment])

  const monthsSooner = useMemo(
    () => monthsSoonerWithExtra(debts, strategy, extraPayment),
    [debts, strategy, extraPayment],
  )

  const payoffPlan = withExtra.plan
  const maxMonths = withExtra.maxPayoffMonths
  const debtFreeDate = withExtra.debtFreeDate
  const activeStrategy = PAYOFF_STRATEGIES.find(s => s.key === strategy)
  const firstDebtPayoffDate = payoffPlan[0]?.payoffDate ?? null

  const strategyInsight = useMemo(() => {
    if (loading || debts.length === 0) return ''
    return buildStrategyInsight({
      strategy,
      interestSaved,
      firstDebtPayoffDate,
      formatMoney,
      formatPayoffMonthLong: date => formatPayoffMonthLong(date, locale),
      t,
      locale,
    })
  }, [loading, debts.length, strategy, interestSaved, firstDebtPayoffDate, t, locale])

  const handleSliderChange = useCallback(e => {
    setExtraPayment(Number(e.target.value))
  }, [])

  const handleExtraInputChange = useCallback(e => {
    const raw = e.target.value.replace(/[^\d.]/g, '')
    const parsed = parseFloat(raw)
    setExtraPayment(Number.isNaN(parsed) ? 0 : Math.max(0, parsed))
  }, [])

  const sliderValue = Math.min(extraPayment, SLIDER_MAX)

  return (
    <div className="fixed inset-0 z-[130] bg-lala-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white shrink-0">
        <div>
          <p className="text-lg font-bold text-gray-800">{t('debtPayoffPlanner')}</p>
          <p className="text-xs text-gray-400">{t('payoffPlan')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600"
          aria-label={t('close')}
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10">
        {loading || !strategyReady ? (
          <p className="text-gray-400 text-sm text-center py-16">{t('loading')}</p>
        ) : debts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-medium text-gray-600">{t('noActiveDebt')}</p>
            <p className="text-sm mt-1">{t('noActiveDebtHint')}</p>
          </div>
        ) : (
          <>
            <div className="bg-purple-50 rounded-2xl p-4 mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">{t('financialPicture')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">{t('avgMonthlyIncome')}</p>
                  <p className="font-bold text-green-600">{formatMoney(avgMonthlyIncome)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('avgMonthlySpending')}</p>
                  <p className="font-bold text-red-500">{formatMoney(avgMonthlyExpenses)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('totalMinPayments')}</p>
                  <p className="font-bold text-gray-800">{formatMoney(totalMinPayments)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('availableForDebt')}</p>
                  <p className={`font-bold ${availableForDebt > 0 ? 'text-purple-600' : 'text-red-500'}`}>
                    {formatMoney(availableForDebt)}
                  </p>
                </div>
              </div>
              {availableForDebt <= 0 && (
                <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600">
                  ⚠️ {t('expensesExceedIncomeWarning')}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">{t('payoffStrategy')}</p>
              <div className="flex flex-wrap gap-2">
                {PAYOFF_STRATEGIES.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStrategy(s.key)}
                    className={`px-3 py-2 rounded-full text-xs font-medium border transition-colors ${
                      strategy === s.key
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {s.emoji} {t(s.labelKey)}
                  </button>
                ))}
              </div>
              {activeStrategy && (
                <p className="text-xs text-gray-500 mt-3">{t(activeStrategy.descriptionKey)}</p>
              )}

              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">{t('extraPayment')}</p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={SLIDER_MAX}
                    step={SLIDER_STEP}
                    value={sliderValue}
                    onChange={handleSliderChange}
                    className="flex-1 accent-purple-600"
                    aria-label={t('extraPayment')}
                  />
                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={extraPayment === 0 ? '' : String(extraPayment)}
                      onChange={handleExtraInputChange}
                      placeholder="0"
                      className="w-full border border-purple-200 rounded-xl pl-6 pr-2 py-2 text-sm font-bold text-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 text-right"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {t('suggestedExtra', { amount: formatMoney(availableForDebt) })}
                </p>
                {extraPayment > 0 && monthsSooner > 0 && (
                  <p className="text-xs text-purple-600 font-medium mt-1">
                    {t('extraPaymentSooner', {
                      amount: formatMoney(extraPayment),
                      months: monthsSooner,
                    })}
                  </p>
                )}
              </div>
            </div>

            <div
              className="rounded-3xl p-5 mb-4"
              style={{ backgroundColor: '#F5F3FF' }}
            >
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('debtFreeLabel')}</p>
                  <p className="text-sm font-bold text-gray-900">
                    {debtFreeDate ? formatPayoffMonth(debtFreeDate, locale) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('interestSaved')}</p>
                  <p className="text-sm font-bold text-green-600">+{formatMoney(interestSaved)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('monthlyTotal')}</p>
                  <p className="text-sm font-bold text-gray-900">{formatMoney(totalMonthlyPayment)}</p>
                </div>
              </div>
            </div>

            <p className="text-sm font-semibold text-gray-700 mb-3">{t('payoffOrder')}</p>
            {payoffPlan.map((debt, index) => (
              <div key={`${debt.type}-${debt.id}`} className="bg-white rounded-2xl p-4 mb-3 border border-gray-100">
                <div className="flex items-start gap-3">
                  <div
                    className="px-2 py-1 rounded-lg text-xs font-bold shrink-0"
                    style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}
                  >
                    {payOffBadge(index, t)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-semibold text-gray-800 text-sm">{debt.name}</p>
                      <p className="font-bold text-red-500 shrink-0">{formatMoney(debt.balance)}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {debt.apr.toFixed(2)}% APR · {t('payPerMonth', { amount: formatMoney(debt.monthlyPayment) })}
                    </p>

                    {debt.payoffDate && (
                      <p className="text-xs text-purple-600 font-medium mt-1">
                        {t('paidOffBy', { date: formatPayoffMonth(debt.payoffDate, locale) })}
                      </p>
                    )}

                    {debt.soonestPromo && (
                      <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 text-xs text-amber-700">
                        ⚠️ {t('promoDeadlineWarning', {
                          balance: formatMoney(debt.soonestPromo.remaining_balance),
                          date: formatDate(debt.soonestPromo.expiration_date),
                          deferred: formatMoney(debt.soonestPromo.deferred_interest || 0),
                        })}
                      </div>
                    )}

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>
                          {debt.payoffMonths
                            ? t('paidOffInMonths', { months: debt.payoffMonths })
                            : t('payoffUnreachable')}
                        </span>
                        <span>{formatMoney(debt.totalInterest)} {t('inInterest')}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-purple-500 rounded-full transition-all"
                          style={{ width: `${debt.progressPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('balancePaidProgress', {
                          paid: formatMoney(debt.paidSoFar || 0),
                          total: formatMoney(debt.originalBalance || debt.balance),
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {strategyInsight && (
              <div className="p-4 rounded-2xl bg-green-50 border border-green-100 mb-6">
                <p className="text-sm text-green-800">{strategyInsight}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
