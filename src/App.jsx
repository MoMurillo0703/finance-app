import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/auth/Login'
import Signup from './components/auth/Signup'
import Dashboard from './components/dashboard/Dashboard'
import TransactionsScreen from './components/transactions/TransactionsScreen'
import VaultsScreen from './components/vaults/VaultsScreen'
import BottomNav from './components/layout/BottomNav'

function AppContent() {
  const { user } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  const [activeTab, setActiveTab] = useState('home')

  if (!user) {
    return showSignup
      ? <Signup onToggle={() => setShowSignup(false)} />
      : <Login onToggle={() => setShowSignup(true)} />
  }

  return (
    <div className="pb-20">
      {activeTab === 'home' && <Dashboard />}
      {activeTab === 'transactions' && <TransactionsScreen />}
      {activeTab === 'vaults' && <VaultsScreen />}
      {activeTab === 'settings' && (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-400">Ajustes — próximamente</p>
        </div>
      )}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
