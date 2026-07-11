import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustVaultBalance } from '../../lib/payments'

import { formatMoney, getUserCurrency } from '../../utils/currency'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'

export default function PaydayWizard({ onClose, onComplete, prefillAmount, prefillBankId }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const skippedStep1 = prefillAmount != null && prefillAmount > 0

  const [step, setStep] = useState(skippedStep1 ? 2 : 1)
  const [amount, setAmount] = useState(skippedStep1 ? String(prefillAmount) : '')
  const [bankId, setBankId] = useState(prefillBankId ?? '')
  const [incomeRecorded, setIncomeRecorded] = useState(skippedStep1)
  const [banks, setBanks] = useState([])
  const [vaultFills, setVaultFills] = useState([])
  const [summary, setSummary] = useState(null)
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
      .select('id, name, current_amount')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')

    setVaultFills((data ?? []).map(vault => ({
      vaultId: vault.id,
      vaultName: vault.name,
      currentAmount: vault.current_amount || 0,
      fillAmount: '0',
    })))
  }

  useEffect(() => {
    if (step === 2) loadVaults()
  }, [step])

  const handleStep1Next = async () => {
    if (!amount || isNaN(amount)) { setError(t('invalidAmount')); return }
    if (!bankId) { setError(t('selectBank')); return }

    setSaving(true)
    setError('')

    const parsedAmount = parseFloat(amount)
    const today = new Date().toISOString().split('T')[0]

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      bank_id: bankId,
      type: 'income',
      category: 'salary',
      amount: parsedAmount,
      description: 'Paycheck',
      transaction_date: today,
    })

    if (txError) {
      setError(txError.message)
      setSaving(false)
      return
    }

    const bankError = await adjustBankBalance(bankId, parsedAmount)
    if (bankError) {
      setError(bankError.message)
      setSaving(false)
      return
    }

    setIncomeRecorded(true)
    setSaving(false)
    setStep(2)
  }

  const handleStep2Next = async () => {
    setSaving(true)
    setError('')

    const filledVaults = []
    let totalDistributed = 0

    for (const fill of vaultFills) {
      const fillAmount = parseFloat(fill.fillAmount)
      if (!fillAmount || fillAmount <= 0) continue

      const vaultError = await adjustVaultBalance(fill.vaultId, fillAmount)
      if (vaultError) {
        setError(vaultError.message)
        setSaving(false)
        return
      }

      filledVaults.push({ name: fill.vaultName, amount: fillAmount })
      totalDistributed += fillAmount
    }

    setSummary({
      income: incomeRecorded ? parseFloat(amount) : null,
      filledVaults,
      totalDistributed,
    })

    setSaving(false)
    setStep(3)
  }

  const updateFill = (vaultId, value) => {
    setVaultFills(fills =>
      fills.map(f => (f.vaultId === vaultId ? { ...f, fillAmount: value } : f)),
    )
  }

  const stepTitle = [t('wizardIncome'), t('wizardVaults'), t('wizardSummary')][step - 1]
  const totalSteps = 3

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
          {[1, 2, 3].map(s => (
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
                placeholder="0"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
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
          <div className="space-y-3">
            {vaultFills.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t('noVaults')}</p>
            ) : (
              vaultFills.map(fill => (
                <div key={fill.vaultId} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium text-gray-700">{fill.vaultName}</p>
                    <p className="text-xs text-gray-400">{formatMoney(fill.currentAmount, currency)}</p>
                  </div>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={fill.fillAmount}
                    onChange={e => updateFill(fill.vaultId, e.target.value)}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {step === 3 && summary && (
          <div className="space-y-3">
            {summary.income != null && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <p className="text-xs text-green-600 mb-1">{t('incomeAdded')}</p>
                <p className="text-lg font-bold text-green-700">{formatMoney(summary.income, currency)}</p>
              </div>
            )}
            {summary.filledVaults.length > 0 ? (
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                <p className="text-xs text-purple-600 mb-2">{t('vaultsFilled')}</p>
                <div className="space-y-1">
                  {summary.filledVaults.map(v => (
                    <div key={v.name} className="flex justify-between text-sm">
                      <span className="text-gray-700">{v.name}</span>
                      <span className="font-medium text-purple-700">{formatMoney(v.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-2">{t('noVaults')}</p>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700 mb-1">{t('totalDistributed')}</p>
              <p className="text-2xl font-bold text-amber-900">{formatMoney(summary.totalDistributed, currency)}</p>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {step === 1 && (
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
            >
              {t('cancel')}
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={step === 1 ? handleStep1Next : handleStep2Next}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? '...' : t('next')}
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-medium"
            >
              {t('allDone')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
