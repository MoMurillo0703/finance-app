import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import AddPromoModal from './AddPromoModal'

function getPromoDaysLeft(expirationDate) {
  const expires = new Date(expirationDate)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  expires.setHours(0, 0, 0, 0)
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
}

export default function PromoSection({ card, currency, refreshKey, onUpdated }) {
  const { t } = useTranslation()
  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddPromo, setShowAddPromo] = useState(false)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('promotional_purchases')
        .select('*')
        .eq('credit_card_id', card.id)
        .eq('is_active', true)
        .order('expiration_date', { ascending: true })

      if (!active) return
      setPromos(data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [card.id, refreshKey])

  const handleSaved = () => {
    setShowAddPromo(false)
    onUpdated?.()
  }

  if (loading) {
    return <p className="text-gray-400 text-xs text-center py-6">{t('loading')}</p>
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="font-semibold text-gray-700">{t('promoBalances')}</p>
        <button
          type="button"
          onClick={() => setShowAddPromo(true)}
          className="text-purple-600 text-sm font-medium"
        >
          + {t('addPromo')}
        </button>
      </div>

      {promos.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">{t('noPromos')}</p>
      ) : (
        promos.map(promo => {
          const daysLeft = getPromoDaysLeft(promo.expiration_date)
          const isUrgent = daysLeft <= 60
          const isExpired = daysLeft <= 0
          const monthlyPayment = daysLeft > 0
            ? promo.remaining_balance / Math.max(1, Math.ceil(daysLeft / 30))
            : 0

          return (
            <div
              key={promo.id}
              className={`rounded-2xl p-4 mb-3 border ${
                isExpired ? 'border-red-300 bg-red-50'
                  : isUrgent ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-100 bg-white'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-gray-800 text-sm">{promo.description}</p>
                {isUrgent && !isExpired && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0 ml-2">
                    ⚠️ {daysLeft} {t('daysLeft')}
                  </span>
                )}
                {isExpired && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full shrink-0 ml-2">
                    {t('expired')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                <div>
                  <p className="text-gray-400">{t('remainingBalance')}</p>
                  <p className="font-bold text-gray-800 text-base">
                    {formatMoney(promo.remaining_balance, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">{t('deferredInterest')}</p>
                  <p className="font-bold text-red-500 text-base">
                    {formatMoney(promo.deferred_interest, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">{t('payInFullBy')}</p>
                  <p className="font-semibold text-gray-700">{formatDate(promo.expiration_date)}</p>
                </div>
                <div>
                  <p className="text-gray-400">{t('originalPurchase')}</p>
                  <p className="font-semibold text-gray-700">
                    {formatMoney(promo.original_amount, currency)}
                  </p>
                </div>
              </div>

              {!isExpired && daysLeft > 0 && (
                <div className="bg-purple-50 rounded-xl px-3 py-2 text-xs">
                  <span className="text-purple-700 font-medium">
                    {t('promoMonthlyPay', {
                      amount: formatMoney(monthlyPayment, currency),
                      deferred: formatMoney(promo.deferred_interest, currency),
                    })}
                  </span>
                </div>
              )}
            </div>
          )
        })
      )}

      {showAddPromo && (
        <AddPromoModal
          cardId={card.id}
          onClose={() => setShowAddPromo(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
