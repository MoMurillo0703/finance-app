import { BUDGET_CATEGORIES, BUDGET_CATEGORY_KEYS, getRecategorizeHighlight } from './transactionCategories'

export function normalizeBudgetCategory(transaction) {
  const cat = getRecategorizeHighlight(transaction)
  if (cat === 'income') return null
  if (BUDGET_CATEGORY_KEYS.includes(cat)) return cat
  return 'other'
}

export function getSpendingByBudgetCategory(transactions) {
  const spent = Object.fromEntries(BUDGET_CATEGORY_KEYS.map(key => [key, 0]))

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const category = normalizeBudgetCategory(tx)
    if (!category) continue
    spent[category] += Number(tx.amount) || 0
  }

  return spent
}

export function getBudgetCategoryLabel(key, t) {
  return t(`category${key.charAt(0).toUpperCase()}${key.slice(1)}`)
}

export function buildBudgetRows({ spendingByCategory, budgets, t }) {
  const budgetMap = Object.fromEntries(
    (budgets ?? []).map(b => [b.category, Number(b.monthly_limit) || 0]),
  )

  const rows = BUDGET_CATEGORIES.map(({ key, emoji }) => {
    const spent = spendingByCategory[key] || 0
    const limit = budgetMap[key] ?? null
    const hasBudget = limit != null && limit > 0
    const pct = hasBudget && limit > 0 ? (spent / limit) * 100 : null

    return {
      key,
      emoji,
      label: getBudgetCategoryLabel(key, t),
      spent,
      limit,
      hasBudget,
      pct,
      isOver: hasBudget && spent > limit,
      remaining: hasBudget ? limit - spent : null,
    }
  }).filter(row => row.hasBudget || row.spent > 0)

  rows.sort((a, b) => {
    if (a.isOver !== b.isOver) return a.isOver ? -1 : 1
    if (a.hasBudget && b.hasBudget) return (b.pct ?? 0) - (a.pct ?? 0)
    if (a.hasBudget !== b.hasBudget) return a.hasBudget ? -1 : 1
    return b.spent - a.spent
  })

  return rows
}

export function getNearOrOverBudgetCategories({ spendingByCategory, budgets, t, threshold = 90 }) {
  const budgetMap = Object.fromEntries(
    (budgets ?? []).map(b => [b.category, Number(b.monthly_limit) || 0]),
  )

  return BUDGET_CATEGORIES
    .map(({ key, emoji }) => {
      const limit = budgetMap[key]
      if (!limit || limit <= 0) return null
      const spent = spendingByCategory[key] || 0
      const pct = (spent / limit) * 100
      if (pct < threshold) return null
      return {
        key,
        emoji,
        label: getBudgetCategoryLabel(key, t),
        spent,
        limit,
        pct,
      }
    })
    .filter(Boolean)
}

export function getProgressBarColor(pct) {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 75) return 'bg-amber-500'
  return 'bg-green-500'
}
