import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import { getBankDisplayName } from './utils/bank'
import { supabase } from './lib/supabase'

function AppContent() {
  const { user } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  const [activeTab, setActiveTab] = useState('home')
  const [showSettings, setShowSettings] = useState(false)
  const [hideNav, setHideNav] = useState(false)
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const [prefsVersion, setPrefsVersion] = useState(0)
  const [txFilter, setTxFilter] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [cardDetailRequest, setCardDetailRequest] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const bumpDashboard = () => setDashboardRefreshKey(k => k + 1)
  const bumpPrefs = () => setPrefsVersion(v => v + 1)
  const navHidden = hideNav || showSettings || showOnboarding
  const openSettings = () => setShowSettings(true)

  const openCardPromotions = (cardId) => {
    setCardDetailRequest({ cardId, initialTab: 'promotions' })
    setActiveTab('accounts')
  }

  const completeOnboarding = async () => {
    localStorage.setItem('lala_onboarded', 'true')
    setShowOnboarding(false)
    bumpDashboard()

    const { error } = await supabase.from('profiles').upsert({
      user_id: user.id,
      full_name: user.user_metadata?.full_name || null,
      currency: localStorage.getItem('currency') || 'USD',
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    if (error) console.error('Unable to save onboarding profile:', error.message)
  }

  useEffect(() => {
    if (!user) {
      setShowOnboarding(false)
      return
    }
    if (localStorage.getItem('lala_onboarded')) return

    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('banks')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      if (!active) return
      if (!error && (!data || data.length === 0)) setShowOnboarding(true)
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

  if (showOnboarding) {
    return <OnboardingFlow onComplete={completeOnboarding} />
  }

  return (
    <div className="min-h-screen bg-lala-50 pb-20">
      <div>
        {activeTab === 'home' && (
          <Dashboard
            refreshKey={`${dashboardRefreshKey}-${prefsVersion}`}
            onNavigate={setActiveTab}
            setHideNav={setHideNav}
            onSettings={openSettings}
            onOpenCardPromo={openCardPromotions}
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
            setHideNav={setHideNav}
            onSettings={openSettings}
            showToast={showToast}
          />
        )}
        {activeTab === 'bills' && (
          <BillsScreen
            key={prefsVersion}
            onBillPaid={bumpDashboard}
            onSettings={openSettings}
            showToast={showToast}
          />
        )}
        {activeTab === 'accounts' && (
          <AccountsScreen
            key={prefsVersion}
            refreshKey={dashboardRefreshKey}
            onAccountSaved={bumpDashboard}
            setHideNav={setHideNav}
            onSettings={openSettings}
            cardDetailRequest={cardDetailRequest}
            onCardDetailRequestHandled={() => setCardDetailRequest(null)}
          />
        )}
        {activeTab === 'reports' && (
          <ReportsScreen
            key={prefsVersion}
            setHideNav={setHideNav}
            onSettings={openSettings}
            showToast={showToast}
          />
        )}
      </div>

      {!navHidden && <BottomNav active={activeTab} onChange={handleTabChange} />}

      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-2xl shadow-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#7C3AED' }}
        >
          {toast}
        </div>
      )}

      {showSettings && (
        <SettingsScreen
          key={prefsVersion}
          onClose={() => setShowSettings(false)}
          onBankSaved={bumpDashboard}
          onPrefsChanged={bumpPrefs}
          onViewAccount={viewAccountTransactions}
        />
      )}

    </div>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
