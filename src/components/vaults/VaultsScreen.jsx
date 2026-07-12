import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import VaultCard from '../dashboard/VaultCard'
import AddVaultModal from '../dashboard/AddVaultModal'
import EditVaultModal from './EditVaultModal'

export default function VaultsScreen({ onVaultSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [vaults, setVaults] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingVault, setEditingVault] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')

      if (!active) return
      if (data) setVaults(data)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  return (
    <div className="min-h-screen bg-lala-50">
      <div className="bg-white px-6 pt-12 pb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{t('vaults')}</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs text-purple-600 font-medium"
        >
          {t('addVault')}
        </button>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('loading')}</p>
        ) : vaults.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">{t('noVaults')}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-purple-600 text-sm font-medium"
            >
              {t('createFirstVault')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {vaults.map(vault => (
              <VaultCard
                key={vault.id}
                vault={vault}
                onClick={() => setEditingVault(vault)}
              />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-purple-600 text-white text-3xl leading-none shadow-lg flex items-center justify-center"
        aria-label={t('addVault')}
      >
        +
      </button>

      {showAdd && (
        <AddVaultModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            setRefreshKey(k => k + 1)
            onVaultSaved?.()
          }}
        />
      )}

      {editingVault && (
        <EditVaultModal
          vault={editingVault}
          onClose={() => setEditingVault(null)}
          onSaved={() => {
            setEditingVault(null)
            setRefreshKey(k => k + 1)
            onVaultSaved?.()
          }}
        />
      )}
    </div>
  )
}
