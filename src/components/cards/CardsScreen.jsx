import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import AddCardModal from './AddCardModal'
import EditCardModal from './EditCardModal'
import CardDetailSheet from './CardDetailSheet'

import { formatMoney } from '../../utils/currency'
import { getCardApr } from '../../utils/cards'

export default function CardsScreen({ onCardSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [detailCard, setDetailCard] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('credit_cards')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')

      if (!active) return
      setCards(data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey])

  const handleSaved = () => {
    setShowAdd(false)
    setEditingCard(null)
    setRefreshKey(k => k + 1)
    onCardSaved?.()
  }

  const handleDetailUpdated = () => {
    setRefreshKey(k => k + 1)
    onCardSaved?.()
    supabase
      .from('credit_cards')
      .select('*')
      .eq('id', detailCard?.id)
      .single()
      .then(({ data }) => {
        if (data) setDetailCard(data)
      })
  }

  return (
    <div className="bg-gray-50">
      <div className="px-5 py-4 pb-24">
        {loading ? (
          <p className="text-gray-400 text-xs text-center py-8">{t('loading')}</p>
        ) : cards.length === 0 ? (
          <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
            <p className="text-gray-400 text-xs">{t('noCards')}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2 text-purple-600 text-xs font-medium"
            >
              {t('addFirstCard')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {cards.map(card => {
              const currency = card.currency || 'COP'
              const balance = card.current_balance || 0
              const limit = card.credit_limit || 0
              const utilization = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0

              return (
                <div
                  key={card.id}
                  className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-start gap-3"
                >
                  <button
                    type="button"
                    onClick={() => setDetailCard(card)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{card.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            {card.network}
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            {t('interestRateShort', { rate: getCardApr(card).toFixed(2) })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <p className="text-sm font-bold text-gray-800">{formatMoney(balance, currency)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t('limit')}: {formatMoney(limit, currency)}
                        </p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1">
                      <div
                        className="bg-purple-400 h-1 rounded-full"
                        style={{ width: `${utilization}%` }}
                      />
                    </div>
                    {limit > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {t('utilization')}: {Math.round(utilization)}%
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCard(card)}
                    className="text-[10px] text-purple-600 shrink-0 pt-0.5"
                  >
                    {t('edit')}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-purple-600 text-white text-3xl leading-none shadow-lg flex items-center justify-center"
        aria-label={t('addCard')}
      >
        +
      </button>

      {showAdd && (
        <AddCardModal
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}

      {editingCard && (
        <EditCardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={handleSaved}
        />
      )}

      {detailCard && (
        <CardDetailSheet
          card={detailCard}
          onClose={() => setDetailCard(null)}
          onUpdated={handleDetailUpdated}
        />
      )}
    </div>
  )
}
