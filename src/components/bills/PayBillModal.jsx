import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'
import { getBillDisplayAmount } from '../../utils/bills'
import { confirmBillPayment } from '../../utils/billPayment'
import { formatMoney, getUserCurrency } from '../../utils/currency'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'

export default function PayBillModal({
  bill,
  cardMap,
  statementsMap = {},
  loanMap = {},
  onClose,
  onPaid,
  showToast,
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = getUserCurrency()
  const defaultAmount = getBillDisplayAmount(bill, cardMap, statementsMap, loanMap)
  const amountInput = useCurrencyInput(defaultAmount)
  const [paymentSource, setPaymentSource] = useState('bank')
  const [bankId, setBankId] = useState('')
  const [creditCardId, setCreditCardId] = useState('')
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchBanks(supabase, user.id, { orderByName: true }).then(({ data }) => {
      if (data?.length) {
        setBanks(data)
        setBankId(bill.bank_id || data[0].id)
      }
    })

    supabase
      .from('credit_cards')
      .select('id, name, current_balance, issuing_bank')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data?.length) {
          setCreditCards(data)
          setCreditCardId(data[0].id)
        }
      })
  }, [user.id, bill.bank_id])

  const mapPaymentError = (err) => {
    if (!err) return t('transferFailed')
    if (err.message === 'invalid_amount') return t('invalidAmount')
    if (err.message === 'missing_payment_source') return t('selectBank')
    if (err.message === 'same_card') return t('cannotPayCardBillWithSameCard')
    return err.message || t('transferFailed')
  }

  const handlePay = async () => {
    const billAmount = amountInput.numericValue
    if (!amountInput.raw || billAmount <= 0) {
      setError(t('invalidAmount'))
      return
    }

    if (paymentSource === 'bank' && !bankId && !bill.bank_id) {
      setError(t('noBanksHint'))
      return
    }
    if (paymentSource === 'card' && !creditCardId) {
      setError(t('selectCard'))
      return
    }

    setPaying(true)
    setError('')

    const source = paymentSource === 'card'
      ? { type: 'credit_card', id: creditCardId }
      : { type: 'bank', id: bankId || bill.bank_id }

    const { error: payError } = await confirmBillPayment({
      supabase,
      userId: user.id,
      bill,
      amount: billAmount,
      source,
    })

    if (payError) {
      setError(mapPaymentError(payError))
      setPaying(false)
      return
    }

    setPaying(false)
    showToast?.(t('billMarkedPaid', { name: bill.name }))
    onPaid()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          {t('markBillAsPaidConfirm', { name: bill.name })}
        </h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('amount')} ({currency})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={amountInput.displayValue}
              onChange={amountInput.handleChange}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('payFrom')}</label>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setPaymentSource('bank')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium min-h-[44px]"
                style={{
                  backgroundColor: paymentSource === 'bank' ? '#7C3AED' : '#F5F3FF',
                  color: paymentSource === 'bank' ? 'white' : '#7C3AED',
                }}
              >
                🏦 {t('bank')}
              </button>
              <button
                type="button"
                onClick={() => setPaymentSource('card')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium min-h-[44px]"
                style={{
                  backgroundColor: paymentSource === 'card' ? '#7C3AED' : '#F5F3FF',
                  color: paymentSource === 'card' ? 'white' : '#7C3AED',
                }}
              >
                💳 {t('creditCard')}
              </button>
            </div>
          </div>

          {paymentSource === 'bank' ? (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('deductFrom')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={bankId}
                onChange={e => setBankId(e.target.value)}
              >
                {banks.length === 0 && (
                  <option value="">{t('noBanksHint')}</option>
                )}
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{getBankDropdownLabel(b)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('creditCard')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={creditCardId}
                onChange={e => setCreditCardId(e.target.value)}
              >
                {creditCards.length === 0 && (
                  <option value="">{t('noCardsHint')}</option>
                )}
                {creditCards.map(card => (
                  <option key={card.id} value={card.id}>
                    {card.issuing_bank ? `${card.name} (${card.issuing_bank})` : card.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handlePay}
            disabled={paying}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {paying ? '...' : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
