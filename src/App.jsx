import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/auth/Login'
import Signup from './components/auth/Signup'
import Dashboard from './components/dashboard/Dashboard'
import TransactionsScreen from './components/transactions/TransactionsScreen'
import BillsScreen from './components/bills/BillsScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import BottomNav from './components/layout/BottomNav'

function AppContent() {
  const { user } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  const [activeTab, setActiveTab] = useState('home')
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)

  const bumpDashboard = () => setDashboardRefreshKey(k => k + 1)

  const handleTabChange = (tab) => {
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
        <Dashboard refreshKey={dashboardRefreshKey} />
      </div>
      {activeTab === 'transactions' && (
        <TransactionsScreen onTransactionSaved={bumpDashboard} />
      )}
      {activeTab === 'bills' && <BillsScreen onBillPaid={bumpDashboard} />}
      {activeTab === 'settings' && <SettingsScreen onBankSaved={bumpDashboard} />}
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
