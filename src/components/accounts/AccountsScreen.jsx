import { useState, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'
import { fetchBanks } from '../../utils/bank'
import { getCardApr } from '../../utils/cards'
import AddBankModal from '../dashboard/AddBankModal'
import AddCardModal from '../cards/AddCardModal'
import EditBankModal from '../settings/EditBankModal'
import EditCardModal from '../cards/EditCardModal'
import CardDetailSheet from '../cards/CardDetailSheet'
import AccountHistoryModal from './AccountHistoryModal'
import LoansSection from '../loans/LoansSection'
import AddLoanModal from '../loans/AddLoanModal'
import EditLoanModal from '../loans/EditLoanModal'
import PurchaseSimulator from '../simulator/PurchaseSimulator'

function accountTypeLabel(type, t) {
  if (type === 'checking') return t('checking')
  if (type === 'money_market') return t('moneyMarket')
  if (type === 'savings') return t('savings')
  return type
}

export default function AccountsScreen({ onAccountSaved, refreshKey = 0, setHideNav }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [banks, setBanks] = useState([])
  const [cards, setCards] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddChoice, setShowAddChoice] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [showAddCard, setShowAddCard] = useState(false)
  const [showAddLoan, setShowAddLoan] = useState(false)
  const [editingBank, setEditingBank] = useState(null)
  const [editingCard, setEditingCard] = useState(null)
  const [editingLoan, setEditingLoan] = useState(null)
  const [detailCard, setDetailCard] = useState(null)
  const [showSimulator, setShowSimulator] = useState(false)
  const [historyBank, setHistoryBank] = useState(null)
  const [dataRefreshKey, setDataRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    ;(async () => {
      const [banksRes, cardsRes, loansRes] = await Promise.all([
        fetchBanks(supabase, user.id, { orderByName: true }),
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('loans')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
      ])

      if (!active) return
      setBanks(banksRes.data ?? [])
      setCards(cardsRes.data ?? [])
      setLoans(loansRes.data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey, dataRefreshKey])

  const handleSaved = () => {
    setShowAddBank(false)
    setShowAddCard(false)
    setShowAddLoan(false)
    setEditingBank(null)
    setEditingCard(null)
    setEditingLoan(null)
    setShowAddChoice(false)
    setDataRefreshKey(k => k + 1)
    onAccountSaved?.()
  }

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-4 py-4 pb-24 space-y-6">
        <button
          type="button"
          onClick={() => setShowSimulator(true)}
          className="w-full py-2.5 rounded-2xl border border-purple-200 text-purple-600 font-medium text-sm bg-white"
        >
          🤔 {t('canIAfford')}
        </button>

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-12">{t('loading')}</p>
        ) : banks.length === 0 && cards.length === 0 && loans.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🏦</p>
            <p className="font-medium text-gray-600">{t('noAccounts')}</p>
            <p className="text-sm mt-1">{t('addAccountsPrompt')}</p>
          </div>
        ) : (
          <>
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {t('bankAccounts')}
          </h2>
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-6">{t('loading')}</p>
          ) : banks.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
              <p className="text-gray-400 text-sm">{t('noAccounts')}</p>
              <button
                type="button"
                onClick={() => setShowAddBank(true)}
                className="mt-3 text-purple-600 text-sm font-medium"
              >
                {t('addBank')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {banks.map(bank => (
                <div
                  key={bank.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center"
                >
                  <button
                    type="button"
                    onClick={() => setHistoryBank(bank)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-semibold text-gray-800">{bank.nickname?.trim() || bank.name}</p>
                    {bank.nickname?.trim() && (
                      <p className="text-xs text-gray-400">{bank.name}</p>
                    )}
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1 inline-block">
                      {accountTypeLabel(bank.type, t)}
                    </span>
                  </button>
                  <div className="text-right shrink-0 pl-3 flex flex-col items-end">
                    <p className="text-base font-bold text-gray-800">{formatMoney(bank.balance)}</p>
                    <button
                      type="button"
                      onClick={() => setEditingBank(bank)}
                      className="text-gray-400 hover:text-purple-600 mt-1 p-1"
                      aria-label={t('edit')}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {t('creditCards')}
          </h2>
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-6">{t('loading')}</p>
          ) : cards.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
              <p className="text-gray-400 text-sm">{t('noCards')}</p>
              <button
                type="button"
                onClick={() => setShowAddCard(true)}
                className="mt-3 text-purple-600 text-sm font-medium"
              >
                {t('addFirstCard')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cards.map(card => {
                const currency = card.currency || 'COP'
                const balance = card.current_balance || 0
                const limit = card.credit_limit || 0
                const utilization = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0

                return (
                  <div
                    key={card.id}
                    className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => setDetailCard(card)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-sm font-semibold text-gray-800">{card.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {card.network}
                        </span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {t('interestRateShort', { rate: getCardApr(card).toFixed(2) })}
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                          <span>{t('utilization')}</span>
                          <span>{Math.round(utilization)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1">
                          <div
                            className="bg-purple-400 h-1 rounded-full"
                            style={{ width: `${utilization}%` }}
                          />
                        </div>
                      </div>
                    </button>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <p className="text-base font-bold text-gray-800">{formatMoney(balance, currency)}</p>
                      <button
                        type="button"
                        onClick={() => setEditingCard(card)}
                        className="text-gray-400 hover:text-purple-600 mt-1 p-1"
                        aria-label={t('edit')}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {t('loans')}
          </h2>
          <LoansSection
            loans={loans}
            loading={loading}
            onEdit={setEditingLoan}
          />
        </section>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowAddChoice(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-purple-600 text-white text-3xl leading-none shadow-lg flex items-center justify-center z-30"
        aria-label={t('add')}
      >
        +
      </button>

      {showAddChoice && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowAddChoice(false)} />
          <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10" style={{ zIndex: 2 }}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
            <h2 className="text-lg font-bold text-gray-800 mb-4">{t('addAccountType')}</h2>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => { setShowAddChoice(false); setShowAddBank(true) }}
                className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
              >
                {t('addBankAccount')}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddChoice(false); setShowAddCard(true) }}
                className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-700 font-medium"
              >
                {t('addCard')}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddChoice(false); setShowAddLoan(true) }}
                className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-700 font-medium"
              >
                {t('addLoan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddBank && (
        <AddBankModal onClose={() => setShowAddBank(false)} onSaved={handleSaved} />
      )}

      {showAddCard && (
        <AddCardModal onClose={() => setShowAddCard(false)} onSaved={handleSaved} />
      )}

      {showAddLoan && (
        <AddLoanModal onClose={() => setShowAddLoan(false)} onSaved={handleSaved} />
      )}

      {editingBank && (
        <EditBankModal
          bank={editingBank}
          onClose={() => setEditingBank(null)}
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

      {editingLoan && (
        <EditLoanModal
          loan={editingLoan}
          onClose={() => setEditingLoan(null)}
          onSaved={handleSaved}
        />
      )}

      {historyBank && (
        <AccountHistoryModal
          bank={historyBank}
          onClose={() => setHistoryBank(null)}
        />
      )}

      {detailCard && (
        <CardDetailSheet
          card={detailCard}
          setHideNav={setHideNav}
          onClose={() => setDetailCard(null)}
          onUpdated={async () => {
            setDataRefreshKey(k => k + 1)
            const { data } = await supabase
              .from('credit_cards')
              .select('*')
              .eq('id', detailCard.id)
              .single()
            if (data) setDetailCard(data)
            onAccountSaved?.()
          }}
        />
      )}

      {showSimulator && (
        <PurchaseSimulator
          onClose={() => setShowSimulator(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
