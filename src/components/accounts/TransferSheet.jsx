import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import { getBankDisplayName, getBankAccountType, accountTypeLabel, fetchBanks } from '../../utils/bank'
import { adjustBankBalance, bankDelta } from '../../lib/payments'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

function stripOptionalTxColumns(row, errorMessage = '') {
  let next = { ...row }
  if (errorMessage.includes('source')) {
    const { source: _s, ...rest } = next
    next = rest
  }
  if (errorMessage.includes('is_transfer')) {
    const { is_transfer: _t, ...rest } = next
    next = rest
  }
  if (errorMessage.includes('transfer_direction')) {
    const { transfer_direction: _d, ...rest } = next
    next = rest
  }
  if (errorMessage.includes('paired_transaction_id')) {
    const { paired_transaction_id: _p, ...rest } = next
    next = rest
  }
  return next
}

async function insertTransaction(row) {
  let payload = { ...row }
  let { data, error } = await supabase.from('transactions').insert(payload).select().single()

  if (error && (
    error.message.includes('source')
    || error.message.includes('is_transfer')
    || error.message.includes('transfer_direction')
    || error.message.includes('paired_transaction_id')
  )) {
    payload = stripOptionalTxColumns(payload, error.message)
    ;({ data, error } = await supabase.from('transactions').insert(payload).select().single())
  }

  return { data, error }
}

function BankRow({ bank, onSelect }) {
  const { t } = useTranslation()
  const lastFour = bank.last_four ? `···· ${bank.last_four}` : null
  const typeLabel = accountTypeLabel(getBankAccountType(bank))

  return (
    <button
      type="button"
      onClick={() => onSelect(bank)}
      className="w-full flex justify-between items-center px-6 py-4 border-b border-gray-50 text-left min-h-[44px]"
    >
      <div className="min-w-0 pr-3">
        <p className="font-semibold text-gray-800 truncate">{getBankDisplayName(bank)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {[typeLabel, lastFour].filter(Boolean).join(' · ') || t('bank')}
        </p>
      </div>
      <p className="font-semibold text-gray-700 shrink-0">{formatMoney(bank.balance)}</p>
    </button>
  )
}

export default function TransferSheet({
  onClose,
  onComplete,
  showToast,
  initialFromBank = null,
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const amountInput = useCurrencyInput()
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(initialFromBank ? 2 : 1)
  const [fromAccount, setFromAccount] = useState(initialFromBank)
  const [toAccount, setToAccount] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await fetchBanks(supabase, user.id, { orderByName: true })
      if (!active) return
      const list = (data ?? []).filter(b => b.is_active !== false)
      setBanks(list)

      if (initialFromBank) {
        const fresh = list.find(b => b.id === initialFromBank.id) || initialFromBank
        setFromAccount(fresh)
      }

      setLoading(false)
    })()
    return () => { active = false }
  }, [user.id, initialFromBank])

  const numericAmount = amountInput.numericValue
  const fromBalance = Number(fromAccount?.balance) || 0
  const toBalance = Number(toAccount?.balance) || 0
  const insufficient = numericAmount > 0 && numericAmount > fromBalance

  const handleSelectFrom = (bank) => {
    setFromAccount(bank)
    setToAccount(null)
    setError('')
    setStep(2)
  }

  const handleSelectTo = (bank) => {
    setToAccount(bank)
    setError('')
    amountInput.reset()
    setStep(3)
  }

  const handleBack = () => {
    setError('')
    if (step === 3) {
      setStep(2)
      return
    }
    if (step === 2) {
      if (initialFromBank) {
        onClose?.()
        return
      }
      setFromAccount(null)
      setStep(1)
    }
  }

  const handleTransfer = async () => {
    if (!fromAccount || !toAccount || numericAmount <= 0 || insufficient) return

    setSaving(true)
    setError('')

    const today = new Date().toISOString().split('T')[0]
    const fromName = getBankDisplayName(fromAccount)
    const toName = getBankDisplayName(toAccount)

    const { data: outTx, error: outError } = await insertTransaction({
      user_id: user.id,
      description: t('transferToDesc', { name: toName }),
      amount: numericAmount,
      type: 'expense',
      category: 'Transfer',
      is_transfer: true,
      transfer_direction: 'out',
      bank_id: fromAccount.id,
      transaction_date: today,
      source: 'manual',
    })

    if (outError || !outTx) {
      setError(outError?.message || t('transferFailed'))
      setSaving(false)
      return
    }

    const { data: inTx, error: inError } = await insertTransaction({
      user_id: user.id,
      description: t('transferFromDesc', { name: fromName }),
      amount: numericAmount,
      type: 'income',
      category: 'Transfer',
      is_transfer: true,
      transfer_direction: 'in',
      bank_id: toAccount.id,
      transaction_date: today,
      source: 'manual',
    })

    if (inError || !inTx) {
      setError(inError?.message || t('transferFailed'))
      setSaving(false)
      return
    }

    await supabase
      .from('transactions')
      .update({ paired_transaction_id: inTx.id })
      .eq('id', outTx.id)

    await supabase
      .from('transactions')
      .update({ paired_transaction_id: outTx.id })
      .eq('id', inTx.id)

    const fromBalError = await adjustBankBalance(fromAccount.id, bankDelta('expense', numericAmount))
    if (fromBalError) {
      setError(fromBalError.message)
      setSaving(false)
      return
    }

    const toBalError = await adjustBankBalance(toAccount.id, bankDelta('income', numericAmount))
    if (toBalError) {
      setError(toBalError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    showToast?.(t('transferSuccess', { amount: formatMoney(numericAmount) }))
    onComplete?.()
    onClose?.()
  }

  const fromOptions = banks
  const toOptions = banks.filter(b => b.id !== fromAccount?.id)

  const stepTitle = step === 1
    ? t('transferFrom')
    : step === 2
      ? t('transferTo')
      : t('transferHowMuch')

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white w-full rounded-t-3xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh', zIndex: 2 }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-2 shrink-0" />
        <div className="px-6 pb-2 shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t('transferTitle')}</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 min-h-[44px] px-2">
            {t('cancel')}
          </button>
        </div>

        <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide px-6 mb-2">
          {stepTitle}
        </p>

        {error && <p className="text-red-500 text-sm px-6 mb-2">{error}</p>}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">{t('loading')}</p>
          ) : banks.length < 2 ? (
            <p className="text-center text-gray-400 py-12 text-sm px-6">{t('transferNeedTwoAccounts')}</p>
          ) : step === 1 ? (
            fromOptions.map(b => (
              <BankRow key={b.id} bank={b} onSelect={handleSelectFrom} />
            ))
          ) : step === 2 ? (
            toOptions.length === 0 ? (
              <p className="text-center text-gray-400 py-12 text-sm px-6">{t('transferNeedTwoAccounts')}</p>
            ) : (
              toOptions.map(b => (
                <BankRow key={b.id} bank={b} onSelect={handleSelectTo} />
              ))
            )
          ) : (
            <div className="flex flex-col min-h-[360px]">
              <div className="flex-1 flex items-center justify-center px-6 py-8">
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={amountInput.displayValue}
                  onChange={amountInput.handleChange}
                  className="text-5xl sm:text-6xl font-bold text-center bg-transparent border-none outline-none w-full text-gray-900"
                  placeholder={currencyAmountPlaceholder(amountInput.currency)}
                />
              </div>

              <div className="mx-6 mb-4 p-4 rounded-2xl" style={{ backgroundColor: '#F5F3FF' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-center flex-1 min-w-0">
                    <p className="text-xs text-gray-400">{t('transferFrom')}</p>
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {getBankDisplayName(fromAccount)}
                    </p>
                    <p className="text-xs text-purple-500">
                      {formatMoney(Math.max(0, fromBalance - numericAmount))} {t('transferAfter')}
                    </p>
                  </div>
                  <span className="text-2xl text-purple-400 shrink-0">→</span>
                  <div className="text-center flex-1 min-w-0">
                    <p className="text-xs text-gray-400">{t('transferTo')}</p>
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {getBankDisplayName(toAccount)}
                    </p>
                    <p className="text-xs text-green-500">
                      {formatMoney(toBalance + numericAmount)} {t('transferAfter')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-4">
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={saving || !numericAmount || numericAmount <= 0 || insufficient}
                  className="w-full py-4 rounded-2xl text-white font-bold disabled:opacity-40 min-h-[44px]"
                  style={{ backgroundColor: '#7C3AED' }}
                >
                  {saving
                    ? '...'
                    : numericAmount > 0
                      ? t('transferConfirm', { amount: formatMoney(numericAmount) })
                      : t('transferTitle')}
                </button>
                {insufficient && (
                  <p className="text-center text-xs text-red-500 mt-2">{t('insufficientBalance')}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {step > 1 && !(loading || banks.length < 2) && (
          <div className="px-6 pb-8 pt-2 shrink-0 border-t border-gray-50">
            <button
              type="button"
              onClick={handleBack}
              className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-500 min-h-[44px]"
            >
              {t('back')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
