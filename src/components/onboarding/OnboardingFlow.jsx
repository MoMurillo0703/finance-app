import { useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { insertBank, buildBankInsertRow } from '../../utils/bank'

const CURRENCIES = [
  { flag: '🇺🇸', label: 'United States', sub: 'US Dollar · USD', value: 'USD' },
  { flag: '🇲🇽', label: 'México', sub: 'Peso Mexicano · MXN', value: 'MXN' },
  { flag: '🇨🇴', label: 'Colombia', sub: 'Peso Colombiano · COP', value: 'COP' },
  { flag: '🇬🇹', label: 'Guatemala', sub: 'Quetzal · GTQ', value: 'GTQ' },
]

const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Store']
const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

function Progress({ step }) {
  return (
    <div className="w-full h-1 bg-gray-100 rounded-full mb-6">
      <div
        className="h-1 rounded-full transition-all duration-300"
        style={{ width: `${((step - 1) / 3) * 100}%`, backgroundColor: '#7C3AED' }}
      />
    </div>
  )
}

function sanitizeAmount(value, currency) {
  if (currency === 'COP') return value.replace(/\D/g, '')
  const cleaned = value.replace(/[^\d.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

export default function OnboardingFlow({ onComplete }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankNickname, setBankNickname] = useState('')
  const [bankBalance, setBankBalance] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardNetwork, setCardNetwork] = useState('Visa')
  const [cardLimit, setCardLimit] = useState('')
  const [cardBalance, setCardBalance] = useState('')
  const [cardApr, setCardApr] = useState('')
  const [statementDay, setStatementDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const firstName = user?.user_metadata?.full_name?.trim().split(/\s+/)[0]
    || user?.email?.split('@')[0]
    || 'friend'

  const chooseCurrency = () => {
    if (!selectedCurrency) return
    localStorage.setItem('currency', selectedCurrency)
    setStep(3)
  }

  const saveBank = async () => {
    if (!bankName.trim()) {
      setError('Bank name is required.')
      return
    }
    if (bankBalance === '' || Number(bankBalance) < 0) {
      setError('Enter a valid current balance.')
      return
    }
    setSaving(true)
    setError('')
    const { error: dbError } = await insertBank(supabase, buildBankInsertRow({
      user_id: user.id,
      name: bankName.trim(),
      nickname: bankNickname.trim(),
      accountType: 'checking',
      balance: Number(bankBalance),
      is_active: true,
    }))
    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }
    setSaving(false)
    setStep(4)
  }

  const validDay = value => Number(value) >= 1 && Number(value) <= 31

  const saveCard = async () => {
    if (!cardName.trim() || cardBalance === '') return
    if (cardLimit === '' || Number(cardLimit) <= 0) {
      setError('Enter a valid credit limit.')
      return
    }
    if (!validDay(statementDay) || !validDay(dueDay)) {
      setError('Statement and payment days must be between 1 and 31.')
      return
    }

    setSaving(true)
    setError('')
    const row = {
      user_id: user.id,
      name: cardName.trim(),
      network: cardNetwork,
      credit_limit: Number(cardLimit),
      current_balance: Number(cardBalance),
      statement_date: Number(statementDay),
      due_date: Number(dueDay),
      currency: selectedCurrency,
      is_active: true,
    }
    if (cardApr !== '' && !Number.isNaN(Number(cardApr))) {
      row.interest_rate = Number(cardApr)
    }

    const { data: card, error: cardError } = await supabase
      .from('credit_cards')
      .insert(row)
      .select('id')
      .single()

    if (cardError) {
      setError(cardError.message)
      setSaving(false)
      return
    }

    const { error: billError } = await supabase.from('bills').insert({
      user_id: user.id,
      name: `${cardName.trim()} - Minimum Payment`,
      amount: 0,
      due_day: Number(dueDay),
      credit_card_id: card.id,
      is_auto_card_bill: true,
      is_active: true,
    })

    if (billError) {
      console.error('Card saved, but its automatic minimum-payment bill was not created:', billError.message)
    }

    setSaving(false)
    setStep(5)
  }

  if (step === 1) {
    return (
      <div
        className="fixed inset-0 z-[200] min-h-screen flex flex-col items-center justify-center px-8 text-center"
        style={{ background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 50%, #C4B5FD 100%)' }}
      >
        <div className="text-6xl mb-6">👋</div>
        <h1 className="text-3xl font-bold text-white mb-3">Welcome to Lala</h1>
        <p className="text-purple-200 text-lg mb-2">Your money, finally making sense.</p>
        <p className="text-purple-300 text-sm mb-12">Takes 2 minutes to set up.</p>
        <button
          type="button"
          onClick={() => setStep(2)}
          className="w-full max-w-xs py-4 rounded-2xl bg-white font-bold text-purple-700 text-base"
        >
          Let&apos;s go →
        </button>
      </div>
    )
  }

  if (step === 5) {
    return (
      <div className="fixed inset-0 z-[200] min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          You&apos;re all set, {firstName}!
        </h2>
        <p className="text-gray-500 mb-12">
          Your dashboard is ready. Start by logging your first expense.
        </p>
        <button
          type="button"
          onClick={onComplete}
          className="w-full max-w-xs py-4 rounded-2xl text-white font-bold"
          style={{ backgroundColor: '#7C3AED' }}
        >
          Go to my dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] min-h-screen bg-white overflow-y-auto">
      <div className="min-h-screen flex flex-col px-6 pb-10 max-w-lg mx-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3rem)' }}>
        <Progress step={step} />
        {step === 2 && (
          <>
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-2">
              Step 1 of 3
            </p>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Where do you bank?</h2>
            <p className="text-gray-500 text-sm mb-8">
              This sets your currency and number format.
            </p>
            <div className="flex flex-col gap-3 flex-1">
              {CURRENCIES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedCurrency(opt.value)}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all"
                  style={{
                    borderColor: selectedCurrency === opt.value ? '#7C3AED' : '#E5E7EB',
                    backgroundColor: selectedCurrency === opt.value ? '#F5F3FF' : 'white',
                  }}
                >
                  <span className="text-3xl">{opt.flag}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{opt.label}</p>
                    <p className="text-sm text-gray-400">{opt.sub}</p>
                  </div>
                  {selectedCurrency === opt.value && (
                    <div
                      className="ml-auto w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#7C3AED' }}
                    >
                      <Check size={14} color="white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={chooseCurrency}
              disabled={!selectedCurrency}
              className="w-full py-4 rounded-2xl text-white font-bold mt-6 disabled:opacity-40"
              style={{ backgroundColor: '#7C3AED' }}
            >
              Continue →
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-2">
              Step 2 of 3
            </p>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Add your main bank</h2>
            <p className="text-gray-500 text-sm mb-8">
              Just your checking account is enough to start.
            </p>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="space-y-4 flex-1">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Bank name</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Chase"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nickname (optional)</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Main checking"
                  value={bankNickname}
                  onChange={e => setBankNickname(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Current balance ({selectedCurrency})
                </label>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="0"
                  value={bankBalance}
                  onChange={e => setBankBalance(sanitizeAmount(e.target.value, selectedCurrency))}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={saveBank}
              disabled={saving || !bankName.trim() || bankBalance === ''}
              className="w-full py-4 rounded-2xl text-white font-bold mt-6 disabled:opacity-40"
              style={{ backgroundColor: '#7C3AED' }}
            >
              {saving ? 'Saving…' : 'Add bank & continue →'}
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-2">
              Step 3 of 3
            </p>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Any credit cards?</h2>
            <p className="text-gray-500 text-sm mb-8">
              Add one now or skip — you can always add more later.
            </p>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="space-y-4 flex-1">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Card name</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Chase Freedom"
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Network</label>
                <div className="grid grid-cols-3 gap-2">
                  {NETWORKS.map(network => (
                    <button
                      key={network}
                      type="button"
                      onClick={() => setCardNetwork(network)}
                      className={`py-2 rounded-xl text-xs font-medium border ${
                        cardNetwork === network
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {network}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Credit limit</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    placeholder="0"
                    value={cardLimit}
                    onChange={e => setCardLimit(sanitizeAmount(e.target.value, selectedCurrency))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Balance</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    placeholder="0"
                    value={cardBalance}
                    onChange={e => setCardBalance(sanitizeAmount(e.target.value, selectedCurrency))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Interest rate (APR %)</label>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="e.g. 24.99"
                  value={cardApr}
                  onChange={e => setCardApr(sanitizeAmount(e.target.value, 'USD'))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Statement closes</label>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="Day (1–31)"
                    value={statementDay}
                    onChange={e => setStatementDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Payment due</label>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="Day (1–31)"
                    value={dueDay}
                    onChange={e => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 mt-6">
              <button
                type="button"
                onClick={saveCard}
                disabled={saving || !cardName.trim() || cardBalance === ''}
                className="w-full py-4 rounded-2xl text-white font-bold disabled:opacity-40"
                style={{ backgroundColor: '#7C3AED' }}
              >
                {saving ? 'Saving…' : 'Add card & finish'}
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                disabled={saving}
                className="w-full py-3 text-gray-400 text-sm font-medium"
              >
                Skip for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
