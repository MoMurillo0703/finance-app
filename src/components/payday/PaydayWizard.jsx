/*
-- Run in Supabase SQL editor:
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  payday_1 integer,
  payday_2 integer,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);
*/
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustVaultBalance } from '../../lib/payments'

const formatCOP = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)

const getDueDaysNext15 = () => {
  const today = new Date().getDate()
  const days = new Set()
  for (let i = 0; i <= 15; i++) {
    const day = ((today - 1 + i) % 31) + 1
    days.add(day)
  }
  return [...days]
}

export default function PaydayWizard({ onClose, onComplete }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState('')
  const [bankId, setBankId] = useState('')
  const [banks, setBanks] = useState([])
  const [vaultFills, setVaultFills] = useState([])
  const [summary, setSummary] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('banks')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) {
          setBanks(data)
          if (data.length > 0) setBankId(data[0].id)
        }
      })
  }, [user.id])

  const loadVaultFills = async () => {
    const dueDays = getDueDaysNext15()
    const { data: bills } = await supabase
      .from('bills')
      .select('id, amount, due_day, vault_id, vaults(id, name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('vault_id', 'is', null)

    const upcoming = (bills ?? []).filter(b => dueDays.includes(b.due_day))
    const byVault = new Map()

    for (const bill of upcoming) {
      if (!bill.vault_id || !bill.vaults) continue
      if (!byVault.has(bill.vault_id)) {
        byVault.set(bill.vault_id, {
          vaultId: bill.vault_id,
          vaultName: bill.vaults.name,
          fillAmount: String(bill.amount),
        })
      } else {
        const existing = byVault.get(bill.vault_id)
        const total = (parseFloat(existing.fillAmount) || 0) + bill.amount
        existing.fillAmount = String(total)
      }
    }

    setVaultFills([...byVault.values()])
  }

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
      description: t('nomina'),
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

    setSaving(false)
    await loadVaultFills()
    setStep(2)
  }

  const handleStep2Next = async () => {
    setSaving(true)
    setError('')

    let totalFilled = 0
    for (const fill of vaultFills) {
      const fillAmount = parseFloat(fill.fillAmount)
      if (!fillAmount || fillAmount <= 0) continue

      const vaultError = await adjustVaultBalance(fill.vaultId, fillAmount)
      if (vaultError) {
        setError(vaultError.message)
        setSaving(false)
        return
      }
      totalFilled += fillAmount
    }

    const { data: banksData } = await supabase
      .from('banks')
      .select('balance')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const { data: vaultsData } = await supabase
      .from('vaults')
      .select('current_amount')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const totalBalance = (banksData ?? []).reduce((sum, b) => sum + (b.balance || 0), 0)
    const protectedAmount = (vaultsData ?? []).reduce((sum, v) => sum + (v.current_amount || 0), 0)

    setSummary({
      income: parseFloat(amount),
      vaultsFilled: totalFilled,
      safeToSpend: totalBalance - protectedAmount,
    })

    setSaving(false)
    setStep(3)
  }

  const updateFill = (vaultId, value) => {
    setVaultFills(fills =>
      fills.map(f => (f.vaultId === vaultId ? { ...f, fillAmount: value } : f)),
    )
  }

  const stepTitle = [t('step1Income'), t('step2Vaults'), t('step3Summary')][step - 1]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto"
        style={{ zIndex: 2 }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-800 mb-1">{t('paydayWizard')}</h2>
        <p className="text-xs text-gray-400 mb-4">
          {t('payday')} · {step}/3 · {stepTitle}
        </p>

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
              <label className="text-xs text-gray-400 mb-1 block">{t('paycheck')} (COP)</label>
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
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">{t('suggestedFills')}</p>
            {vaultFills.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t('noVaultsLinked')}</p>
            ) : (
              vaultFills.map(fill => (
                <div key={fill.vaultId} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">{fill.vaultName}</p>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    type="number"
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
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-xs text-green-600 mb-1">{t('incomeAdded')}</p>
              <p className="text-lg font-bold text-green-700">{formatCOP(summary.income)}</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <p className="text-xs text-purple-600 mb-1">{t('vaultsFilled')}</p>
              <p className="text-lg font-bold text-purple-700">{formatCOP(summary.vaultsFilled)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700 mb-1">{t('safeToSpendAfter')}</p>
              <p className="text-2xl font-bold text-amber-900">{formatCOP(summary.safeToSpend)}</p>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {step > 1 && step < 3 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
            >
              {t('cancel')}
            </button>
          )}
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
              {t('confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
