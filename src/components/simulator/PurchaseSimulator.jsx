import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney, getUserCurrency, isLatAmUser } from '../../utils/currency'
import { fetchBanks, getBankDropdownLabel } from '../../utils/bank'
import { getCardApr, calculateMinimumPayment, DEFAULT_CARD_APR } from '../../utils/cards'
import { adjustBankBalance, adjustCardBalance } from '../../lib/payments'
import { getRecentMonthKeys } from '../../utils/reports'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

function avgMonthlyTotal(transactions, type, monthKeys) {
  if (monthKeys.length === 0) return 0
  const totals = monthKeys.map(key =>
    transactions
      .filter(tx => tx.type === type && tx.transaction_date?.slice(0, 7) === key)
      .reduce((sum, tx) => sum + tx.amount, 0),
  )
  return totals.reduce((sum, v) => sum + v, 0) / monthKeys.length
}

function cardMinPayment(card, balance) {
  if (!card) return 0
  const apr = getCardApr(card)
  const monthlyRate = apr / 100 / 12
  return Math.max(balance * 0.02, 25) + balance * monthlyRate
}

function computeAnalysis({
  paymentMethod,
  purchaseAmount,
  numCuotas,
  selectedBank,
  selectedCard,
  cardCuotas,
  totalBankBalance,
  totalVaultAmounts,
  monthlyIncome,
  monthlyExpenses,
}) {
  const safeToSpend = totalBankBalance - totalVaultAmounts
  const projectedSurplus = monthlyIncome - monthlyExpenses

  const newSafeToSpend = paymentMethod === 'bank'
    ? safeToSpend - purchaseAmount
    : safeToSpend

  const currentCardBalance = selectedCard?.current_balance || 0
  const newCardBalance = paymentMethod !== 'bank'
    ? currentCardBalance + purchaseAmount
    : currentCardBalance

  const creditLimit = selectedCard?.credit_limit || 0
  const currentUtilization = creditLimit > 0 ? (currentCardBalance / creditLimit) * 100 : 0
  const newUtilization = creditLimit > 0 ? (newCardBalance / creditLimit) * 100 : 0

  const currentMinPayment = selectedCard
    ? calculateMinimumPayment(selectedCard, cardCuotas).totalMinimum
    : 0

  const newMinimumPayment = paymentMethod !== 'bank' && selectedCard
    ? cardMinPayment(selectedCard, newCardBalance)
    : 0

  const monthlyCuota = paymentMethod === 'cuotas' && numCuotas > 0
    ? purchaseAmount / numCuotas
    : 0

  const apr = selectedCard ? getCardApr(selectedCard) : DEFAULT_CARD_APR
  const estimatedInterest = paymentMethod === 'cuotas'
    ? purchaseAmount * (apr / 100) * (numCuotas / 12)
    : 0
  const totalCostWithInterest = paymentMethod === 'cuotas'
    ? purchaseAmount + estimatedInterest
    : purchaseAmount

  const newMonthlyCommitment = paymentMethod === 'cuotas'
    ? monthlyExpenses + monthlyCuota
    : paymentMethod !== 'bank'
      ? monthlyExpenses + newMinimumPayment
      : monthlyExpenses

  const newSurplus = projectedSurplus - (
    paymentMethod === 'cuotas'
      ? monthlyCuota
      : paymentMethod !== 'bank'
        ? Math.max(0, newMinimumPayment - currentMinPayment)
        : 0
  )

  const canAfford = paymentMethod === 'bank'
    ? newSafeToSpend >= 0
    : newUtilization <= 80 && projectedSurplus > newMinimumPayment

  let verdict = 'green'
  if (paymentMethod === 'bank' && newSafeToSpend < 0) {
    verdict = 'red'
  } else if (paymentMethod !== 'bank' && newUtilization > 95) {
    verdict = 'red'
  } else if (!canAfford) {
    verdict = 'red'
  } else if (
    (paymentMethod === 'bank' && newSafeToSpend >= 0 && newSafeToSpend < purchaseAmount * 0.2)
    || (paymentMethod !== 'bank' && newUtilization >= 80 && newUtilization <= 95)
  ) {
    verdict = 'yellow'
  } else if (canAfford) {
    verdict = 'green'
  } else {
    verdict = 'yellow'
  }

  const cuotaSurplusPercent = paymentMethod === 'cuotas' && projectedSurplus > 0
    ? (monthlyCuota / projectedSurplus) * 100
    : 0

  return {
    safeToSpend,
    projectedSurplus,
    newSafeToSpend,
    currentCardBalance,
    newCardBalance,
    currentUtilization,
    newUtilization,
    currentMinPayment,
    newMinimumPayment,
    monthlyCuota,
    estimatedInterest,
    totalCostWithInterest,
    newSurplus,
    canAfford,
    verdict,
    cuotaSurplusPercent,
    creditLimit,
  }
}

export default function PurchaseSimulator({ onClose, onSaved, prefillCardId }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const latAmUser = isLatAmUser()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [description, setDescription] = useState('')
  const amountInput = useCurrencyInput()
  const [paymentMethod, setPaymentMethod] = useState(prefillCardId ? 'credit' : 'bank')
  const [bankId, setBankId] = useState('')
  const [cardId, setCardId] = useState(prefillCardId || '')
  const [numCuotas, setNumCuotas] = useState('12')

  const paymentMethodOptions = useMemo(() => {
    const options = [
      { id: 'bank', label: t('payNow') },
      { id: 'credit', label: t('payCredit') },
    ]
    if (latAmUser) {
      options.push({ id: 'cuotas', label: t('payInstallments') })
    }
    return options
  }, [latAmUser, t])

  useEffect(() => {
    if (!latAmUser && paymentMethod === 'cuotas') {
      setPaymentMethod(prefillCardId ? 'credit' : 'bank')
    }
  }, [latAmUser, paymentMethod, prefillCardId])

  const [banks, setBanks] = useState([])
  const [cards, setCards] = useState([])
  const [cuotas, setCuotas] = useState([])
  const [totalBankBalance, setTotalBankBalance] = useState(0)
  const [totalVaultAmounts, setTotalVaultAmounts] = useState(0)
  const [transactions, setTransactions] = useState([])

  const monthKeys = useMemo(() => getRecentMonthKeys(3), [])
  const fetchStart = monthKeys.length ? `${monthKeys[0]}-01` : ''

  useEffect(() => {
    let active = true

    ;(async () => {
      const [banksRes, cardsRes, vaultsRes, cuotasRes, txRes] = await Promise.all([
        fetchBanks(supabase, user.id),
        supabase.from('credit_cards').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
        supabase.from('vaults').select('current_amount').eq('user_id', user.id).eq('is_active', true),
        supabase.from('cuotas').select('*').eq('user_id', user.id).eq('is_active', true),
        fetchStart
          ? supabase
            .from('transactions')
            .select('type, amount, transaction_date')
            .eq('user_id', user.id)
            .gte('transaction_date', fetchStart)
          : Promise.resolve({ data: [] }),
      ])

      if (!active) return

      const banksData = banksRes.data ?? []
      setBanks(banksData)
      setCards(cardsRes.data ?? [])
      setCuotas(cuotasRes.data ?? [])
      setTotalBankBalance(banksData.reduce((sum, b) => sum + (b.balance || 0), 0))
      setTotalVaultAmounts((vaultsRes.data ?? []).reduce((sum, v) => sum + (v.current_amount || 0), 0))
      setTransactions(txRes.data ?? [])

      if (banksData.length > 0 && !bankId) setBankId(banksData[0].id)
      if (cardsRes.data?.length > 0 && !cardId) {
        setCardId(prefillCardId || cardsRes.data[0].id)
      }

      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, fetchStart, prefillCardId])

  const purchaseAmount = amountInput.numericValue
  const installmentCount = parseInt(numCuotas, 10) || 0
  const selectedCard = cards.find(c => c.id === cardId)
  const selectedBank = banks.find(b => b.id === bankId)
  const cardCuotas = cuotas.filter(c => c.credit_card_id === cardId)

  const monthlyIncome = avgMonthlyTotal(transactions, 'income', monthKeys)
  const monthlyExpenses = avgMonthlyTotal(transactions, 'expense', monthKeys)

  const analysis = useMemo(() => {
    if (purchaseAmount <= 0) return null
    return computeAnalysis({
      paymentMethod,
      purchaseAmount,
      numCuotas: installmentCount,
      selectedBank,
      selectedCard,
      cardCuotas,
      totalBankBalance,
      totalVaultAmounts,
      monthlyIncome,
      monthlyExpenses,
    })
  }, [
    paymentMethod, purchaseAmount, installmentCount, selectedBank, selectedCard,
    cardCuotas, totalBankBalance, totalVaultAmounts, monthlyIncome, monthlyExpenses,
  ])

  const cardAvailable = selectedCard
    ? Math.max(0, (selectedCard.credit_limit || 0) - (selectedCard.current_balance || 0))
    : 0

  const monthlyCuotaPreview = purchaseAmount > 0 && installmentCount > 0
    ? purchaseAmount / installmentCount
    : 0

  const handleNext = () => {
    setError('')
    if (!description.trim()) { setError(t('billNameRequired')); return }
    if (!purchaseAmount || purchaseAmount <= 0) { setError(t('invalidAmount')); return }
    if (paymentMethod === 'bank' && !bankId) { setError(t('selectBank')); return }
    if (paymentMethod !== 'bank' && !cardId) { setError(t('selectCard')); return }
    if (paymentMethod === 'cuotas' && (!installmentCount || installmentCount < 2)) {
      setError(t('invalidNumCuotas'))
      return
    }
    setStep(s => Math.min(s + 1, 3))
  }

  const handleRecord = async () => {
    setSaving(true)
    setError('')
    const today = new Date().toISOString().split('T')[0]
    const desc = description.trim()

    try {
      if (paymentMethod === 'bank') {
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: user.id,
          bank_id: bankId,
          type: 'expense',
          amount: purchaseAmount,
          description: desc,
          category: 'essential',
          transaction_date: today,
        })
        if (txError) throw txError
        const bankError = await adjustBankBalance(bankId, -purchaseAmount)
        if (bankError) throw bankError
      } else if (paymentMethod === 'credit') {
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: user.id,
          credit_card_id: cardId,
          type: 'expense',
          amount: purchaseAmount,
          description: desc,
          category: 'essential',
          transaction_date: today,
        })
        if (txError) throw txError
        const cardError = await adjustCardBalance(cardId, purchaseAmount)
        if (cardError) throw cardError
      } else {
        const cuotaAmount = purchaseAmount / installmentCount
        const { error: cuotaError } = await supabase.from('cuotas').insert({
          user_id: user.id,
          credit_card_id: cardId,
          description: desc,
          total_amount: purchaseAmount,
          cuota_amount: cuotaAmount,
          total_cuotas: installmentCount,
          paid_cuotas: 0,
          start_date: today,
          is_active: true,
        })
        if (cuotaError) throw cuotaError
        const cardError = await adjustCardBalance(cardId, purchaseAmount)
        if (cardError) throw cardError
      }

      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || String(err))
      setSaving(false)
    }
  }

  const verdictStyles = {
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  }

  const verdictLabels = {
    green: `✅ ${t('verdictGreen')}`,
    yellow: `⚠️ ${t('verdictYellow')}`,
    red: `❌ ${t('verdictRed')}`,
  }

  const tipText = () => {
    if (!analysis) return ''
    if (analysis.verdict === 'green') {
      return t('simulatorTipGreen', { percent: 10 })
    }
    if (analysis.verdict === 'yellow') {
      return t('simulatorTipYellow')
    }
    return t('simulatorTipRed')
  }

  const renderAfterValue = (before, after, { higherIsBad = false, suffix = '' } = {}) => {
    const delta = after - before
    const base = `${formatMoney(after, currency)}${suffix}`

    if (Math.abs(delta) < 0.01) {
      return <span className="font-semibold text-gray-800">{base}</span>
    }

    const arrow = delta >= 0 ? '↑' : '↓'
    const deltaColor = higherIsBad
      ? (delta >= 0 ? 'text-red-500' : 'text-green-600')
      : (delta >= 0 ? 'text-green-600' : 'text-red-500')

    return (
      <span className="font-semibold text-gray-800">
        {base}{' '}
        <span className={deltaColor}>({arrow}{formatMoney(Math.abs(delta), currency)})</span>
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        <div className="flex-shrink-0 pt-3 pb-2 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex-shrink-0 px-6 pb-4">
          <h2 className="text-lg font-bold text-gray-800 mb-1">{t('purchaseSimulator')}</h2>
          <p className="text-xs text-gray-400">{t('canIAfford')}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-10">

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">{t('loading')}</p>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t('purchaseDescription')}</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    placeholder="New iPhone"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t('amount')} ({currency})</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    type="text"
                    inputMode="decimal"
                    placeholder={currencyAmountPlaceholder(currency)}
                    value={amountInput.displayValue}
                    onChange={amountInput.handleChange}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">{t('paymentMethod')}</label>
                  <div className="flex flex-col gap-2">
                    {paymentMethodOptions.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPaymentMethod(opt.id)}
                        className={`py-2.5 px-4 rounded-xl text-xs font-medium border text-left ${
                          paymentMethod === opt.id
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod === 'bank' && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('bank')}</label>
                    <select
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                      value={bankId}
                      onChange={e => setBankId(e.target.value)}
                    >
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>{getBankDropdownLabel(b)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {paymentMethod !== 'bank' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">{t('creditCard')}</label>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                        value={cardId}
                        onChange={e => setCardId(e.target.value)}
                      >
                        {cards.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {selectedCard && (
                        <p className="text-xs text-gray-500 mt-1">
                          {t('availableCredit')}: {formatMoney(cardAvailable, currency)}
                        </p>
                      )}
                    </div>
                    {paymentMethod === 'cuotas' && (
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">{t('numCuotas')}</label>
                        <input
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                          type="number"
                          min="2"
                          value={numCuotas}
                          onChange={e => setNumCuotas(e.target.value)}
                        />
                        {monthlyCuotaPreview > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            {t('cuotaAmount')}: {formatMoney(monthlyCuotaPreview, currency)}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
                >
                  {t('next')} →
                </button>
              </div>
            )}

            {(step === 2 || step === 3) && analysis && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('impactAnalysis')}
                </p>

                <div className={`rounded-xl border p-4 text-sm font-semibold ${verdictStyles[analysis.verdict]}`}>
                  {verdictLabels[analysis.verdict]}
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-2 bg-lala-50 border-b border-gray-100">
                    <p className="p-2 font-semibold text-gray-600">{t('beforePurchase')}</p>
                    <p className="p-2 font-semibold text-gray-600 border-l border-gray-100">{t('afterPurchase')}</p>
                  </div>

                  <div className="grid grid-cols-2 border-b border-gray-100">
                    <div className="p-2">
                      <p className="text-gray-400">{t('safeToSpend')}</p>
                      <p className="font-semibold text-gray-800">{formatMoney(analysis.safeToSpend, currency)}</p>
                    </div>
                    <div className="p-2 border-l border-gray-100">
                      <p className="text-gray-400">{t('safeToSpend')}</p>
                      {renderAfterValue(analysis.safeToSpend, analysis.newSafeToSpend)}
                    </div>
                  </div>

                  {paymentMethod !== 'bank' && selectedCard && (
                    <div className="grid grid-cols-2 border-b border-gray-100">
                      <div className="p-2">
                        <p className="text-gray-400">{t('balance')}</p>
                        <p className="font-semibold text-gray-800">
                          {formatMoney(analysis.currentCardBalance, currency)}
                          {analysis.creditLimit > 0 && (
                            <span className="text-gray-400 font-normal"> ({Math.round(analysis.currentUtilization)}%)</span>
                          )}
                        </p>
                      </div>
                      <div className="p-2 border-l border-gray-100">
                        <p className="text-gray-400">{t('balance')}</p>
                        <div>
                          {renderAfterValue(analysis.currentCardBalance, analysis.newCardBalance, { higherIsBad: true })}
                          {analysis.creditLimit > 0 && (
                            <span className="text-gray-400 font-normal text-[11px]">
                              {' '}({Math.round(analysis.newUtilization)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod !== 'bank' && (
                    <div className="grid grid-cols-2 border-b border-gray-100">
                      <div className="p-2">
                        <p className="text-gray-400">{t('estMinPayment')}</p>
                        <p className="font-semibold text-gray-800">{formatMoney(analysis.currentMinPayment, currency)}/mo</p>
                      </div>
                      <div className="p-2 border-l border-gray-100">
                        <p className="text-gray-400">{t('newMinPayment')}</p>
                        {renderAfterValue(
                          analysis.currentMinPayment,
                          analysis.newMinimumPayment,
                          { higherIsBad: true, suffix: '/mo' },
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2">
                    <div className="p-2">
                      <p className="text-gray-400">{t('monthlySurplus')}</p>
                      <p className="font-semibold text-gray-800">{formatMoney(analysis.projectedSurplus, currency)}</p>
                    </div>
                    <div className="p-2 border-l border-gray-100">
                      <p className="text-gray-400">{t('monthlySurplus')}</p>
                      {renderAfterValue(analysis.projectedSurplus, analysis.newSurplus)}
                    </div>
                  </div>
                </div>

                {paymentMethod === 'cuotas' && (
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-1 text-xs text-gray-700">
                    <p>
                      {t('simulatorCuotaMonthly', {
                        amount: formatMoney(analysis.monthlyCuota, currency),
                        months: installmentCount,
                      })}
                    </p>
                    <p>
                      {t('totalCostWithInterest')}: {formatMoney(analysis.totalCostWithInterest, currency)}
                    </p>
                    <p>
                      {t('simulatorCuotaSurplus', {
                        percent: analysis.cuotaSurplusPercent.toFixed(0),
                      })}
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
                    >
                      ← {t('back')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
                    >
                      {t('next')} →
                    </button>
                  </div>
                )}

                {step === 3 && (
                  <>
                    <p className="text-xs text-gray-500 bg-lala-50 rounded-xl p-3">{tipText()}</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600"
                      >
                        {t('justChecking')}
                      </button>
                      <button
                        type="button"
                        onClick={handleRecord}
                        disabled={saving}
                        className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {saving ? '...' : t('goAhead')}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="w-full py-2 text-xs text-gray-400"
                    >
                      ← {t('back')}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}
