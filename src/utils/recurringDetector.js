export function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function cleanMerchantName(desc) {
  return desc
    ?.toLowerCase()
    .replace(/\s*#\d+/g, '')
    .replace(/\s+\d{4,}/g, '')
    .replace(/[*]/g, '')
    .trim() || 'unknown'
}

export function detectRecurring(transactions) {
  const groups = {}
  transactions.forEach(t => {
    if (t.type !== 'expense') return
    const key = cleanMerchantName(t.description)
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  })

  return Object.entries(groups)
    .filter(([, txs]) => {
      if (txs.length < 3) return false
      const sorted = [...txs].sort(
        (a, b) => new Date(a.transaction_date) - new Date(b.transaction_date),
      )
      const gaps = sorted.slice(1).map((t, i) =>
        (new Date(t.transaction_date) - new Date(sorted[i].transaction_date)) / (1000 * 60 * 60 * 24),
      )
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
      const amounts = txs.map(t => t.amount)
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length
      const amountVariance = avgAmount === 0
        || amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1)
      return avgGap >= 25 && avgGap <= 40 && amountVariance
    })
    .map(([name, txs]) => {
      const sorted = [...txs].sort(
        (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date),
      )
      const amounts = txs.map(t => t.amount)
      return {
        name,
        amount: amounts.reduce((s, a) => s + a, 0) / amounts.length,
        lastCharged: sorted[0].transaction_date,
        frequency: 'monthly',
        category: sorted[0].category,
        occurrences: txs.length,
        nextExpected: addDays(new Date(sorted[0].transaction_date), 30),
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export function isChargeAlreadyABill(charge, bills = []) {
  const chargeName = charge.name.toLowerCase()
  return bills.some(b => {
    const billName = (b.name || '').toLowerCase()
    return billName.includes(chargeName) || chargeName.includes(billName)
  })
}

export function getUntrackedRecurring(charges, bills = []) {
  return charges.filter(charge => !isChargeAlreadyABill(charge, bills))
}

export function formatRecurringDate(date, locale = 'en-US') {
  return new Date(date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
