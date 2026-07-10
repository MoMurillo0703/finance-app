import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddBankModal from '../dashboard/AddBankModal'
import EditBankModal from './EditBankModal'

const formatCOP = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)

export default function SettingsScreen({ onBankSaved }) {
  const { user, signOut } = useAuth()
  const { t, i18n } = useTranslation()
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddBank, setShowAddBank] = useState(false)
  const [editingBank, setEditingBank] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [payday1, setPayday1] = useState('15')
  const [payday2, setPayday2] = useState('30')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('banks')
        .select('id, name, balance')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')

      const { data: settings } = await supabase
        .from('user_settings')
        .select('payday_1, payday_2')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!active) return
      setBanks(data ?? [])
      if (settings) {
        if (settings.payday_1 != null) setPayday1(String(settings.payday_1))
        if (settings.payday_2 != null) setPayday2(String(settings.payday_2))
      }
      setSettingsLoaded(true)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const refreshBanks = () => {
    setRefreshKey(k => k + 1)
    onBankSaved?.()
  }

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es')
  }

  const savePayday = async (field, value) => {
    const day = parseInt(value, 10)
    if (isNaN(day) || day < 1 || day > 31) return

    const payload = {
      user_id: user.id,
      payday_1: field === 'payday_1' ? day : parseInt(payday1, 10),
      payday_2: field === 'payday_2' ? day : parseInt(payday2, 10),
    }

    await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
  }

  const handlePayday1Change = (value) => {
    setPayday1(value)
    if (settingsLoaded) savePayday('payday_1', value)
  }

  const handlePayday2Change = (value) => {
    setPayday2(value)
    if (settingsLoaded) savePayday('payday_2', value)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-6 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-gray-800">{t('settings')}</h1>
      </div>

      <div className="px-6 py-6 space-y-8">
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-700">{t('myAccounts')}</h2>
            <button
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
                onClick={() => setShowAddBank(true)}
                className="mt-3 text-purple-600 text-sm font-medium"
              >
                {t('addBank')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {banks.map(bank => (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => setEditingBank(bank)}
                  className="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex justify-between items-center text-left"
                >
                  <p className="text-sm font-medium text-gray-700">{bank.name}</p>
                  <p className="text-sm font-bold text-purple-600">{formatCOP(bank.balance)}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('payday')}</h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('payday1')}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                type="number"
                min="1"
                max="31"
                value={payday1}
                onChange={e => handlePayday1Change(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('payday2')}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                type="number"
                min="1"
                max="31"
                value={payday2}
                onChange={e => handlePayday2Change(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('preferences')}</h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex justify-between items-center">
            <p className="text-sm text-gray-700">{t('language')}</p>
            <button
              onClick={toggleLanguage}
              className="text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1"
            >
              {i18n.language === 'es' ? 'ES → EN' : 'EN → ES'}
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('accountSection')}</h2>
          <button
            onClick={signOut}
            className="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-sm text-red-500 font-medium"
          >
            {t('logout')}
          </button>
        </section>
      </div>

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
    </div>
  )
}
