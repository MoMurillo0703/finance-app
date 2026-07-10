import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import SafeToSpend from './SafeToSpend'
import VaultCard from './VaultCard'
import AddVaultModal from './AddVaultModal'
import AddBankModal from './AddBankModal'
import EditVaultModal from '../vaults/EditVaultModal'

const sectionHeader = 'text-[10px] font-medium tracking-wider text-gray-400 uppercase'

const formatCOP = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)

const getCurrentBillingMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const isBillPaidThisMonth = (bill) => {
  const currentMonth = getCurrentBillingMonth()

  if (bill.billing_month != null) {
    return bill.is_paid && bill.billing_month === currentMonth
  }

  if (bill.paid_at) {
    const paidDate = new Date(bill.paid_at)
    const now = new Date()
    return bill.is_paid
      && paidDate.getFullYear() === now.getFullYear()
      && paidDate.getMonth() === now.getMonth()
  }

  if (typeof bill.category === 'string' && bill.category.startsWith('paid:')) {
    return bill.category === `paid:${currentMonth}`
  }

  return false
}

const getDueDaysThisWeek = () => {
  const now = new Date()
  const today = now.getDate()
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const days = []
  for (let i = 0; i < 7; i++) {
    const day = today + i
    if (day <= lastDayOfMonth) days.push(day)
  }
  return days
}

const isBillDueThisWeek = (bill) => {
  const currentMonth = getCurrentBillingMonth()
  const dueDays = getDueDaysThisWeek()
  const unpaid = !bill.is_paid || bill.billing_month !== currentMonth
  return dueDays.includes(bill.due_day) && unpaid && !isBillPaidThisMonth(bill)
}

export default function Dashboard({ refreshKey }) {
  const { user, signOut } = useAuth()
  const { t, i18n } = useTranslation()
  const [vaults, setVaults] = useState([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddVault, setShowAddVault] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [editingVault, setEditingVault] = useState(null)
  const [modalRefreshKey, setModalRefreshKey] = useState(0)
  const [dueBills, setDueBills] = useState([])
  const [payingId, setPayingId] = useState(null)
  const [billError, setBillError] = useState('')

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data: vaultsData } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const { data: banksData } = await supabase
        .from('banks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const { data: billsData } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('due_day')

      if (!active) return

      setVaults(vaultsData ?? [])
      setTotalBalance((banksData ?? []).reduce((sum, bank) => sum + (bank.balance || 0), 0))
      setDueBills((billsData ?? []).filter(isBillDueThisWeek))
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, refreshKey, modalRefreshKey])

  const protectedAmount = vaults.reduce((sum, v) => sum + (v.current_amount || 0), 0)
  const safeToSpend = totalBalance - protectedAmount

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es')
  }

  const formatDueDate = (dueDay) => {
    const now = new Date()
    const date = new Date(now.getFullYear(), now.getMonth(), dueDay)
    return date.toLocaleDateString(i18n.language === 'es' ? 'es-CO' : 'en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const handleMarkPaid = async (bill) => {
    setPayingId(bill.id)
    setBillError('')

    let bankId = bill.bank_id

    if (!bankId) {
      const { data: banks } = await supabase
        .from('banks')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')
        .limit(1)

      bankId = banks?.[0]?.id
    }

    if (!bankId) {
      setBillError(t('noBanksHint'))
      setPayingId(null)
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const currentMonth = getCurrentBillingMonth()

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      bank_id: bankId,
      type: 'expense',
      category: 'bills',
      amount: bill.amount,
      description: bill.name,
      transaction_date: today,
    })

    if (txError) {
      setBillError(txError.message)
      setPayingId(null)
      return
    }

    const { data: bankData, error: bankFetchError } = await supabase
      .from('banks')
      .select('balance')
      .eq('id', bankId)
      .single()

    if (bankFetchError) {
      setBillError(bankFetchError.message)
      setPayingId(null)
      return
    }

    const newBalance = (Number(bankData.balance) || 0) - bill.amount
    const { error: bankUpdateError } = await supabase
      .from('banks')
      .update({ balance: newBalance })
      .eq('id', bankId)

    if (bankUpdateError) {
      setBillError(bankUpdateError.message)
      setPayingId(null)
      return
    }

    let { error: billUpdateError } = await supabase
      .from('bills')
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        billing_month: currentMonth,
      })
      .eq('id', bill.id)

    if (billUpdateError) {
      const fallback = await supabase
        .from('bills')
        .update({ category: `paid:${currentMonth}` })
        .eq('id', bill.id)
      billUpdateError = fallback.error
    }

    if (billUpdateError) {
      setBillError(billUpdateError.message)
      setPayingId(null)
      return
    }

    if (bill.vault_id) {
      await supabase
        .from('vaults')
        .update({ current_amount: 0 })
        .eq('id', bill.vault_id)
    }

    setPayingId(null)
    setModalRefreshKey(k => k + 1)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">{t('loading')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-5 pt-12 pb-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-purple-600">Lala</h1>
        <div className="flex gap-3 items-center">
          <button
            onClick={toggleLanguage}
            className="text-xs text-gray-400 border border-gray-200 rounded-full px-3 py-1"
          >
            {i18n.language === 'es' ? 'EN' : 'ES'}
          </button>
          <button onClick={signOut} className="text-xs text-gray-400">
            {t('logout')}
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        <SafeToSpend amount={safeToSpend} />

        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100">
            <div className="flex justify-between items-center mb-0.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('totalBalance')}</p>
              <button onClick={() => setShowAddBank(true)} className="text-xs text-purple-600 font-medium">+</button>
            </div>
            <p className="text-base font-bold text-gray-800">
              {new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
              }).format(totalBalance)}
            </p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{t('protected')}</p>
            <p className="text-base font-bold text-gray-800">
              {new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
              }).format(protectedAmount)}
            </p>
          </div>
        </div>

        {dueBills.length > 0 && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className={sectionHeader}>{t('sectionDueThisWeek')}</h2>
            </div>
            {billError && <p className="text-red-500 text-xs mb-2">{billError}</p>}
            <div className="-mx-5 px-5 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
              {dueBills.map(bill => (
                <div
                  key={bill.id}
                  className="flex-shrink-0 snap-start w-[148px] rounded-2xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                >
                  <p className="text-xs font-medium text-gray-800 truncate">{bill.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatDueDate(bill.due_day)}</p>
                  <p className="text-xs font-semibold text-gray-800 mt-1">{formatCOP(bill.amount)}</p>
                  <button
                    onClick={() => handleMarkPaid(bill)}
                    disabled={payingId === bill.id}
                    className="mt-2 w-full py-1 rounded-full bg-purple-600 text-white text-[10px] font-medium disabled:opacity-50"
                  >
                    {payingId === bill.id ? '...' : t('pay')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-2 flex justify-between items-center">
          <h2 className={sectionHeader}>{t('sectionVaults')}</h2>
          <button onClick={() => setShowAddVault(true)} className="text-[10px] text-purple-600 font-medium uppercase tracking-wide">
            + {t('addVault')}
          </button>
        </div>

        {vaults.length === 0 ? (
          <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
            <p className="text-gray-400 text-xs">{t('noVaults')}</p>
            <button onClick={() => setShowAddVault(true)} className="mt-2 text-purple-600 text-xs font-medium">
              {t('createFirstVault')}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {vaults.map(vault => (
              <VaultCard
                key={vault.id}
                vault={vault}
                onClick={() => setEditingVault(vault)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddVault && (
        <AddVaultModal
          onClose={() => setShowAddVault(false)}
          onSaved={() => { setShowAddVault(false); setModalRefreshKey(k => k + 1) }}
        />
      )}

      {showAddBank && (
        <AddBankModal
          onClose={() => setShowAddBank(false)}
          onSaved={() => { setShowAddBank(false); setModalRefreshKey(k => k + 1) }}
        />
      )}

      {editingVault && (
        <EditVaultModal
          vault={editingVault}
          onClose={() => setEditingVault(null)}
          onSaved={() => { setEditingVault(null); setModalRefreshKey(k => k + 1) }}
        />
      )}
    </div>
  )
}