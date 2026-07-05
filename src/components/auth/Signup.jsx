import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from 'react-i18next'

export default function Signup({ onToggle }) {
  const { signUp } = useAuth()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signUp(email, password, fullName)
    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center px-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-purple-600">Lala</h1>
          <p className="text-gray-600 mt-4">Check your email to confirm your account.</p>
          <button onClick={onToggle} className="text-purple-600 font-medium mt-6">
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-6">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-purple-600">Lala</h1>
        <p className="text-gray-500 mt-2">{t('signup')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">{t('fullName')}</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-purple-400"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">{t('email')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-purple-400"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">{t('password')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-purple-400"
            required
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 text-white rounded-xl py-3 text-base font-medium mt-2"
        >
          {loading ? '...' : t('signupButton')}
        </button>
      </form>

      <p className="text-center text-gray-500 mt-6 text-sm">
        {t('haveAccount')}{' '}
        <button onClick={onToggle} className="text-purple-600 font-medium">
          {t('loginButton')}
        </button>
      </p>
    </div>
  )
}