import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { fetchBanks, getBankDisplayName, getBankAccountType, accountTypeLabel } from '../../utils/bank'
import { formatMoney } from '../../utils/currency'

/**
 * Shared bank / card / manual picker for bill create & edit.
 */
export default function BillPaymentMethodFields({
  paymentSource,
  onPaymentSourceChange,
  defaultBankId,
  onDefaultBankIdChange,
  defaultCreditCardId,
  onDefaultCreditCardIdChange,
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])

  useEffect(() => {
    fetchBanks(supabase, user.id, { orderByName: true }).then(({ data }) => {
      const list = data ?? []
      setBanks(list)
      if (!defaultBankId && list.length > 0 && paymentSource === 'bank') {
        onDefaultBankIdChange(list[0].id)
      }
    })

    supabase
      .from('credit_cards')
      .select('id, name, current_balance, credit_limit, issuing_bank, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        const list = data ?? []
        setCreditCards(list)
        if (!defaultCreditCardId && list.length > 0 && paymentSource === 'credit_card') {
          onDefaultCreditCardIdChange(list[0].id)
        }
      })
  }, [user.id])

  useEffect(() => {
    if (paymentSource === 'bank' && !defaultBankId && banks.length > 0) {
      onDefaultBankIdChange(banks[0].id)
    }
    if (paymentSource === 'credit_card' && !defaultCreditCardId && creditCards.length > 0) {
      onDefaultCreditCardIdChange(creditCards[0].id)
    }
  }, [paymentSource, banks, creditCards, defaultBankId, defaultCreditCardId, onDefaultBankIdChange, onDefaultCreditCardIdChange])

  const sourceBtn = (value, label) => (
    <button
      key={value}
      type="button"
      onClick={() => onPaymentSourceChange(value)}
      className="flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px]"
      style={{
        backgroundColor: paymentSource === value ? '#7C3AED' : '#F5F3FF',
        color: paymentSource === value ? 'white' : '#7C3AED',
      }}
    >
      {label}
    </button>
  )

  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {t('payWith')}
      </label>
      <div className="flex gap-2 mt-2 mb-3">
        {sourceBtn('bank', `🏦 ${t('bank')}`)}
        {sourceBtn('credit_card', `💳 ${t('creditCard')}`)}
        {sourceBtn('manual', `✋ ${t('manualPayment')}`)}
      </div>

      {paymentSource === 'bank' && (
        <div className="flex flex-col gap-2">
          {banks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">{t('noBanksHint')}</p>
          ) : (
            banks.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => onDefaultBankIdChange(b.id)}
                className="flex justify-between items-center px-4 py-3 rounded-2xl text-left min-h-[44px]"
                style={{
                  backgroundColor: defaultBankId === b.id ? '#F5F3FF' : '#F9FAFB',
                  border: defaultBankId === b.id ? '2px solid #7C3AED' : '2px solid transparent',
                }}
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{getBankDisplayName(b)}</p>
                  <p className="text-xs text-gray-400">
                    {accountTypeLabel(getBankAccountType(b))}
                    {b.last_four ? ` · ···· ${b.last_four}` : ''}
                  </p>
                </div>
                <p className="text-sm text-gray-500">{formatMoney(b.balance)}</p>
              </button>
            ))
          )}
        </div>
      )}

      {paymentSource === 'credit_card' && (
        <div className="flex flex-col gap-2">
          {creditCards.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">{t('noCardsHint')}</p>
          ) : (
            creditCards.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => onDefaultCreditCardIdChange(c.id)}
                className="flex justify-between items-center px-4 py-3 rounded-2xl text-left min-h-[44px]"
                style={{
                  backgroundColor: defaultCreditCardId === c.id ? '#F5F3FF' : '#F9FAFB',
                  border: defaultCreditCardId === c.id ? '2px solid #7C3AED' : '2px solid transparent',
                }}
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    {c.issuing_bank ? `${c.issuing_bank} · ` : ''}
                    {formatMoney(c.current_balance)} {t('owed')}
                  </p>
                </div>
                {(c.credit_limit || 0) > 0 && (
                  <p className="text-xs text-green-600">
                    {formatMoney(Math.max(0, c.credit_limit - (c.current_balance || 0)))} {t('available').toLowerCase()}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {paymentSource === 'manual' && (
        <p className="text-xs text-gray-400 px-1">
          {t('manualPaymentHint')}
        </p>
      )}
    </div>
  )
}

/** Build bill payment default columns; strips unknown columns on retry. */
export async function saveBillWithPaymentDefaults(supabase, { mode, id, row }) {
  let payload = { ...row }
  let result

  if (mode === 'insert') {
    result = await supabase.from('bills').insert(payload)
  } else {
    result = await supabase.from('bills').update(payload).eq('id', id)
  }

  if (
    result.error
    && (
      result.error.message?.includes('default_payment_source')
      || result.error.message?.includes('default_bank_id')
      || result.error.message?.includes('default_credit_card_id')
    )
  ) {
    const {
      default_payment_source: _s,
      default_bank_id: _b,
      default_credit_card_id: _c,
      ...fallback
    } = payload
    payload = fallback
    if (mode === 'insert') {
      result = await supabase.from('bills').insert(payload)
    } else {
      result = await supabase.from('bills').update(payload).eq('id', id)
    }
  }

  return result
}

export function paymentDefaultsFromBill(bill) {
  const source = bill?.default_payment_source
    || (bill?.bank_id ? 'bank' : 'manual')
  return {
    paymentSource: ['bank', 'credit_card', 'manual'].includes(source) ? source : 'bank',
    defaultBankId: bill?.default_bank_id || bill?.bank_id || '',
    defaultCreditCardId: bill?.default_credit_card_id || '',
  }
}

export function buildPaymentDefaultPayload(paymentSource, defaultBankId, defaultCreditCardId) {
  return {
    bank_id: paymentSource === 'bank' ? (defaultBankId || null) : null,
    default_payment_source: paymentSource,
    default_bank_id: paymentSource === 'bank' ? (defaultBankId || null) : null,
    default_credit_card_id: paymentSource === 'credit_card' ? (defaultCreditCardId || null) : null,
  }
}

export function billPaymentSourceLabel(bill, banks = [], cards = [], t) {
  const source = bill?.default_payment_source
  if (source === 'credit_card' && bill.default_credit_card_id) {
    const card = cards.find(c => c.id === bill.default_credit_card_id)
    return `💳 ${card?.name || t('creditCard')}`
  }
  if ((source === 'bank' || !source) && (bill.default_bank_id || bill.bank_id)) {
    const bankId = bill.default_bank_id || bill.bank_id
    const bank = banks.find(b => b.id === bankId)
    return `🏦 ${bank ? getBankDisplayName(bank) : t('bank')}`
  }
  if (source === 'manual') return `✋ ${t('manualPayment')}`
  if (source === 'credit_card') return `💳 ${t('creditCard')}`
  if (source === 'bank') return `🏦 ${t('bank')}`
  return `✋ ${t('manualPayment')}`
}
