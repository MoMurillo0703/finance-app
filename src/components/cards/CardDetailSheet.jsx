import { useState, useEffect, useMemo } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney, isLatAmUser } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getCardApr } from '../../utils/cards'
import {
  getBillingCycleStart,
  isIntroRateActive,
  isIntroRateExpiringSoon,
  getIntroRateDaysLeft,
  getCardMinimumPayment,
  syncAutoBillMinimum,
} from '../../utils/creditCard'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'
import { adjustBankBalance, adjustCardBalance, bankDelta, cardDelta } from '../../lib/payments'
import { CATEGORY_EMOJI, normalizeSpendingCategory } from '../../utils/reports'
import CuotasSection from './CuotasSection'
import CardEstimatorPanel from './CardEstimatorPanel'
import PromoSection from './PromoSection'
import AddTransactionModal from '../transactions/AddTransactionModal'
import AddCuotaModal from './AddCuotaModal'
import PurchaseSimulator from '../simulator/PurchaseSimulator'
import EditCardModal from './EditCardModal'
import LogStatementModal from './LogStatementModal'


function getPromoDaysLeft(expirationDate) {
  const expires = new Date(expirationDate)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  expires.setHours(0, 0, 0, 0)
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
}

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

export default function CardDetailSheet({ card: initialCard, onClose, onUpdated, setHideNav }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [liveCard, setLiveCard] = useState(initialCard)
  const [cuotas, setCuotas] = useState([])
  const [transactions, setTransactions] = useState([])
  const [banks, setBanks] = useState([])
  const [activeTab, setActiveTab] = useState('transactions')
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadingTx, setLoadingTx] = useState(true)
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showAddCuota, setShowAddCuota] = useState(false)
  const [showMakePayment, setShowMakePayment] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentBankId, setPaymentBankId] = useState('')
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [statementSnapshot, setStatementSnapshot] = useState(null)
  const [urgentPromos, setUrgentPromos] = useState([])
  const [statements, setStatements] = useState([])
  const [showLogStatement, setShowLogStatement] = useState(false)
  const [showEditCard, setShowEditCard] = useState(false)

  useEffect(() => {
    setHideNav?.(true)
    return () => setHideNav?.(false)
  }, [setHideNav])

  const currency = liveCard.currency || 'COP'
  const limit = liveCard.credit_limit || 0
  const balance = liveCard.current_balance || 0
  const availableCredit = Math.max(0, limit - balance)
  const isOverLimit = balance > limit
  const utilization = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0
  const latAmUser = isLatAmUser()
  const visibleTabs = useMemo(() => {
    const tabs = ['transactions']
    if (latAmUser) tabs.push('cuotas')
    if (!latAmUser) tabs.push('promotions')
    tabs.push('estimator')
    return tabs
  }, [latAmUser])
  const minimumResult = useMemo(
    () => getCardMinimumPayment(liveCard, statements),
    [liveCard, statements],
  )
  const totalMinimum = minimumResult.amount
  const introActive = isIntroRateActive(liveCard)
  const introExpiringSoon = isIntroRateExpiringSoon(liveCard)
  const introDaysLeft = getIntroRateDaysLeft(liveCard)

  const loadStatementSnapshot = async (card) => {
    const cycleStart = getBillingCycleStart(card.statement_date)
    const { data: cycleTransactions } = await supabase
      .from('transactions')
      .select('amount, type')
      .eq('credit_card_id', card.id)
      .gte('transaction_date', cycleStart)

    const newCharges = (cycleTransactions ?? [])
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0)

    setStatementSnapshot({
      newCharges,
      payToAvoidInterest: newCharges,
    })
  }

  const refreshData = async () => {
    const [cardRes, cuotasRes, txRes, promosRes, statementsRes] = await Promise.all([
      supabase.from('credit_cards').select('*').eq('id', initialCard.id).single(),
      supabase
        .from('cuotas')
        .select('*')
        .eq('credit_card_id', initialCard.id)
        .eq('is_active', true)
        .order('start_date'),
      supabase
        .from('transactions')
        .select('id, type, amount, description, transaction_date, category')
        .eq('user_id', user.id)
        .eq('credit_card_id', initialCard.id)
        .order('transaction_date', { ascending: false }),
      supabase
        .from('promotional_purchases')
        .select('*')
        .eq('credit_card_id', initialCard.id)
        .eq('is_active', true)
        .gt('remaining_balance', 0),
      supabase
        .from('card_statements')
        .select('*')
        .eq('credit_card_id', initialCard.id)
        .order('statement_date', { ascending: false })
        .limit(12),
    ])

    const stmts = statementsRes.data ?? []
    setStatements(stmts)

    if (cardRes.data) {
      setLiveCard(cardRes.data)
      await loadStatementSnapshot(cardRes.data)
      await syncAutoBillMinimum(supabase, cardRes.data, stmts)
    }
    setCuotas(cuotasRes.data ?? [])
    setTransactions(txRes.data ?? [])
    setUrgentPromos((promosRes.data ?? []).filter(promo => {
      const daysLeft = getPromoDaysLeft(promo.expiration_date)
      return daysLeft <= 60 && daysLeft > 0
    }))
    setLoadingTx(false)
    setRefreshKey(k => k + 1)
    onUpdated?.()
  }

  useEffect(() => {
    setLiveCard(initialCard)
    setLoadingTx(true)
    refreshData()
    fetchBanks(supabase, user.id, { orderByName: true }).then(({ data }) => {
      if (data?.length) {
        setBanks(data)
        setPaymentBankId(data[0].id)
      }
    })
  }, [initialCard.id, user.id])

  useEffect(() => {
    if (showMakePayment) {
      setPaymentAmount(String(Math.round(totalMinimum * 100) / 100 || ''))
    }
  }, [showMakePayment, totalMinimum])

  const handleSaved = () => {
    setShowAddTransaction(false)
    setShowAddCuota(false)
    setShowMakePayment(false)
    setShowLogStatement(false)
    refreshData()
  }

  const handleStatementLogged = () => {
    setShowLogStatement(false)
    refreshData()
  }

  const handleMakePayment = async () => {
    const amount = parseFloat(paymentAmount)
    if (!amount || isNaN(amount) || amount <= 0) {
      setPaymentError(t('invalidAmount'))
      return
    }
    if (!paymentBankId) {
      setPaymentError(t('selectBank'))
      return
    }

    setPaying(true)
    setPaymentError('')

    const today = new Date().toISOString().split('T')[0]
    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'payment',
      category: 'debt',
      amount,
      description: `${liveCard.name} ${t('payCard')}`,
      transaction_date: today,
      bank_id: paymentBankId,
      credit_card_id: liveCard.id,
    })

    if (txError) {
      setPaymentError(txError.message)
      setPaying(false)
      return
    }

    const bankError = await adjustBankBalance(paymentBankId, bankDelta('payment', amount))
    if (bankError) {
      setPaymentError(bankError.message)
      setPaying(false)
      return
    }

    const cardError = await adjustCardBalance(liveCard.id, cardDelta('payment', amount))
    if (cardError) {
      setPaymentError(cardError.message)
      setPaying(false)
      return
    }

    setPaying(false)
    handleSaved()
  }

  const monthGroups = groupByMonth(transactions)

  return (
    <>
      <div className="fixed inset-0 z-[110] flex flex-col justify-end">
        <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
        <div className="relative bg-white w-full max-h-[95vh] rounded-t-3xl overflow-hidden flex flex-col">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />

          <div className="overflow-y-auto flex-1">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-5 text-white">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-xs text-gray-400 mb-0.5">
                    {liveCard.network === 'Store'
                      ? `🏪 ${t('storeCredit')}`
                      : liveCard.network}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <p className="text-lg font-bold text-white">{liveCard.name}</p>
                    <button
                      type="button"
                      onClick={() => setShowEditCard(true)}
                      className="text-white/60 hover:text-white p-0.5"
                      aria-label={t('edit')}
                    >
                      <Pencil size={14} />
                    </button>
                    {introActive && (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                        {liveCard.intro_rate}% intro · {t('introRateExpires')} {formatDate(liveCard.intro_rate_expires)}
                      </span>
                    )}
                    {isOverLimit && (
                      <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full shrink-0">
                        ⚠️ {t('overLimit')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                    APR {getCardApr(liveCard).toFixed(2)}%
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-white/70 text-xl leading-none px-1"
                    aria-label={t('cancel')}
                  >
                    ×
                  </button>
                </div>
              </div>
              {introExpiringSoon && introDaysLeft != null && (
                <p className="text-xs text-amber-300 mb-2">
                  ⚠️ {liveCard.name} {t('introRateWarning')} {introDaysLeft} {t('daysLeft')}
                </p>
              )}
              <p className={`text-xs mb-1 ${isOverLimit ? 'text-red-400' : 'text-gray-400'}`}>
                {t('availableCredit')}
              </p>
              <p className={`text-3xl font-bold mb-1 ${isOverLimit ? 'text-red-400' : ''}`}>
                {formatMoney(isOverLimit ? 0 : availableCredit, currency)}
              </p>
              <p className="text-xs text-gray-400 mb-3">
                {t('of')} {formatMoney(limit, currency)}
              </p>
              <div className="w-full bg-white/20 rounded-full h-1.5 mb-1">
                <div
                  className="bg-white h-1.5 rounded-full"
                  style={{ width: `${utilization}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>{t('balance')}: {formatMoney(balance, currency)}</span>
                <span>{t('limit')}: {formatMoney(limit, currency)}</span>
              </div>
            </div>

            {urgentPromos.length > 0 && (
              <div className="mx-4 mt-2 bg-amber-100 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                ⚠️ {t('promosExpiringBanner', { count: urgentPromos.length })}
              </div>
            )}

            {statementSnapshot && (
              <div className="mx-4 mt-4 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {t('statementSnapshot')}
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">{t('newCharges')}</span>
                    <span className="font-semibold text-gray-800">
                      {formatMoney(statementSnapshot.newCharges, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-green-700">{t('payToAvoidInterest')}</span>
                    <span className="font-semibold text-green-700">
                      {formatMoney(statementSnapshot.payToAvoidInterest, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-amber-700">{t('minimumDue')}</span>
                    <span className="font-semibold text-amber-700">
                      {formatMoney(minimumResult.amount, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1 border-t border-gray-100">
                    <span className="text-gray-500">{t('dueDate')}</span>
                    <span className="text-gray-600">
                      {t('dueDayOfMonth', { day: liveCard.due_date })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-amber-600 font-medium uppercase mb-1">{t('estMinimumDue')}</p>
                  <p className="text-2xl font-bold text-amber-900">{formatMoney(minimumResult.amount, currency)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {minimumResult.confidence === 'high' && `✓ ${t('learnedFromStatements', { count: minimumResult.monthsOfData })}`}
                    {minimumResult.confidence === 'medium' && `~ ${t('gettingAccurate', { count: minimumResult.monthsOfData })}`}
                    {(minimumResult.confidence === 'low' || minimumResult.confidence === 'estimated') && t('logMoreStatements')}
                  </p>
                  <div className="flex gap-1 mt-2">
                    {[1, 2, 3, 4].map(n => (
                      <div
                        key={n}
                        className={`h-1 flex-1 rounded-full ${
                          statements.length >= n ? 'bg-purple-500' : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {statements.length < 3
                      ? t('logMoreStatementsCount', { count: 3 - statements.length })
                      : `✓ ${t('selfCalibrating')}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowLogStatement(true)}
                    className="text-xs text-purple-600 border border-purple-200 rounded-xl px-3 py-1.5 whitespace-nowrap"
                  >
                    + {t('logStatement')}
                  </button>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">{t('dueDate')}</p>
                    <p className="text-xs font-medium text-gray-600">
                      {t('dueDayOfMonth', { day: liveCard.due_date })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setShowAddTransaction(true)}
                className={`py-2 rounded-xl bg-purple-600 text-white text-xs font-medium ${latAmUser ? 'flex-1' : 'w-full'}`}
              >
                + {t('transaction')}
              </button>
              {latAmUser && (
                <button
                  type="button"
                  onClick={() => setShowAddCuota(true)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-medium"
                >
                  + {t('cuota')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMakePayment(true)}
                className="flex-1 py-2 rounded-xl bg-green-100 text-green-700 text-xs font-medium"
              >
                {t('payCard')}
              </button>
            </div>

            <div className="px-4 py-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setShowSimulator(true)}
                className="w-full py-2 rounded-xl border border-purple-200 text-purple-600 text-xs font-medium"
              >
                🤔 {t('canIAfford')}
              </button>
            </div>

            <div className="flex border-b border-gray-100">
              {visibleTabs.map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-xs font-medium capitalize ${
                    activeTab === tab
                      ? 'text-purple-600 border-b-2 border-purple-600'
                      : 'text-gray-400'
                  }`}
                >
                  {tab === 'transactions' ? t('transactions')
                    : tab === 'cuotas' ? t('cuotas')
                      : tab === 'promotions' ? t('promotions')
                        : t('estimator')}
                </button>
              ))}
            </div>

            <div className="p-4 pb-8">
              {activeTab === 'transactions' && (
                <div>
                  {loadingTx ? (
                    <p className="text-gray-400 text-xs text-center py-6">{t('loading')}</p>
                  ) : monthGroups.length === 0 ? (
                    <p className="text-gray-400 text-xs text-center py-6">{t('noTransactionsMonth')}</p>
                  ) : (
                    <div className="space-y-4">
                      {monthGroups.map(group => (
                        <div key={group.monthKey}>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            {formatMonthLabel(group.monthKey, i18n.language)}
                          </p>
                          <div className="space-y-2">
                            {group.items.map(tx => {
                              const cat = normalizeSpendingCategory(tx)
                              return (
                                <div
                                  key={tx.id}
                                  className="flex items-center gap-3 bg-lala-50 rounded-xl px-3 py-2.5"
                                >
                                  <span className="text-base shrink-0">
                                    {CATEGORY_EMOJI[cat] || CATEGORY_EMOJI.other}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate max-w-[60%]">
                                      {tx.description || t(tx.type)}
                                    </p>
                                    <p className="text-[10px] text-gray-400">
                                      {formatDate(tx.transaction_date)}
                                    </p>
                                  </div>
                                  <p className={`text-xs font-semibold shrink-0 ${
                                    tx.type === 'payment' ? 'text-green-600' : 'text-gray-800'
                                  }`}>
                                    {tx.type === 'payment' ? '−' : ''}{formatMoney(tx.amount, currency)}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {latAmUser && activeTab === 'cuotas' && (
                <CuotasSection
                  card={liveCard}
                  refreshKey={refreshKey}
                  onUpdated={refreshData}
                  hideEstimator
                />
              )}

              {!latAmUser && activeTab === 'promotions' && (
                <PromoSection
                  card={liveCard}
                  currency={currency}
                  refreshKey={refreshKey}
                  onUpdated={refreshData}
                />
              )}

              {activeTab === 'estimator' && (
                <CardEstimatorPanel card={liveCard} cuotas={cuotas} />
              )}
            </div>
          </div>
        </div>
      </div>

      {showMakePayment && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowMakePayment(false)} />
          <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
            <h2 className="text-lg font-bold text-gray-800 mb-1">{t('makePayment')}</h2>
            <p className="text-sm text-gray-500 mb-4">{liveCard.name}</p>

            {paymentError && <p className="text-red-500 text-sm mb-4">{paymentError}</p>}

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('paymentAmount')}</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  type="number"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('bank')}</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  value={paymentBankId}
                  onChange={e => setPaymentBankId(e.target.value)}
                >
                  {banks.length === 0 && (
                    <option value="">{t('noBanksHint')}</option>
                  )}
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{getBankDropdownLabel(b)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowMakePayment(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleMakePayment}
                disabled={paying}
                className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {paying ? '...' : t('makePayment')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTransaction && (
        <AddTransactionModal
          onClose={() => setShowAddTransaction(false)}
          onSaved={handleSaved}
          prefillCardId={liveCard.id}
          lockToCardExpense
        />
      )}

      {latAmUser && showAddCuota && (
        <AddCuotaModal
          card={liveCard}
          onClose={() => setShowAddCuota(false)}
          onSaved={handleSaved}
        />
      )}

      {showSimulator && (
        <PurchaseSimulator
          onClose={() => setShowSimulator(false)}
          onSaved={handleSaved}
          prefillCardId={liveCard.id}
        />
      )}

      {showLogStatement && (
        <LogStatementModal
          card={liveCard}
          onClose={() => setShowLogStatement(false)}
          onSaved={handleStatementLogged}
        />
      )}

      {showEditCard && (
        <EditCardModal
          card={liveCard}
          onClose={() => setShowEditCard(false)}
          onSaved={() => {
            setShowEditCard(false)
            refreshData()
          }}
        />
      )}
    </>
  )
}
