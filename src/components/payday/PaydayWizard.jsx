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

export default function PaydayWizard({ onClose, onComplete, prefillAmount, prefillBankId }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const incomeAlreadyRecorded = prefillAmount != null && prefillAmount > 0

  const [step, setStep] = useState(incomeAlreadyRecorded ? 2 : 1)
  const [payAmount, setPayAmount] = useState(incomeAlreadyRecorded ? prefillAmount : 0)
  const amountInput = useCurrencyInput(incomeAlreadyRecorded ? prefillAmount : '')
  const [bankId, setBankId] = useState(prefillBankId ?? '')
  const [banks, setBanks] = useState([])
  const [vaults, setVaults] = useState([])
  const [vaultAllocations, setVaultAllocations] = useState([])
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
    if (step === 2) loadVaults()
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

  const handleSave = async () => {
    if (remaining < 0) return

    setSaving(true)
    setError('')

    const today = new Date().toISOString().split('T')[0]

    if (!incomeAlreadyRecorded) {
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: user.id,
        bank_id: bankId,
        type: 'income',
        category: 'salary',
        amount: payAmount,
        description: 'Paycheck',
        transaction_date: today,
      })

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

  const stepTitle = [t('wizardIncome'), t('wizardVaults')][step - 1]
  const totalSteps = 2

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto"
        style={{ zIndex: 2 }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-800 mb-1">{t('paydayWizard')}</h2>
        <p className="text-xs text-gray-400 mb-4">{step}/{totalSteps} · {stepTitle}</p>

        <div className="flex gap-1 mb-6">
          {[1, 2].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-amber-500' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {step === 1 && (
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

        {step === 2 && (
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
              onClick={() => setStep(1)}
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
  )
}
