import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/auth/Login'
import Signup from './components/auth/Signup'
import Dashboard from './components/dashboard/Dashboard'
import TransactionsScreen from './components/transactions/TransactionsScreen'
import BillsScreen from './components/bills/BillsScreen'
import CardsScreen from './components/cards/CardsScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import BottomNav from './components/layout/BottomNav'

function AppContent() {
  const { user } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  const [activeTab, setActiveTab] = useState('home')
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const [prefsVersion, setPrefsVersion] = useState(0)
  const [txFilter, setTxFilter] = useState(null)

  const bumpDashboard = () => setDashboardRefreshKey(k => k + 1)
  const bumpPrefs = () => setPrefsVersion(v => v + 1)

  const viewCardTransactions = (card) => {
    setTxFilter({ creditCardId: card.id, cardName: card.name })
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
    <div className="pb-20">
      <div className={activeTab === 'home' ? '' : 'hidden'}>
        <Dashboard refreshKey={`${dashboardRefreshKey}-${prefsVersion}`} />
      </div>
      {activeTab === 'transactions' && (
        <TransactionsScreen
          key={prefsVersion}
          filterCreditCardId={txFilter?.creditCardId}
          filterCardName={txFilter?.cardName}
          onClearFilter={() => {
            setTxFilter(null)
            setActiveTab('cards')
          }}
          onTransactionSaved={bumpDashboard}
        />
      )}
      {activeTab === 'bills' && <BillsScreen key={prefsVersion} onBillPaid={bumpDashboard} />}
      {activeTab === 'cards' && (
        <CardsScreen
          key={prefsVersion}
          onCardSaved={bumpDashboard}
          onViewTransactions={viewCardTransactions}
        />
      )}
      {activeTab === 'settings' && (
        <SettingsScreen
          key={prefsVersion}
          onBankSaved={bumpDashboard}
          onPrefsChanged={bumpPrefs}
        />
      )}
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
