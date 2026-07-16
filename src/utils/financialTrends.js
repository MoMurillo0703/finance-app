import { isSpendingTransaction, isIncomeTransaction } from './transactionType'

export function buildMonthlyTrends(transactions, months = 6, asOf = new Date()) {
  const buckets = []

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    const firstDay = `${key}-01`
    const lastDay = new Date(year, month, 0).toISOString().split('T')[0]

    const monthTx = transactions.filter(
      tx => tx.transaction_date >= firstDay && tx.transaction_date <= lastDay,
    )

    const income = monthTx
      .filter(tx => isIncomeTransaction(tx))
      .reduce((sum, tx) => sum + tx.amount, 0)

    const expenses = monthTx
      .filter(tx => isSpendingTransaction(tx))
      .reduce((sum, tx) => sum + tx.amount, 0)

    buckets.push({
      key,
      year,
      month,
      income,
      expenses,
      net: income - expenses,
    })
  }

  return buckets
}

export function averageTrendMetrics(buckets) {
  const avg = (values) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1)

  const last3 = buckets.slice(-3)
  const last6 = buckets

  return {
    avg3Income: avg(last3.map(b => b.income)),
    avg3Expenses: avg(last3.map(b => b.expenses)),
    avg3Net: avg(last3.map(b => b.net)),
    avg6Income: avg(last6.map(b => b.income)),
    avg6Expenses: avg(last6.map(b => b.expenses)),
    avg6Net: avg(last6.map(b => b.net)),
    recentNet: avg(last3.map(b => b.net)),
    olderNet: avg(buckets.slice(0, 3).map(b => b.net)),
    recentExpenses: avg(last3.map(b => b.expenses)),
    olderExpenses: avg(buckets.slice(0, 3).map(b => b.expenses)),
  }
}

export function formatTrendMonthLabel(year, month, language) {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', { month: 'short' })
}

export function buildTrendInsight(metrics, t, formatMoney) {
  const netDelta = metrics.recentNet - metrics.olderNet
  const expenseDelta = metrics.recentExpenses - metrics.olderExpenses

  if (metrics.recentNet > metrics.olderNet) {
    return `${t('trendImproving')} — ${t('netCashflow')} ${netDelta >= 0 ? '+' : ''}${formatMoney(netDelta)} vs 3 months ago`
  }

  if (expenseDelta > 0) {
    return `${t('trendDeclining')} — ${formatMoney(expenseDelta)} over the last 3 months`
  }

  return t('trendDeclining')
}
