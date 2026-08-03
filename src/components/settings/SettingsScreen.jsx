import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddBankModal from '../dashboard/AddBankModal'
import EditBankModal from './EditBankModal'
import { formatMoney, getUserCurrency, notifyPrefsChanged } from '../../utils/currency'
import { getUserDateFormat } from '../../utils/date'
import { fetchBanks } from '../../utils/bank'

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

function DevWipeButton({ label, description, onConfirm, danger = false }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-4 border-b border-orange-100 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        {confirming ? (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-medium min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                await onConfirm()
                setConfirming(false)
              }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-white min-h-[44px]"
              style={{ backgroundColor: danger ? '#EF4444' : '#F97316' }}
            >
              Confirm
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium shrink-0 min-h-[44px]"
            style={{
              backgroundColor: danger ? '#FEE2E2' : '#FFEDD5',
              color: danger ? '#EF4444' : '#EA580C',
            }}
          >
            Wipe
          </button>
        )}
      </div>
    </div>
  )
}

export default function SettingsScreen({ onClose, onBankSaved, onPrefsChanged, onViewAccount, showToast }) {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddBank, setShowAddBank] = useState(false)
  const [editingBank, setEditingBank] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [installAvailable, setInstallAvailable] = useState(() => !!window.__installPrompt)
  const [currency, setCurrency] = useState(getUserCurrency)
  const [dateFormat, setDateFormat] = useState(getUserDateFormat)

  useEffect(() => {
    const onInstallPrompt = () => setInstallAvailable(true)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt)
  }, [])

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await fetchBanks(supabase, user.id, { orderByName: true })

      if (!active) return
      setBanks(data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const refreshBanks = () => {
    setRefreshKey(k => k + 1)
    onBankSaved?.()
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'es' ? 'en' : 'es'
    localStorage.setItem('language', nextLang)
    i18n.changeLanguage(nextLang)
  }

  const handleCurrencyChange = async (e) => {
    const value = e.target.value
    setCurrency(value)
    localStorage.setItem('currency', value)
    notifyPrefsChanged()
    onPrefsChanged?.()
    await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, currency: value }, { onConflict: 'user_id' })
  }

  const handleDateFormatChange = (e) => {
    const value = e.target.value
    setDateFormat(value)
    localStorage.setItem('dateFormat', value)
    notifyPrefsChanged()
    onPrefsChanged?.()
  }

  const handleInstall = async () => {
    const prompt = window.__installPrompt
    if (prompt) {
      prompt.prompt()
      await prompt.userChoice
      window.__installPrompt = null
      setInstallAvailable(false)
    }
  }

  const resetBalances = async ({ includeLoans = false } = {}) => {
    const updates = [
      supabase.from('banks').update({ balance: 0 }).eq('user_id', user.id),
      supabase.from('credit_cards').update({ current_balance: 0 }).eq('user_id', user.id),
    ]
    if (includeLoans) {
      updates.push(supabase.from('loans').update({ current_balance: 0 }).eq('user_id', user.id))
    }

    for (const update of updates) {
      const { error } = await update
      if (error) return error
    }
    return null
  }

  const wipeTable = async (tableName, { resetBalances: shouldReset = false, includeLoans = false } = {}) => {
    const { error } = await supabase.from(tableName).delete().eq('user_id', user.id)
    if (error) {
      showToast?.(error.message)
      return
    }

    if (shouldReset) {
      const balanceError = await resetBalances({ includeLoans })
      if (balanceError) {
        showToast?.(balanceError.message)
        return
      }
    }

    showToast?.(`${tableName} wiped ✓`)
    window.location.reload()
  }

  const wipeTables = async (tableNames, { resetBalances: shouldReset = false, includeLoans = false } = {}) => {
    for (const tableName of tableNames) {
      const { error } = await supabase.from(tableName).delete().eq('user_id', user.id)
      if (error) {
        showToast?.(`${tableName}: ${error.message}`)
        return
      }
    }

    if (shouldReset) {
      const balanceError = await resetBalances({ includeLoans })
      if (balanceError) {
        showToast?.(balanceError.message)
        return
      }
    }

    showToast?.('Data wiped ✓')
    window.location.reload()
  }

  const settingsBody = (
    <div className="space-y-8">
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-700">{t('myAccounts')}</h2>
            <button
              type="button"
              onClick={() => setShowAddBank(true)}
              className="text-xs text-purple-600 font-medium"
            >
              {t('addBank')}
            </button>
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm text-center py-6">{t('loading')}</p>
          ) : banks.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
              <p className="text-gray-400 text-sm">{t('noAccounts')}</p>
              <button
                type="button"
                onClick={() => setShowAddBank(true)}
                className="mt-3 text-purple-600 text-sm font-medium"
              >
                {t('addBank')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {banks.map(bank => (
                <div
                  key={bank.id}
                  className="w-full bg-white border border-gray-100 rounded-2xl shadow-sm flex items-center"
                >
                  <button
                    type="button"
                    onClick={() => onViewAccount?.(bank)}
                    className="flex-1 min-w-0 flex justify-between items-center p-4 text-left"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{bank.nickname?.trim() || bank.name}</p>
                      {bank.nickname?.trim() && (
                        <p className="text-xs text-gray-400 truncate">{bank.name}</p>
                      )}
                      {bank.last_four && (
                        <span className="text-xs text-gray-400">···· {bank.last_four}</span>
                      )}
                      <p className="text-[11px] text-purple-500 mt-0.5">{t('viewActivity')} →</p>
                    </div>
                    <p className="text-sm font-bold text-purple-600 shrink-0">{formatMoney(bank.balance)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBank(bank)}
                    className="shrink-0 px-4 py-4 text-xs text-gray-400 font-medium border-l border-gray-100 hover:text-purple-600"
                    aria-label={t('editBank')}
                  >
                    {t('edit')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('preferences')}</h2>
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-100">
            <div className="p-4 flex justify-between items-center">
              <p className="text-sm text-gray-700">{t('language')}</p>
              <button
                type="button"
                onClick={toggleLanguage}
                className="text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1"
              >
                {i18n.language === 'es' ? 'ES → EN' : 'EN → ES'}
              </button>
            </div>
            <div className="p-4 flex justify-between items-center">
              <p className="text-sm text-gray-700">{t('currency')}</p>
              <select
                value={currency}
                onChange={handleCurrencyChange}
                aria-label={t('selectCurrency')}
                className="text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1 bg-white max-w-[55%]"
              >
                <option value="USD">🇺🇸 USD — US Dollar</option>
                <option value="MXN">🇲🇽 MXN — Mexican Peso</option>
                <option value="GTQ">🇬🇹 GTQ — Guatemalan Quetzal</option>
                <option value="COP">🇨🇴 COP — Colombian Peso</option>
              </select>
            </div>
            <div className="p-4 flex justify-between items-center">
              <p className="text-sm text-gray-700">{t('dateFormat')}</p>
              <select
                value={dateFormat}
                onChange={handleDateFormatChange}
                aria-label={t('selectDateFormat')}
                className="text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1 bg-white"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('installApp')}</h2>
          <button
            type="button"
            onClick={handleInstall}
            className="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-sm font-medium text-purple-600"
          >
            {t('installAndroid')}
          </button>
          {!installAvailable && (
            <p className="mt-2 text-xs text-gray-400 text-center">{t('installHint')}</p>
          )}
        </section>

        {DEV_MODE && (
          <div className="mt-8">
            <p className="text-xs font-bold text-orange-500 uppercase tracking-widest px-1 mb-3">
              🛠 Dev Tools
            </p>
            <div
              className="rounded-2xl overflow-hidden border border-orange-200"
              style={{ backgroundColor: '#FFF7ED' }}
            >
              <DevWipeButton
                label="Wipe transactions"
                description="Deletes all transactions and zeros bank & card balances"
                onConfirm={() => wipeTable('transactions', { resetBalances: true })}
              />
              <DevWipeButton
                label="Wipe bills & payments"
                description="Deletes bills and bill_payments"
                onConfirm={() => wipeTables(['bills', 'bill_payments'])}
              />
              <DevWipeButton
                label="Wipe everything"
                description="Transactions, bills, budgets, vaults — zeros bank, card & loan balances"
                onConfirm={() => wipeTables([
                  'transactions',
                  'bills',
                  'bill_payments',
                  'budgets',
                  'vaults',
                  'promotional_purchases',
                  'card_statements',
                ], { resetBalances: true, includeLoans: true })}
                danger
              />
              <DevWipeButton
                label="Full reset"
                description="Deletes ALL data including banks, cards, loans"
                onConfirm={() => wipeTables([
                  'transactions',
                  'bills',
                  'bill_payments',
                  'budgets',
                  'vaults',
                  'promotional_purchases',
                  'card_statements',
                  'banks',
                  'credit_cards',
                  'loans',
                ])}
                danger
              />
            </div>
          </div>
        )}

        <div className="mt-10 pt-6" style={{ borderTop: '1px solid #EDE9FE' }}>
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut() }}
            className="w-full py-4 rounded-2xl font-semibold text-sm"
            style={{ backgroundColor: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}
          >
            Sign out
          </button>
        </div>
      </div>
  )

  const modals = (
    <>
      {showAddBank && (
        <AddBankModal
          onClose={() => setShowAddBank(false)}
          onSaved={() => { setShowAddBank(false); refreshBanks() }}
        />
      )}

      {editingBank && (
        <EditBankModal
          bank={editingBank}
          onClose={() => setEditingBank(null)}
          onSaved={() => { setEditingBank(null); refreshBanks() }}
        />
      )}
    </>
  )

  if (onClose) {
    return (
      <div className="fixed inset-0 z-[100]">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl overflow-hidden"
          style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        >
          <div className="flex-shrink-0 pt-3 pb-2 flex justify-center">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>
          <div className="flex-shrink-0 flex items-center justify-between px-6 pb-4">
            <h1 className="text-xl font-bold text-gray-900">{t('settings')}</h1>
            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#F5F3FF' }}
              aria-label={t('close')}
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-8">
            {settingsBody}
          </div>
        </div>
        {modals}
      </div>
    )
  }

  return (
    <div className="bg-lala-50 min-h-full">
      <div
        className="px-6 pb-24"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}
      >
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('settings')}</h1>
        </div>
        {settingsBody}
      </div>
      {modals}
    </div>
  )
}
