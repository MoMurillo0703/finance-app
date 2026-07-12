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

export default function SettingsScreen({ onClose, onBankSaved, onPrefsChanged, onViewAccount }) {
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
              className="w-9 h-9 rounded-full flex items-center justify-center"
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
      <div className="px-6 pt-6 pb-24">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('settings')}</h1>
        </div>
        {settingsBody}
      </div>
      {modals}
    </div>
  )
}
