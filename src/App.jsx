import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/auth/Login'
import Signup from './components/auth/Signup'

function AppContent() {
  const { user } = useAuth()
  const [showSignup, setShowSignup] = useState(false)

  if (!user) {
    return showSignup
      ? <Signup onToggle={() => setShowSignup(false)} />
      : <Login onToggle={() => setShowSignup(true)} />
  }

  return (
    <div className="min-h-screen bg-white px-6 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-purple-600">Lala</h1>
      </div>
      <p className="text-gray-600">Welcome back! Dashboard coming soon.</p>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}