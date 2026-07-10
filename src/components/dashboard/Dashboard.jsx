import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import VaultMiniCard from './VaultMiniCard'
import AddVaultModal from './AddVaultModal'
import AddBankModal from './AddBankModal'
import EditVaultModal from '../vaults/EditVaultModal'
import MonthSnapshot from './MonthSnapshot'
import BillsThisWeek from './BillsThisWeek'
import PaydayWizard from '../payday/PaydayWizard'
import { formatMoney } from '../../utils/currency'

export default function Dashboard({ refreshKey, onViewReports }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [vaults, setVaults] = useState([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddVault, setShowAddVault] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [editingVault, setEditingVault] = useState(null)
  const [modalRefreshKey, setModalRefreshKey] = useState(0)
  const [showPaydayWizard, setShowPaydayWizard] = useState(false)

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
  const dataRefreshKey = `${refreshKey}-${modalRefreshKey}`

  if (loading) {
    return (
      <div className="bg-gray-50 flex items-center justify-center py-20">
        <p className="text-gray-400">{t('loading')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pt-4 pb-6 space-y-4">
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-3xl p-5 text-white shadow-lg">
          <p className="text-xs font-medium text-purple-200 uppercase tracking-wider mb-1">{t('safeToSpend')}</p>
          <p className="text-4xl font-bold mb-1">{formatMoney(safeToSpend)}</p>
          <p className="text-xs text-purple-200 mb-4">{t('safeToSpendSubtitle')}</p>
          <div className="flex gap-4 pt-3 border-t border-purple-500">
            <div>
              <p className="text-[10px] text-purple-300">{t('totalBalance')}</p>
              <p className="text-sm font-semibold">{formatMoney(totalBalance)}</p>
            </div>
            <div className="w-px bg-purple-500" />
            <div>
              <p className="text-[10px] text-purple-300">{t('protected')}</p>
              <p className="text-sm font-semibold">{formatMoney(protectedAmount)}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowPaydayWizard(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-500 text-white font-semibold text-sm shadow-sm hover:bg-amber-600 transition-colors"
          >
            💰 {t('gotPaid')}
          </button>
          <button
            type="button"
            onClick={() => setShowAddVault(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-200 text-purple-600 font-semibold text-sm shadow-sm"
          >
            + {t('addVault')}
          </button>
        </div>

        {totalBalance === 0 && vaults.length === 0 && (
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5 text-center">
            <p className="text-2xl mb-2">👋</p>
            <p className="text-sm font-semibold text-purple-700 mb-1">{t('welcomeOnboardingTitle')}</p>
            <p className="text-xs text-purple-500 mb-4">{t('welcomeOnboardingBody')}</p>
            <button
              type="button"
              onClick={() => setShowAddBank(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium"
            >
              {t('onboardingAddBank')}
            </button>
          </div>
        )}

        <MonthSnapshot refreshKey={dataRefreshKey} onViewReports={onViewReports} />

        <BillsThisWeek refreshKey={dataRefreshKey} />

        {vaults.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('vaults')}</p>
              <button
                type="button"
                onClick={() => setShowAddVault(true)}
                className="text-xs text-purple-600 font-medium"
              >
                + {t('addVault')}
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {vaults.map(vault => (
                <VaultMiniCard
                  key={vault.id}
                  vault={vault}
                  onClick={() => setEditingVault(vault)}
                />
              ))}
            </div>
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

      {editingVault && (
        <EditVaultModal
          vault={editingVault}
          onClose={() => setEditingVault(null)}
          onSaved={() => { setEditingVault(null); setModalRefreshKey(k => k + 1) }}
        />
      )}

      {showPaydayWizard && (
        <PaydayWizard
          onClose={() => setShowPaydayWizard(false)}
          onComplete={() => {
            setShowPaydayWizard(false)
            setModalRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}
