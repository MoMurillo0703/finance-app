import { useState, useEffect, useMemo } from 'react'
import { Settings, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddBankModal from './AddBankModal'
import PaydayWizard from '../payday/PaydayWizard'
import PurchaseSimulator from '../simulator/PurchaseSimulator'
import DebtPayoffPlanner from '../debt/DebtPayoffPlanner'
import QuickSpentSheet from './QuickSpentSheet'
import QuickPayBillSheet from './QuickPayBillSheet'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { fetchBanks } from '../../utils/bank'
import { getMonthBounds } from '../../utils/reports'
import { getSpendingByBudgetCategory, getBudgetCategoryLabel } from '../../utils/budgets'
import { BUDGET_CATEGORIES, CATEGORY_EMOJIS } from '../../utils/transactionCategories'
import {
  getGreetingKey,
  getFirstName,
  getSmartAlert,
  computeMonthlyInterest,
  computeDebtPaidOffPct,
} from '../../utils/dashboardHelpers'

const LALA = {
  bg: '#F5F3FF',
  border: '#EDE9FE',
  accent: '#7C3AED',
  greeting: '#6D28D9',
  progressTrack: '#EDE9FE',
  progressFill: '#A78BFA',
}

export default function Dashboard({ refreshKey, onNavigate, setHideNav, onSettings }) {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [vaults, setVaults] = useState([])
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [loans, setLoans] = useState([])
  const [bills, setBills] = useState([])
  const [promos, setPromos] = useState([])
  const [monthTransactions, setMonthTransactions] = useState([])
  const [recentTransactions, setRecentTransactions] = useState([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddBank, setShowAddBank] = useState(false)
  const [modalRefreshKey, setModalRefreshKey] = useState(0)
  const [showPaydayWizard, setShowPaydayWizard] = useState(false)
  const [showSpent, setShowSpent] = useState(false)
  const [showPayBill, setShowPayBill] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [showDebtPlanner, setShowDebtPlanner] = useState(false)

  const now = new Date()
  const { firstDay, daysInMonth } = getMonthBounds(now.getFullYear(), now.getMonth() + 1)

  useEffect(() => {
    let active = true

    ;(async () => {
      const [
        { data: vaultsData },
        { data: banksData },
        { data: cardsData },
        { data: loansData },
        { data: billsData },
        { data: promosData },
        { data: monthTx },
        { data: recentTx },
      ] = await Promise.all([
        supabase
          .from('vaults')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
        fetchBanks(supabase, user.id),
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
          .from('bills')
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
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category')
          .eq('user_id', user.id)
          .gte('transaction_date', firstDay)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('transactions')
          .select('id, type, amount, description, transaction_date, category')
          .eq('user_id', user.id)
          .order('transaction_date', { ascending: false })
          .limit(3),
      ])

      if (!active) return

      setVaults(vaultsData ?? [])
      setBanks(banksData ?? [])
      setCreditCards(cardsData ?? [])
      setLoans(loansData ?? [])
      setBills(billsData ?? [])
      setPromos(promosData ?? [])
      setMonthTransactions(monthTx ?? [])
      setRecentTransactions(recentTx ?? [])
      setTotalBalance((banksData ?? []).reduce((sum, bank) => sum + (bank.balance || 0), 0))
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey, modalRefreshKey, firstDay])

  const protectedAmount = vaults.reduce((sum, v) => sum + (v.current_amount || 0), 0)
  const safeToSpend = totalBalance - protectedAmount
  const firstName = getFirstName(user)

  const monthSpent = monthTransactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const monthIncome = monthTransactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const dayOfMonth = now.getDate()
  const monthProjected = dayOfMonth > 0 ? (monthSpent / dayOfMonth) * daysInMonth : monthSpent
  const monthlyNet = monthIncome - monthSpent
  const spendingPct = monthProjected > 0 ? (monthSpent / monthProjected) * 100 : 0

  const topCategories = useMemo(() => {
    const spending = getSpendingByBudgetCategory(monthTransactions)
    return BUDGET_CATEGORIES
      .map(cat => ({
        key: cat.key,
        emoji: cat.emoji,
        label: getBudgetCategoryLabel(cat.key, t),
        amount: spending[cat.key] || 0,
      }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 2)
  }, [monthTransactions, t])

  const totalDebt = creditCards.reduce((s, c) => s + (c.current_balance || 0), 0)
    + loans.reduce((s, l) => s + (l.current_balance || 0), 0)

  const monthlyInterest = computeMonthlyInterest(creditCards, loans)
  const debtPaidOffPct = computeDebtPaidOffPct(loans, creditCards)

  const smartAlert = useMemo(
    () => getSmartAlert({ bills, promos, safeToSpend, onNavigate, t }),
    [bills, promos, safeToSpend, onNavigate, t],
  )

  const currentMonthName = now.toLocaleDateString(
    i18n.language === 'es' ? 'es-CO' : 'en-US',
    { month: 'long' },
  )

  const onboardingComplete = localStorage.getItem('onboarding_complete') === 'true'
  const showAccountsEmpty = onboardingComplete && banks.length === 0

  const bumpRefresh = () => setModalRefreshKey(k => k + 1)

  const closeSheet = () => {
    setShowSpent(false)
    setShowPayBill(false)
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-20 min-h-screen"
        style={{ backgroundColor: LALA.bg }}
      >
        <p className="text-gray-400">{t('loading')}</p>
      </div>
    )
  }

  if (showAccountsEmpty) {
    return (
      <div
        className="min-h-screen pb-24 flex flex-col items-center justify-center px-6"
        style={{ backgroundColor: LALA.bg }}
      >
        <p className="text-4xl mb-3">🏦</p>
        <p className="font-medium text-gray-600">{t('noAccounts')}</p>
        <p className="text-sm text-gray-400 mt-1 text-center">{t('noAccountsHint')}</p>
        <button
          type="button"
          onClick={() => onNavigate?.('accounts')}
          className="mt-4 px-4 py-2 bg-lala-600 text-white rounded-xl text-sm"
        >
          {t('addAccount')}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: LALA.bg }}>
      {/* HERO */}
      <div
        className="relative px-6 pt-14 pb-8 rounded-b-[2.5rem]"
        style={{ background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 40%, #C4B5FD 100%)' }}
      >
        <div className="absolute top-12 right-6">
          <button
            type="button"
            onClick={onSettings}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
            aria-label={t('settings')}
          >
            <Settings size={16} className="text-white" />
          </button>
        </div>

        <p className="text-purple-200 text-sm font-medium mb-3">
          {t(getGreetingKey())}, {firstName} 👋
        </p>

        <p className="text-purple-200 text-xs uppercase tracking-widest mb-1">
          {t('safeToSpend')}
        </p>
        <p className="text-white text-5xl font-bold tracking-tight mb-1">
          {formatMoney(safeToSpend)}
        </p>
        <p className="text-purple-200 text-xs">
          {safeToSpend >= 0 ? t('safeToSpendSubtitle') : t('belowVaultTargets')}
        </p>

        {smartAlert && (
          <button
            type="button"
            onClick={smartAlert.onTap ?? undefined}
            disabled={!smartAlert.onTap}
            className="mt-4 w-full rounded-2xl px-4 py-2.5 flex items-center justify-between disabled:cursor-default text-white"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <p className="text-xs font-medium text-left">{smartAlert.message}</p>
            {smartAlert.onTap && <ChevronRight size={14} className="text-white/60 shrink-0" />}
          </button>
        )}
      </div>

      {/* QUICK ACTIONS */}
      <div
        className="mx-4 -mt-6 bg-white rounded-3xl shadow-xl p-5 mb-4"
        style={{ border: '1px solid #EDE9FE' }}
      >
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: '💰', label: t('gotPaid'), action: () => setShowPaydayWizard(true) },
            { icon: '🛍️', label: t('spent'), action: () => setShowSpent(true) },
            { icon: '📋', label: t('payBill'), action: () => setShowPayBill(true) },
            { icon: '🤔', label: t('afford'), action: () => setShowSimulator(true) },
          ].map(btn => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.action}
              className="flex flex-col items-center py-1"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-1"
                style={{ backgroundColor: '#F5F3FF' }}
              >
                {btn.icon}
              </div>
              <p className="text-xs text-gray-600 font-medium text-center">{btn.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* MONTH PULSE */}
      <div
        className="mx-4 mb-4 bg-white rounded-3xl p-4 shadow-sm"
        style={{ border: '1px solid #EDE9FE' }}
      >
        <div className="flex justify-between items-center mb-2">
          <p
            className="text-xs font-semibold uppercase tracking-wide capitalize"
            style={{ color: '#7C3AED' }}
          >
            {currentMonthName}
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('reports')}
            className="text-xs font-medium"
            style={{ color: LALA.accent }}
          >
            {t('seeAll')} →
          </button>
        </div>
        <div className="flex justify-between items-end mb-2">
          <div>
            <p className="text-2xl font-bold text-gray-900">{formatMoney(monthSpent)}</p>
            <p className="text-xs text-gray-400">
              {t('spentOfProjectedShort', {
                spent: formatMoney(monthSpent),
                projected: formatMoney(monthProjected),
              })}
            </p>
          </div>
          <p className={`text-sm font-semibold ${monthlyNet >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {monthlyNet >= 0 ? '+' : ''}{formatMoney(monthlyNet)} {t('netShort')}
          </p>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: LALA.progressTrack }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${Math.min(100, spendingPct)}%`,
              backgroundColor: spendingPct > 90 ? '#f87171' : spendingPct > 70 ? '#fbbf24' : LALA.progressFill,
            }}
          />
        </div>
        {topCategories.length > 0 && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {topCategories.map(cat => (
              <div key={cat.key} className="flex items-center gap-1.5">
                <span className="text-sm">{cat.emoji}</span>
                <p className="text-xs text-gray-500">
                  {cat.label}{' '}
                  <span className="font-semibold text-gray-700">{formatMoney(cat.amount)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DEBT PULSE */}
      {totalDebt > 0 && (
        <div
          className="mx-4 mb-4 bg-white rounded-3xl p-4 shadow-sm"
          style={{ border: '1px solid #EDE9FE' }}
        >
          <div className="flex justify-between items-center mb-3">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: '#7C3AED' }}
            >
              {t('debtProgress')}
            </p>
            <button
              type="button"
              onClick={() => setShowDebtPlanner(true)}
              className="text-xs font-medium"
              style={{ color: LALA.accent }}
            >
              {t('viewPlan')} →
            </button>
          </div>
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatMoney(totalDebt)}</p>
              <p className="text-xs text-gray-400">{t('totalDebtRemaining')}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-500">{formatMoney(monthlyInterest)}/mo</p>
              <p className="text-xs text-gray-400">{t('inInterest')}</p>
            </div>
          </div>
          <div className="h-2 bg-red-100 rounded-full overflow-hidden">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${debtPaidOffPct}%`,
                background: `linear-gradient(to right, #f87171, ${LALA.progressFill})`,
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {debtPaidOffPct.toFixed(0)}% {t('paidOffFromOriginal')}
          </p>
        </div>
      )}

      {/* RECENT TRANSACTIONS */}
      <div
        className="mx-4 mb-4 bg-white rounded-3xl p-4 shadow-sm"
        style={{ border: '1px solid #EDE9FE' }}
      >
        <div className="flex justify-between items-center mb-3">
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: '#7C3AED' }}
          >
            {t('recent')}
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('transactions')}
            className="text-xs font-medium"
            style={{ color: LALA.accent }}
          >
            {t('seeAll')} →
          </button>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">{t('noTransactionsMonth')}</p>
        ) : (
          recentTransactions.map(tx => (
            <div
              key={tx.id}
              className="flex justify-between items-center py-2 last:border-0"
              style={{ borderBottom: `1px solid ${LALA.bg}` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: LALA.bg }}
                >
                  {CATEGORY_EMOJIS[tx.category] || '📦'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate max-w-[160px]">
                    {tx.description}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(tx.transaction_date)}</p>
                </div>
              </div>
              <p className={`text-sm font-bold shrink-0 ${tx.type === 'income' ? 'text-green-500' : 'text-gray-800'}`}>
                {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
              </p>
            </div>
          ))
        )}
      </div>

      {!onboardingComplete && totalBalance === 0 && vaults.length === 0 && (
        <div className="mx-4 mb-4 bg-lala-100 border border-lala-200 rounded-3xl p-5 text-center">
          <p className="text-2xl mb-2">👋</p>
          <p className="text-sm font-semibold text-lala-800 mb-1">{t('welcomeOnboardingTitle')}</p>
          <p className="text-xs text-lala-600 mb-4">{t('welcomeOnboardingBody')}</p>
          <button
            type="button"
            onClick={() => setShowAddBank(true)}
            className="px-4 py-2 bg-lala-600 text-white rounded-xl text-sm font-medium"
          >
            {t('onboardingAddBank')}
          </button>
        </div>
      )}

      {(showSpent || showPayBill) && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={closeSheet} />
          <div className="relative bg-white w-full rounded-t-3xl max-h-[92vh] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />
            {showSpent && (
              <QuickSpentSheet
                onClose={closeSheet}
                onSaved={bumpRefresh}
              />
            )}
            {showPayBill && (
              <QuickPayBillSheet
                onClose={closeSheet}
                onPaid={bumpRefresh}
              />
            )}
          </div>
        </div>
      )}

      {showAddBank && (
        <AddBankModal
          onClose={() => setShowAddBank(false)}
          onSaved={() => { setShowAddBank(false); bumpRefresh() }}
        />
      )}

      {showPaydayWizard && (
        <PaydayWizard
          onClose={() => setShowPaydayWizard(false)}
          onComplete={() => {
            setShowPaydayWizard(false)
            bumpRefresh()
          }}
        />
      )}

      {showSimulator && (
        <PurchaseSimulator
          onClose={() => setShowSimulator(false)}
          onSaved={bumpRefresh}
        />
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
