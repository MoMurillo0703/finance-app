import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import SafeToSpend from './SafeToSpend'
import VaultCard from './VaultCard'
import AddVaultModal from './AddVaultModal'
import AddBankModal from './AddBankModal'

export default function Dashboard({ refreshKey }) {
  const { user, signOut } = useAuth()
  const { t, i18n } = useTranslation()
  const [vaults, setVaults] = useState([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddVault, setShowAddVault] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [modalRefreshKey, setModalRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data: vaultsData } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const { data: banksData } = await supabase
        .from('banks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (!active) return

      setVaults(vaultsData ?? [])
      setTotalBalance((banksData ?? []).reduce((sum, bank) => sum + (bank.balance || 0), 0))
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey, modalRefreshKey])

  const protectedAmount = vaults.reduce((sum, v) => sum + (v.current_amount || 0), 0)
  const safeToSpend = totalBalance - protectedAmount

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">{t('loading')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-6 pt-12 pb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-purple-600">Lala</h1>
        <div className="flex gap-3 items-center">
          <button
            onClick={toggleLanguage}
            className="text-xs text-gray-400 border border-gray-200 rounded-full px-3 py-1"
          >
            {i18n.language === 'es' ? 'EN' : 'ES'}
          </button>
          <button onClick={signOut} className="text-xs text-gray-400">
            {t('logout')}
          </button>
        </div>
      </div>

      <div className="px-6 py-6">
        <SafeToSpend amount={safeToSpend} />

        <div className="flex gap-4 mb-6">
          <div className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <p className="text-xs text-gray-400">{t('totalBalance')}</p>
              <button onClick={() => setShowAddBank(true)} className="text-xs text-purple-600 font-medium">+</button>
            </div>
            <p className="text-lg font-bold text-gray-800">
              {new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
              }).format(totalBalance)}
            </p>
          </div>
          <div className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-400 mb-1">{t('protected')}</p>
            <p className="text-lg font-bold text-gray-800">
              {new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
              }).format(protectedAmount)}
            </p>
          </div>
        </div>

        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-700">{t('vaults')}</h2>
          <button onClick={() => setShowAddVault(true)} className="text-xs text-purple-600 font-medium">{t('addVault')}</button>
        </div>

        {vaults.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">{t('noVaults')}</p>
            <button onClick={() => setShowAddVault(true)} className="mt-3 text-purple-600 text-sm font-medium">
              {t('createFirstVault')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {vaults.map(vault => (
              <VaultCard key={vault.id} vault={vault} />
            ))}
          </div>
        )}
      </div>

      {showAddVault && (
        <AddVaultModal
          onClose={() => setShowAddVault(false)}
          onSaved={() => { setShowAddVault(false); setModalRefreshKey(k => k + 1) }}
        />
      )}

      {showAddBank && (
        <AddBankModal
          onClose={() => setShowAddBank(false)}
          onSaved={() => { setShowAddBank(false); setModalRefreshKey(k => k + 1) }}
        />
      )}
    </div>
  )
}