import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney, getUserCurrency } from '../../utils/currency'
import { BUDGET_CATEGORIES } from '../../utils/transactionCategories'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import {
  buildBudgetRows,
  getBudgetCategoryLabel,
  getProgressBarColor,
  getSpendingByBudgetCategory,
} from '../../utils/budgets'

function BudgetEditSheet({ category, budget, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const limitInput = useCurrencyInput(budget?.monthly_limit ?? '')
  const currency = getUserCurrency()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const meta = BUDGET_CATEGORIES.find(c => c.key === category.key)

  const handleSave = async () => {
    const parsed = limitInput.numericValue
    if (!limitInput.raw || parsed <= 0) {
      setError(t('invalidAmount'))
      return
    }

    setSaving(true)
    setError('')

    const { error: dbError } = await supabase
      .from('budgets')
      .upsert(
        {
          user_id: user.id,
          category: category.key,
          monthly_limit: parsed,
          is_active: true,
        },
        { onConflict: 'user_id,category' },
      )

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    onSaved?.()
    onClose()
  }

  const handleRemove = async () => {
    setSaving(true)
    setError('')

    const { error: dbError } = await supabase
      .from('budgets')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('category', category.key)

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-2 mb-5">
          <span className="text-2xl">{meta?.emoji}</span>
          <h2 className="text-lg font-bold text-gray-800">{category.label}</h2>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="mb-6">
          <label className="text-xs text-gray-400 mb-1 block">{t('monthlyLimit')}</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            type="text"
            inputMode="decimal"
            placeholder={currencyAmountPlaceholder(currency)}
            value={limitInput.displayValue}
            onChange={limitInput.handleChange}
          />
        </div>

        <div className="flex gap-3">
          {budget && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="flex-1 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-medium disabled:opacity-50"
            >
              {t('removeBudget')}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddBudgetSheet({ budgetedKeys, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [selectedKey, setSelectedKey] = useState(null)
  const limitInput = useCurrencyInput()
  const currency = getUserCurrency()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const availableCategories = BUDGET_CATEGORIES.filter(c => !budgetedKeys.has(c.key))
  const selected = availableCategories.find(c => c.key === selectedKey)

  const handleSave = async () => {
    const parsed = limitInput.numericValue
    if (!limitInput.raw || parsed <= 0) {
      setError(t('invalidAmount'))
      return
    }

    setSaving(true)
    setError('')

    const { error: dbError } = await supabase
      .from('budgets')
      .upsert(
        {
          user_id: user.id,
          category: selectedKey,
          monthly_limit: parsed,
          is_active: true,
        },
        { onConflict: 'user_id,category' },
      )

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[85vh] flex flex-col">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 shrink-0" />

        {!selected ? (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-4 shrink-0">{t('addBudget')}</h2>
            <div className="overflow-y-auto -mx-1 px-1 space-y-1">
              {availableCategories.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedKey(cat.key)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-left"
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-sm font-medium text-gray-800">
                    {getBudgetCategoryLabel(cat.key, t)}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setSelectedKey(null); limitInput.reset(); setError('') }}
              className="text-xs text-purple-600 font-medium mb-3 shrink-0 self-start"
            >
              ← {t('back')}
            </button>
            <div className="flex items-center gap-2 mb-5 shrink-0">
              <span className="text-2xl">{selected.emoji}</span>
              <h2 className="text-lg font-bold text-gray-800">
                {getBudgetCategoryLabel(selected.key, t)}
              </h2>
            </div>

            {error && <p className="text-red-500 text-sm mb-4 shrink-0">{error}</p>}

            <div className="mb-6 shrink-0">
              <label className="text-xs text-gray-400 mb-1 block">{t('monthlyLimit')}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                type="text"
                inputMode="decimal"
                placeholder={currencyAmountPlaceholder(currency)}
                value={limitInput.displayValue}
                onChange={limitInput.handleChange}
                autoFocus
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50 shrink-0"
            >
              {saving ? '...' : t('save')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function BudgetCard({ row, onEdit }) {
  const { t } = useTranslation()
  const pct = row.hasBudget ? Math.min(row.pct ?? 0, 100) : 0
  const barColor = row.hasBudget ? getProgressBarColor(row.pct ?? 0) : 'bg-gray-200'

  return (
    <button
      type="button"
      onClick={() => onEdit(row)}
      className="w-full bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-left"
    >
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{row.emoji}</span>
          <span className="text-sm font-semibold text-gray-800 truncate">{row.label}</span>
        </div>
        <div className="text-right shrink-0">
          {row.hasBudget ? (
            <p className="text-sm font-semibold text-gray-800">
              {formatMoney(row.spent)} / {formatMoney(row.limit)}
            </p>
          ) : (
            <p className="text-sm font-semibold text-gray-800">{formatMoney(row.spent)}</p>
          )}
        </div>
      </div>

      {row.hasBudget ? (
        <>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">{Math.round(row.pct ?? 0)}%</span>
            {row.isOver ? (
              <span className="text-red-500 font-medium">
                {t('overBy')} {formatMoney(Math.abs(row.remaining))}
              </span>
            ) : (
              <span className="text-gray-500">
                {formatMoney(row.remaining)} {t('leftThisMonth')}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400">
          + {t('setBudget')}
        </p>
      )}
    </button>
  )
}

export default function BudgetsScreen({ onClose }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [budgetRecords, setBudgetRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingCategory, setEditingCategory] = useState(null)
  const [showAddBudget, setShowAddBudget] = useState(false)

  const now = new Date()
  const monthLabel = now.toLocaleDateString(i18n.language === 'es' ? 'es-CO' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]

  useEffect(() => {
    let active = true

    ;(async () => {
      const [txRes, budgetRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('category, amount, type, description')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .gte('transaction_date', startOfMonth),
        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      if (!active) return

      if (txRes.error || budgetRes.error) {
        setError(txRes.error?.message || budgetRes.error?.message)
        setLoading(false)
        return
      }

      const spendingByCategory = getSpendingByBudgetCategory(txRes.data ?? [])
      const budgetRows = buildBudgetRows({
        spendingByCategory,
        budgets: budgetRes.data ?? [],
        t,
      })

      setBudgetRecords(budgetRes.data ?? [])
      setRows(budgetRows)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id, startOfMonth, refreshKey])

  const handleSaved = () => setRefreshKey(k => k + 1)

  const editingBudget = editingCategory
    ? budgetRecords.find(b => b.category === editingCategory.key) ?? null
    : null

  const budgetedKeys = new Set(budgetRecords.map(b => b.category))
  const allCategoriesBudgeted = budgetedKeys.size >= BUDGET_CATEGORIES.length

  const content = (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white px-6 py-4 border-b border-gray-100 flex justify-between items-start gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 pt-0.5 shrink-0"
              aria-label={t('close')}
            >
              <X size={22} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-800">{t('budgets')}</h1>
            <p className="text-xs text-gray-400 capitalize mt-0.5">{monthLabel}</p>
          </div>
        </div>
        {allCategoriesBudgeted ? (
          <p className="text-xs text-gray-500 text-right shrink-0 pt-1">{t('allCategoriesBudgeted')}</p>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddBudget(true)}
            className="text-xs text-purple-600 font-medium shrink-0 pt-1"
          >
            + {t('addBudget')}
          </button>
        )}
      </div>

      <div className="px-6 py-6">
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">{t('loading')}</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🎯</p>
            <p className="font-medium text-gray-600">{t('noBudgets')}</p>
            <p className="text-sm mt-1">{t('addBudgetPrompt')}</p>
            {!allCategoriesBudgeted && (
              <button
                type="button"
                onClick={() => setShowAddBudget(true)}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm"
              >
                + {t('addBudget')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <BudgetCard
                key={row.key}
                row={row}
                onEdit={setEditingCategory}
              />
            ))}
          </div>
        )}
      </div>

      {showAddBudget && (
        <AddBudgetSheet
          budgetedKeys={budgetedKeys}
          onClose={() => setShowAddBudget(false)}
          onSaved={handleSaved}
        />
      )}

      {editingCategory && (
        <BudgetEditSheet
          category={editingCategory}
          budget={editingBudget}
          onClose={() => setEditingCategory(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )

  if (onClose) {
    return (
      <div className="fixed inset-0 z-[120] bg-gray-50 overflow-y-auto">
        {content}
      </div>
    )
  }

  return content
}
