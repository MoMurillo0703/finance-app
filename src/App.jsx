import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/auth/Login'
import Signup from './components/auth/Signup'
import Dashboard from './components/dashboard/Dashboard'
import TransactionsScreen from './components/transactions/TransactionsScreen'
import BillsScreen from './components/bills/BillsScreen'
import AccountsScreen from './components/accounts/AccountsScreen'
import ReportsScreen from './components/reports/ReportsScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import BottomNav from './components/layout/BottomNav'
import AppHeader from './components/layout/AppHeader'
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import { getBankDisplayName, fetchBanks } from './utils/bank'
import { supabase } from './lib/supabase'

function AppContent() {
  const { user } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  const [activeTab, setActiveTab] = useState('home')
  const [showSettings, setShowSettings] = useState(false)
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const [prefsVersion, setPrefsVersion] = useState(0)
  const [txFilter, setTxFilter] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const bumpDashboard = () => setDashboardRefreshKey(k => k + 1)
  const bumpPrefs = () => setPrefsVersion(v => v + 1)

  const completeOnboarding = () => {
    localStorage.setItem('onboarding_complete', 'true')
    setShowOnboarding(false)
    bumpDashboard()
  }

  useEffect(() => {
    if (!user) return
    if (localStorage.getItem('onboarding_complete') === 'true') return

    let active = true
    ;(async () => {
      const { data } = await fetchBanks(supabase, user.id)
      if (!active) return
      if ((data ?? []).length === 0) setShowOnboarding(true)
    })()

    return () => { active = false }
  }, [user])

  const viewAccountTransactions = (bank) => {
    setShowSettings(false)
    setTxFilter({ bankId: bank.id, bankName: getBankDisplayName(bank), from: 'home' })
    setActiveTab('transactions')
  }

  const handleTabChange = (tab) => {
    if (tab === 'transactions' && activeTab !== 'transactions') {
      setTxFilter(null)
    }
    setActiveTab(tab)
    if (tab === 'home') bumpDashboard()
  }

  if (!user) {
    return showSignup
      ? <Signup onToggle={() => setShowSignup(false)} />
      : <Login onToggle={() => setShowSignup(true)} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        activeTab={activeTab}
        onSettings={() => setShowSettings(true)}
      />
      <main className="pt-14 pb-20">
        {activeTab === 'home' && (
          <Dashboard
            refreshKey={`${dashboardRefreshKey}-${prefsVersion}`}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsScreen
            key={prefsVersion}
            filterCreditCardId={txFilter?.creditCardId}
            filterCardName={txFilter?.cardName}
            filterBankId={txFilter?.bankId}
            filterBankName={txFilter?.bankName}
            filterFrom={txFilter?.from}
            onClearFilter={() => {
              const dest = txFilter?.from || 'home'
              setTxFilter(null)
              setActiveTab(dest)
            }}
            onTransactionSaved={bumpDashboard}
          />
        )}
        {activeTab === 'bills' && <BillsScreen key={prefsVersion} onBillPaid={bumpDashboard} />}
        {activeTab === 'accounts' && (
          <AccountsScreen
            key={prefsVersion}
            refreshKey={dashboardRefreshKey}
            onAccountSaved={bumpDashboard}
          />
        )}
        {activeTab === 'reports' && <ReportsScreen key={prefsVersion} />}
      </main>
      <BottomNav active={activeTab} onChange={handleTabChange} />

      {showSettings && (
        <SettingsScreen
          key={prefsVersion}
          onClose={() => setShowSettings(false)}
          onBankSaved={bumpDashboard}
          onPrefsChanged={bumpPrefs}
          onViewAccount={viewAccountTransactions}
        />
      )}

      {showOnboarding && (
        <OnboardingFlow
          onComplete={completeOnboarding}
          onGoToDashboard={() => {
            completeOnboarding()
            setActiveTab('home')
          }}
        />
      )}
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
