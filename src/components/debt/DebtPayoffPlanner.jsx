import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getRecentMonthKeys } from '../../utils/reports'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import {
  PAYOFF_STRATEGIES,
  buildDebtList,
  hasUpcomingPromoDeadlines,
  averageMonthlyTotals,
  calculateInterestSaved,
  buildPayoffInsight,
} from '../../utils/debtPayoff'

export default function DebtPayoffPlanner({ onClose, setHideNav }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [debts, setDebts] = useState([])
  const [avgMonthlyIncome, setAvgMonthlyIncome] = useState(0)
  const [avgMonthlyExpenses, setAvgMonthlyExpenses] = useState(0)
  const [strategy, setStrategy] = useState('avalanche')
  const [strategyReady, setStrategyReady] = useState(false)
  const extraInput = useCurrencyInput('')
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

      if (available > 0) {
        extraInput.reset(String(Math.round(available * 100) / 100))
      }

      setLoading(false)
    })()

    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  const totalMinPayments = useMemo(
    () => debts.reduce((sum, d) => sum + (d.minPayment || 0), 0),
    [debts],
  )

  const availableForDebt = suggestedExtra
  const extraPayment = extraInput.raw === ''
    ? availableForDebt
    : extraInput.numericValue

  const { withExtra, interestSaved } = useMemo(() => {
    if (debts.length === 0) {
      return {
        withExtra: { plan: [], maxPayoffMonths: 0, totalInterestPaid: 0 },
        interestSaved: 0,
      }
    }
    return calculateInterestSaved(debts, strategy, extraPayment)
  }, [debts, strategy, extraPayment])

  const interestSavedWith100 = useMemo(() => {
    if (debts.length === 0) return 0
    return calculateInterestSaved(debts, strategy, 100).interestSaved
  }, [debts, strategy])

  const payoffPlan = withExtra.plan
  const maxMonths = withExtra.maxPayoffMonths
  const totalInterestPaid = withExtra.totalInterestPaid
  const activeStrategy = PAYOFF_STRATEGIES.find(s => s.key === strategy)

  const insight = useMemo(() => {
    if (loading || debts.length === 0) return ''
    return buildPayoffInsight({
      availableForDebt,
      extraPayment,
      maxMonths,
      interestSaved,
      totalInterestPaid,
      interestSavedWith100,
      formatMoney,
      t,
      locale: i18n.language === 'es' ? 'es-CO' : 'en-US',
    })
  }, [
    loading,
    debts.length,
    availableForDebt,
    extraPayment,
    maxMonths,
    interestSaved,
    totalInterestPaid,
    interestSavedWith100,
    t,
    i18n.language,
  ])

  return (
    <div className="fixed inset-0 z-[130] bg-gray-50 flex flex-col">
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
            {/* Section A — snapshot */}
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

            {/* Section B — strategy */}
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
                <p className="text-xs text-gray-400 mb-1">{t('extraPayment')}</p>
                <input
                  type="text"
                  inputMode="decimal"
                  value={extraInput.displayValue}
                  onChange={extraInput.handleChange}
                  placeholder={currencyAmountPlaceholder(extraInput.currency) || formatMoney(availableForDebt)}
                  className="w-full border border-purple-200 rounded-xl px-4 py-3 text-lg font-bold text-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {t('suggestedExtra', { amount: formatMoney(availableForDebt) })}
                </p>
              </div>
            </div>

            {/* Section C — payoff order */}
            <p className="text-sm font-semibold text-gray-700 mb-3">{t('payoffOrder')}</p>
            {payoffPlan.map((debt, index) => (
              <div key={`${debt.type}-${debt.id}`} className="bg-white rounded-2xl p-4 mb-3 border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-semibold text-gray-800 text-sm">{debt.name}</p>
                      <p className="font-bold text-red-500 shrink-0">{formatMoney(debt.balance)}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {debt.apr}% APR · {t('payPerMonth', { amount: formatMoney(debt.monthlyPayment) })}
                    </p>

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
                      <div className="h-1.5 bg-gray-100 rounded-full">
                        <div
                          className="h-1.5 bg-purple-500 rounded-full"
                          style={{
                            width: debt.payoffMonths
                              ? `${Math.min(100, (1 / debt.payoffMonths) * 100 * 3)}%`
                              : '2%',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-gray-50 rounded-2xl p-4 mt-2 mb-4 border border-gray-100">
              <div className="flex justify-between mb-2">
                <p className="text-sm text-gray-500">{t('debtFreeIn')}</p>
                <p className="font-bold text-purple-600 text-right">
                  {maxMonths > 0
                    ? `${maxMonths} ${t('months')} (${(maxMonths / 12).toFixed(1)} ${t('years')})`
                    : '—'}
                </p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-sm text-gray-500">{t('totalInterestPaid')}</p>
                <p className="font-bold text-red-500">{formatMoney(totalInterestPaid)}</p>
              </div>
              <div className="flex justify-between">
                <p className="text-sm text-gray-500">{t('interestSaved')}</p>
                <p className="font-bold text-green-600">+{formatMoney(interestSaved)}</p>
              </div>
            </div>

            {insight && (
              <div className="bg-purple-50 rounded-2xl p-4 mb-6 text-sm text-purple-800 italic">
                &ldquo;{insight}&rdquo;
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
