import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getUserCurrency } from '../../utils/currency'
import { fetchBanks, getBankDropdownLabel, isCheckingBank } from '../../utils/bank'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

export default function AddVaultModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const [name, setName] = useState('')
  const [bankId, setBankId] = useState('')
  const [banks, setBanks] = useState([])
  const [loadingBanks, setLoadingBanks] = useState(true)
  const targetAmountInput = useCurrencyInput()
  const currentAmountInput = useCurrencyInput()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await fetchBanks(supabase, user.id, { orderByName: true })
      if (!active) return
      const checkingAccounts = (data ?? []).filter(isCheckingBank)
      setBanks(checkingAccounts)
      if (checkingAccounts.length > 0) {
        setBankId(checkingAccounts[0].id)
      }
      setLoadingBanks(false)
    })()
    return () => { active = false }
  }, [user.id])

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!bankId) { setError(t('noCheckingAccountsYet')); return }
    if (!targetAmountInput.raw || targetAmountInput.numericValue <= 0) {
      setError('Enter a valid target amount')
      return
    }

    setSaving(true)
    const row = {
      user_id: user.id,
      name: name.trim(),
      target_amount: targetAmountInput.numericValue,
      current_amount: currentAmountInput.numericValue,
      bank_id: bankId,
      is_active: true,
    }

    let { error: dbError } = await supabase.from('vaults').insert(row)

    if (dbError?.message?.includes('bank_id') && dbError.message.includes('schema')) {
      const { bank_id: _bankId, ...withoutBank } = row
      ;({ error: dbError } = await supabase.from('vaults').insert(withoutBank))
    }

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addVault')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loadingBanks ? (
          <p className="text-gray-400 text-sm text-center py-8">{t('loading')}</p>
        ) : banks.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🏦</p>
            <p className="font-medium text-gray-500">{t('noCheckingAccountsYet')}</p>
            <p className="text-sm mt-1">{t('addCheckingForVault')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('vaultName')}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder={t('vaultNamePlaceholder')}
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('linkedCheckingAccount')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                value={bankId}
                onChange={e => setBankId(e.target.value)}
              >
                {banks.map(bank => (
                  <option key={bank.id} value={bank.id}>
                    {getBankDropdownLabel(bank)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('vaultTarget', { currency })}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                type="text"
                inputMode="decimal"
                placeholder={currencyAmountPlaceholder(currency)}
                value={targetAmountInput.displayValue}
                onChange={targetAmountInput.handleChange}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('vaultCurrent', { currency })}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                type="text"
                inputMode="decimal"
                placeholder={currencyAmountPlaceholder(currency)}
                value={currentAmountInput.displayValue}
                onChange={currentAmountInput.handleChange}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingBanks || banks.length === 0}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
