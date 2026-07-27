import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustVaultBalance } from '../../lib/payments'
import { formatMoney, getUserCurrency } from '../../utils/currency'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'
import {
  useCurrencyInput,
  currencyAmountPlaceholder,
  sanitizeCurrencyRaw,
  formatCurrencyRaw,
  parseCurrencyRaw,
} from '../../hooks/useCurrencyInput'

const VAULT_COLORS = [
  'bg-purple-600',
  'bg-violet-500',
  'bg-indigo-500',
  'bg-purple-400',
  'bg-fuchsia-500',
  'bg-violet-400',
  'bg-indigo-400',
]

const INCOME_TYPES = [
  { emoji: '💼', labelKey: 'incomeTypeCommission', value: 'commission' },
  { emoji: '💵', labelKey: 'incomeTypeSalary', value: 'salary' },
  { emoji: '🎯', labelKey: 'incomeTypeBonus', value: 'bonus' },
  { emoji: '🔁', labelKey: 'incomeTypeRecurring', value: 'recurring' },
  { emoji: '📦', labelKey: 'incomeTypeReimbursement', value: 'reimbursement' },
  { emoji: '💰', labelKey: 'incomeTypeOther', value: 'other' },
]

function AllocationProgressBar({ vaults, vaultAllocations, payAmount, remaining, currency, t }) {
  const segments = useMemo(() => {
    if (remaining < 0 || payAmount <= 0) return []

    const vaultSegments = vaults
      .map((vault, index) => {
        const amount = vaultAllocations.find(a => a.id === vault.id)?.amount || 0
        if (amount <= 0) return null
        return {
          key: vault.id,
          label: vault.name,
          amount,
          color: VAULT_COLORS[index % VAULT_COLORS.length],
        }
      })
      .filter(Boolean)

    if (remaining > 0) {
      vaultSegments.push({
        key: 'checking',
        label: t('checking'),
        amount: remaining,
        color: 'bg-gray-200',
      })
    }

    return vaultSegments
  }, [vaults, vaultAllocations, remaining, payAmount, t])

  if (payAmount <= 0) return null

  return (
    <div className="mb-5">
      <div className="flex rounded-full overflow-hidden h-4 w-full mb-2">
        {remaining < 0 ? (
          <div className="bg-red-400 w-full transition-all duration-300" />
        ) : (
          segments.map(seg => (
            <div
              key={seg.key}
              className={`${seg.color} transition-all duration-300`}
              style={{ width: `${(seg.amount / payAmount) * 100}%` }}
            />
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {remaining < 0 ? (
          <p className="text-xs text-red-500">
            ⚠️ {t('overBy', { amount: formatMoney(Math.abs(remaining), currency) })}
          </p>
        ) : (
          segments.map(seg => (
            <div key={seg.key} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${seg.color}`} />
              <p className="text-xs text-gray-500">
                {seg.label} {formatMoney(seg.amount, currency)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function VaultAllocationRow({ vault, amount, onAmountChange, onMax, t, currency }) {
  const [localRaw, setLocalRaw] = useState('')
  const [editing, setEditing] = useState(false)
  const newBalance = (vault.current_amount || 0) + amount
  const toGoal = Math.max(0, (vault.target_amount || 0) - (vault.current_amount || 0))

  useEffect(() => {
    if (!editing) {
      setLocalRaw(amount > 0 ? String(amount) : '')
    }
  }, [amount, editing])

  const handleChange = (e) => {
    const val = sanitizeCurrencyRaw(e.target.value, currency)
    setLocalRaw(val)
    onAmountChange(vault.id, parseCurrencyRaw(val))
  }

  const displayValue = editing
    ? formatCurrencyRaw(localRaw, currency)
    : formatCurrencyRaw(amount > 0 ? String(amount) : '', currency)

  return (
    <div className="bg-white rounded-2xl p-4 mb-3 border border-gray-100">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-gray-800 text-sm">{vault.name}</p>
          <p className="text-xs text-gray-400">
            {formatMoney(vault.current_amount, currency)} → {formatMoney(newBalance, currency)}
            {vault.target_amount > 0 && ` of ${formatMoney(vault.target_amount, currency)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onMax}
          className="text-xs text-purple-600 font-medium px-2 py-1 bg-purple-50 rounded-lg"
        >
          {t('max')}
        </button>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={handleChange}
        placeholder={currencyAmountPlaceholder(currency)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
      />
      {vault.target_amount > 0 && toGoal > 0 && amount === 0 && (
        <p className="text-xs text-gray-400 mt-1">
          {t('neededToReachGoal', { amount: formatMoney(toGoal, currency) })}
        </p>
      )}
      {vault.target_amount > 0 && newBalance >= vault.target_amount && (
        <p className="text-xs text-green-500 mt-1">✓ {t('goalReached')}</p>
      )}
    </div>
  )
}

function stripMissingIncomeColumns(row, errorMessage = '') {
  let next = { ...row }
  if (errorMessage.includes('source')) {
    const { source: _s, ...rest } = next
    next = rest
  }
  if (errorMessage.includes('payer')) {
    const { payer: _p, ...rest } = next
    next = rest
  }
  if (errorMessage.includes('income_type')) {
    const { income_type: _i, ...rest } = next
    next = rest
  }
  return next
}

export default function PaydayWizard({ onClose, onComplete, prefillAmount, prefillBankId }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const incomeAlreadyRecorded = prefillAmount != null && prefillAmount > 0
  const vaultStep = 3

  const [step, setStep] = useState(incomeAlreadyRecorded ? vaultStep : 1)
  const [payAmount, setPayAmount] = useState(incomeAlreadyRecorded ? prefillAmount : 0)
  const amountInput = useCurrencyInput(incomeAlreadyRecorded ? prefillAmount : '')
  const [bankId, setBankId] = useState(prefillBankId ?? '')
  const [banks, setBanks] = useState([])
  const [vaults, setVaults] = useState([])
  const [vaultAllocations, setVaultAllocations] = useState([])
  const [incomeType, setIncomeType] = useState('salary')
  const [payer, setPayer] = useState('')
  const [note, setNote] = useState('')
  const [recentPayers, setRecentPayers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchBanks(supabase, user.id, { orderByName: true }).then(({ data }) => {
      if (data) {
        setBanks(data)
        if (!prefillBankId && data.length > 0) {
          setBankId(prev => prev || data[0].id)
        }
      }
    })
  }, [user.id, prefillBankId])

  useEffect(() => {
    if (incomeAlreadyRecorded) return

    let active = true
    ;(async () => {
      let { data, error: fetchError } = await supabase
        .from('transactions')
        .select('payer, transaction_date, type')
        .eq('user_id', user.id)
        .eq('type', 'income')
        .order('transaction_date', { ascending: false })
        .limit(40)

      if (fetchError?.message?.includes('payer')) {
        ;({ data, error: fetchError } = await supabase
          .from('transactions')
          .select('description, transaction_date, type')
          .eq('user_id', user.id)
          .eq('type', 'income')
          .order('transaction_date', { ascending: false })
          .limit(40))
        if (!active || fetchError) return
        const fromDesc = [...new Set(
          (data ?? [])
            .map(tx => (tx.description || '').trim())
            .filter(d => d && d.toLowerCase() !== 'paycheck' && d.toLowerCase() !== 'income'),
        )].slice(0, 5)
        setRecentPayers(fromDesc)
        return
      }

      if (!active || fetchError) return

      const payers = [...new Set(
        (data ?? [])
          .filter(tx => tx.payer?.trim())
          .map(tx => tx.payer.trim()),
      )].slice(0, 5)
      setRecentPayers(payers)
    })()

    return () => { active = false }
  }, [user.id, incomeAlreadyRecorded])

  const loadVaults = async () => {
    const { data } = await supabase
      .from('vaults')
      .select('id, name, current_amount, target_amount')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')

    const list = data ?? []
    setVaults(list)
    setVaultAllocations(list.map(v => ({ id: v.id, amount: 0 })))
  }

  useEffect(() => {
    if (step === vaultStep) loadVaults()
  }, [step])

  const totalAllocated = useMemo(
    () => vaultAllocations.reduce((sum, v) => sum + (v.amount || 0), 0),
    [vaultAllocations],
  )
  const remaining = payAmount - totalAllocated

  const setVaultAllocation = (vaultId, amount) => {
    setVaultAllocations(prev =>
      prev.map(v => (v.id === vaultId ? { ...v, amount: Math.max(0, amount) } : v)),
    )
  }

  const handleStep1Next = () => {
    if (!amountInput.raw || amountInput.numericValue <= 0) {
      setError(t('invalidAmount'))
      return
    }
    if (!bankId) {
      setError(t('selectBank'))
      return
    }

    setError('')
    setPayAmount(amountInput.numericValue)
    setStep(2)
  }

  const handleStep2Next = () => {
    if (!incomeType) {
      setError(t('selectIncomeType'))
      return
    }
    setError('')
    setStep(vaultStep)
  }

  const handleSave = async () => {
    if (remaining < 0) return

    setSaving(true)
    setError('')

    const today = new Date().toISOString().split('T')[0]
    const trimmedPayer = payer.trim()
    const trimmedNote = note.trim()
    const description = trimmedNote || trimmedPayer || t('paycheckDefaultDesc')

    if (!incomeAlreadyRecorded) {
      let incomeRow = {
        user_id: user.id,
        bank_id: bankId,
        type: 'income',
        category: 'Income',
        income_type: incomeType,
        payer: trimmedPayer || null,
        amount: payAmount,
        description,
        transaction_date: today,
        source: 'manual',
      }
      let { error: txError } = await supabase.from('transactions').insert(incomeRow)
      if (txError && (
        txError.message.includes('source')
        || txError.message.includes('payer')
        || txError.message.includes('income_type')
      )) {
        incomeRow = stripMissingIncomeColumns(incomeRow, txError.message)
        ;({ error: txError } = await supabase.from('transactions').insert(incomeRow))
      }

      if (txError) {
        setError(txError.message)
        setSaving(false)
        return
      }

      const bankError = await adjustBankBalance(bankId, payAmount)
      if (bankError) {
        setError(bankError.message)
        setSaving(false)
        return
      }
    }

    for (const allocation of vaultAllocations) {
      if (!allocation.amount || allocation.amount <= 0) continue

      const vaultError = await adjustVaultBalance(allocation.id, allocation.amount)
      if (vaultError) {
        setError(vaultError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onComplete()
  }

  const saveLabel = remaining < 0
    ? t('overAllocated')
    : remaining === 0
      ? t('saveFullyAllocated')
      : t('saveKeepInChecking', { amount: formatMoney(remaining, currency) })

  const stepTitles = [t('wizardIncome'), t('wizardIncomeDetails'), t('wizardVaults')]
  const totalSteps = incomeAlreadyRecorded ? 1 : 3
  const displayStep = incomeAlreadyRecorded ? 1 : step
  const stepTitle = incomeAlreadyRecorded ? t('wizardVaults') : stepTitles[step - 1]

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
          <h2 className="text-lg font-bold text-gray-800 mb-1">{t('paydayWizard')}</h2>
          <p className="text-xs text-gray-400">{displayStep}/{totalSteps} · {stepTitle}</p>
          <div className="flex gap-1 mt-4">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${s <= displayStep ? 'bg-amber-500' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-10">
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {step === 1 && !incomeAlreadyRecorded && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('paycheck')} ({currency})</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                type="text"
                inputMode="decimal"
                placeholder={currencyAmountPlaceholder(currency)}
                value={amountInput.displayValue}
                onChange={amountInput.handleChange}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('selectBank')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={bankId}
                onChange={e => setBankId(e.target.value)}
              >
                {banks.length === 0 && <option value="">{t('noBanksHint')}</option>}
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{getBankDropdownLabel(b)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && !incomeAlreadyRecorded && (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                {t('incomeType')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {INCOME_TYPES.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setIncomeType(opt.value)}
                    className={`py-3 rounded-xl text-xs flex flex-col items-center gap-1 border min-h-[44px] ${
                      incomeType === opt.value
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    <span className="truncate w-full text-center px-0.5">{t(opt.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                {t('incomePayer')}
              </label>
              {recentPayers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {recentPayers.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPayer(name)}
                      className={`px-3 py-1.5 rounded-full text-xs border min-h-[36px] ${
                        payer === name
                          ? 'bg-amber-50 border-amber-400 text-amber-700'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                placeholder={t('incomePayerPlaceholder')}
                value={payer}
                onChange={e => setPayer(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-purple-300"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                {t('incomeNote')}
              </label>
              <input
                type="text"
                placeholder={t('incomeNotePlaceholder')}
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-purple-300"
              />
            </div>
          </div>
        )}

        {step === vaultStep && (
          <div>
            <div
              className={`sticky top-0 z-10 rounded-2xl px-4 py-3 mb-4 ${
                remaining < 0
                  ? 'bg-red-50 border border-red-200'
                  : remaining === 0
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-purple-50 border border-purple-100'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500">{t('paycheck')}</p>
                  <p className="font-bold text-gray-800">{formatMoney(payAmount, currency)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">{t('allocated')}</p>
                  <p className="font-bold text-purple-600">{formatMoney(totalAllocated, currency)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{t('remaining')}</p>
                  <p className={`font-bold text-lg ${
                    remaining < 0
                      ? 'text-red-500'
                      : remaining === 0
                        ? 'text-green-500'
                        : 'text-gray-800'
                  }`}
                  >
                    {formatMoney(remaining, currency)}
                  </p>
                </div>
              </div>
              {remaining < 0 && (
                <p className="text-xs text-red-500 mt-1">⚠️ {t('overAllocatedWarning')}</p>
              )}
              {remaining === 0 && (
                <p className="text-xs text-green-600 mt-1">✅ {t('fullyAllocated')}</p>
              )}
            </div>

            <AllocationProgressBar
              vaults={vaults}
              vaultAllocations={vaultAllocations}
              payAmount={payAmount}
              remaining={remaining}
              currency={currency}
              t={t}
            />

            {vaults.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t('noVaults')}</p>
            ) : (
              vaults.map(vault => {
                const allocation = vaultAllocations.find(v => v.id === vault.id)?.amount || 0
                return (
                  <VaultAllocationRow
                    key={vault.id}
                    vault={vault}
                    amount={allocation}
                    currency={currency}
                    t={t}
                    onAmountChange={setVaultAllocation}
                    onMax={() => setVaultAllocation(vault.id, remaining + allocation)}
                  />
                )
              })
            )}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {step === 1 ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
            >
              {t('cancel')}
            </button>
          ) : !incomeAlreadyRecorded ? (
            <button
              type="button"
              onClick={() => setStep(step === vaultStep ? 2 : 1)}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
            >
              {t('back')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
            >
              {t('cancel')}
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              onClick={handleStep1Next}
              className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-medium"
            >
              {t('next')}
            </button>
          ) : step === 2 ? (
            <button
              type="button"
              onClick={handleStep2Next}
              className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-medium"
            >
              {t('next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || remaining < 0}
              className={`flex-1 py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50 ${
                remaining < 0 ? 'bg-red-500' : 'bg-amber-500'
              }`}
            >
              {saving ? '...' : saveLabel}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
