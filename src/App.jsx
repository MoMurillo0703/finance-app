import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/auth/Login'
import Signup from './components/auth/Signup'
import Dashboard from './components/dashboard/Dashboard'
import TransactionsScreen from './components/transactions/TransactionsScreen'
import BillsScreen from './components/bills/BillsScreen'
import CardsScreen from './components/cards/CardsScreen'
import ReportsScreen from './components/reports/ReportsScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import BottomNav from './components/layout/BottomNav'
import AppHeader from './components/layout/AppHeader'
import { getBankDisplayName } from './utils/bank'

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
    setTxFilter({ creditCardId: card.id, cardName: card.name, from: 'cards' })
    setActiveTab('transactions')
  }

  const viewAccountTransactions = (bank) => {
    setTxFilter({ bankId: bank.id, bankName: getBankDisplayName(bank), from: 'settings' })
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
      <AppHeader activeTab={activeTab} />
      <main className="pt-14 pb-20">
        {activeTab === 'home' && (
          <Dashboard
            refreshKey={`${dashboardRefreshKey}-${prefsVersion}`}
            onViewReports={() => handleTabChange('reports')}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsScreen
            key={prefsVersion}
            filterCreditCardId={txFilter?.creditCardId}
            filterCardName={txFilter?.cardName}
            filterBankId={txFilter?.bankId}
            filterBankName={txFilter?.bankName}
            onClearFilter={() => {
              const dest = txFilter?.from || 'home'
              setTxFilter(null)
              setActiveTab(dest)
            }}
            onTransactionSaved={bumpDashboard}
          />
        )}
        {activeTab === 'bills' && <BillsScreen key={prefsVersion} onBillPaid={bumpDashboard} />}
        {activeTab === 'reports' && <ReportsScreen key={prefsVersion} />}
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
            onViewAccount={viewAccountTransactions}
          />
        )}
      </main>
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
