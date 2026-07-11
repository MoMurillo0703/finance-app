import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getUserCurrency } from '../../utils/currency'
import { insertBank } from '../../utils/bank'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

export default function OnboardingFlow({ onComplete, onGoToDashboard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('checking')
  const balanceInput = useCurrencyInput()
  const currency = getUserCurrency()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleAddAccount = async () => {
    if (!name.trim()) {
      setError(t('bankNameRequired'))
      return
    }
    if (!balanceInput.raw || balanceInput.numericValue < 0) {
      setError(t('invalidAmount'))
      return
    }

    setSaving(true)
    setError('')

    const { error: dbError } = await insertBank(supabase, {
      user_id: user.id,
      name: name.trim(),
      type: accountType,
      balance: balanceInput.numericValue,
      is_active: true,
    })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setStep(3)
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-50" />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />

        {step === 1 && (
          <div className="text-center">
            <p className="text-4xl mb-4">👋</p>
            <h2 className="text-xl font-bold text-gray-800 mb-2">{t('welcomeToLala')}</h2>
            <p className="text-sm text-gray-500 mb-1">{t('onboardingSubtitle')}</p>
            <p className="text-sm text-gray-500 mb-8">{t('onboardingSetupTime')}</p>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-medium mb-3"
            >
              {t('getStarted')} →
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
            >
              {t('skipForNow')}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">{t('onboardingAddFirstBank')}</h2>
            <p className="text-xs text-gray-400 mb-5">{t('onboardingAddFirstBankHint')}</p>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('bankName')}</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  placeholder={t('bankNamePlaceholder')}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('accountType')}</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  value={accountType}
                  onChange={e => setAccountType(e.target.value)}
                >
                  <option value="checking">{t('checking')}</option>
                  <option value="savings">{t('savings')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  {t('currentBalance')} ({currency})
                </label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  type="text"
                  inputMode="decimal"
                  placeholder={currencyAmountPlaceholder(currency)}
                  value={balanceInput.displayValue}
                  onChange={balanceInput.handleChange}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddAccount}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-medium mb-3 disabled:opacity-50"
            >
              {saving ? '...' : `${t('onboardingAddAccount')} →`}
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
            >
              {t('onboardingSkip')} →
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <p className="text-4xl mb-4">🎉</p>
            <h2 className="text-xl font-bold text-gray-800 mb-2">{t('youreAllSet')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('onboardingReadyIntro')}</p>
            <ul className="text-sm text-gray-600 text-left space-y-2 mb-8 max-w-xs mx-auto">
              <li>• {t('onboardingFeature1')}</li>
              <li>• {t('onboardingFeature2')}</li>
              <li>• {t('onboardingFeature3')}</li>
              <li>• {t('onboardingFeature4')}</li>
            </ul>
            <button
              type="button"
              onClick={onGoToDashboard}
              className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
            >
              {t('goToDashboard')} →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
