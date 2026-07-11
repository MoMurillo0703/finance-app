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
import PurchaseSimulator from '../simulator/PurchaseSimulator'
import DebtPayoffPlanner from '../debt/DebtPayoffPlanner'
import { formatMoney } from '../../utils/currency'
import { fetchBanks } from '../../utils/bank'
import { calculateNetWorth } from '../../utils/netWorth'

export default function Dashboard({ refreshKey, onNavigate, setHideNav }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [vaults, setVaults] = useState([])
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [loans, setLoans] = useState([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddVault, setShowAddVault] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [editingVault, setEditingVault] = useState(null)
  const [modalRefreshKey, setModalRefreshKey] = useState(0)
  const [showPaydayWizard, setShowPaydayWizard] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [showDebtPlanner, setShowDebtPlanner] = useState(false)

  useEffect(() => {
    let active = true

    ;(async () => {
      const [
        { data: vaultsData },
        { data: banksData },
        { data: cardsData },
        { data: loansData },
      ] = await Promise.all([
        supabase
          .from('vaults')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
        fetchBanks(supabase, user.id),
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('loans')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      if (!active) return

      setVaults(vaultsData ?? [])
      setBanks(banksData ?? [])
      setCreditCards(cardsData ?? [])
      setLoans(loansData ?? [])
      setTotalBalance((banksData ?? []).reduce((sum, bank) => sum + (bank.balance || 0), 0))
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey, modalRefreshKey])

  const protectedAmount = vaults.reduce((sum, v) => sum + (v.current_amount || 0), 0)
  const safeToSpend = totalBalance - protectedAmount
  const {
    netWorth,
    totalAssets,
    totalLiabilities,
    totalBankBalance,
    totalVaultSavings,
    totalCreditCardDebt,
    totalLoanDebt,
  } = calculateNetWorth({ banks, vaults, creditCards, loans })
  const dataRefreshKey = `${refreshKey}-${modalRefreshKey}`
  const onboardingComplete = localStorage.getItem('onboarding_complete') === 'true'
  const showAccountsEmpty = onboardingComplete && banks.length === 0

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
        {showAccountsEmpty ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🏦</p>
            <p className="font-medium text-gray-600">{t('noAccounts')}</p>
            <p className="text-sm mt-1">{t('noAccountsHint')}</p>
            <button
              type="button"
              onClick={() => onNavigate?.('accounts')}
              className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm"
            >
              {t('addAccount')}
            </button>
          </div>
        ) : (
          <>
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

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex justify-between items-start mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('netWorth')}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              netWorth >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
            }`}>
              {netWorth >= 0 ? `↑ ${t('positive')}` : `↓ ${t('negative')}`}
            </span>
          </div>

          <p className={`text-3xl font-bold mb-4 ${netWorth >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
            {formatMoney(netWorth)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">{t('assets')}</p>
              <p className="font-bold text-green-600">{formatMoney(totalAssets)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {formatMoney(totalBankBalance)} {t('netWorthCash')} · {formatMoney(totalVaultSavings)} {t('netWorthSaved')}
              </p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">{t('liabilities')}</p>
              <p className="font-bold text-red-500">{formatMoney(totalLiabilities)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {formatMoney(totalCreditCardDebt)} {t('netWorthCards')} · {formatMoney(totalLoanDebt)} {t('netWorthLoans')}
              </p>
            </div>
          </div>

          {(totalCreditCardDebt > 0 || totalLoanDebt > 0) && (
            <button
              type="button"
              onClick={() => setShowDebtPlanner(true)}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 transition-colors"
            >
              {t('payoffPlan')} →
            </button>
          )}
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

        <button
          type="button"
          onClick={() => setShowSimulator(true)}
          className="w-full py-2.5 rounded-2xl border border-purple-200 text-purple-600 font-medium text-sm"
        >
          🤔 {t('canIAfford')}
        </button>

        {!onboardingComplete && totalBalance === 0 && vaults.length === 0 && (
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

        <MonthSnapshot
          refreshKey={dataRefreshKey}
          onViewReports={() => onNavigate?.('reports')}
        />

        <BillsThisWeek refreshKey={dataRefreshKey} />
          </>
        )}

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
          {vaults.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border border-gray-100">
              <p className="text-3xl mb-2">🏦</p>
              <p className="font-medium text-gray-600 text-sm">{t('noVaults')}</p>
              <p className="text-xs mt-1">{t('noVaultsEmptyHint')}</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {vaults.map(vault => (
                <VaultMiniCard
                  key={vault.id}
                  vault={vault}
                  onClick={() => setEditingVault(vault)}
                />
              ))}
            </div>
          )}
        </div>
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

      {showSimulator && (
        <PurchaseSimulator
          onClose={() => setShowSimulator(false)}
          onSaved={() => setModalRefreshKey(k => k + 1)}
        />
      )}

      {showDebtPlanner && (
        <DebtPayoffPlanner
          onClose={() => setShowDebtPlanner(false)}
          setHideNav={setHideNav}
        />
      )}
    </div>
  )
}
