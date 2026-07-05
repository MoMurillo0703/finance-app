import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from 'react-i18next'

export default function Login({ onToggle }) {
  const { signIn } = useAuth()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-6">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-purple-600">Lala</h1>
        <p className="text-gray-500 mt-2">{t('welcome')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          {loading ? '...' : t('loginButton')}
        </button>
      </form>

      <p className="text-center text-gray-500 mt-6 text-sm">
        {t('noAccount')}{' '}
        <button onClick={onToggle} className="text-purple-600 font-medium">
          {t('signupButton')}
        </button>
      </p>
    </div>
  )
}