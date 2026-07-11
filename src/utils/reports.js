export const SPENDING_CATEGORIES = [
  'dining',
  'subscriptions',
  'utilities',
  'transport',
  'shopping',
  'health',
  'travel',
  'entertainment',
  'gas',
  'insurance',
  'personal',
  'auto',
  'business',
  'loan',
  'interest',
  'other',
]

const CATEGORY_RULES = [
  { pattern: /interest charged|interest fee|finance charge/i, category: 'interest' },
  { pattern: /uber|lyft|taxi/i, category: 'transport' },
  { pattern: /walmart|target|costco|best.?buy|rei|officemax|wal.?mart|amazon/i, category: 'shopping' },
  { pattern: /restaurant|grill|cafe|coffee|sushi|tavern|brewing|wings|pizza|kitchen|diner|bbq|burger|taco|chipotle|mcdonald|starbucks|dunkin/i, category: 'dining' },
  { pattern: /adobe|microsoft|google|openai|chatgpt|grammarly|tradingview|netflix|spotify|hulu|disney|squarespace|sqsp/i, category: 'subscriptions' },
  { pattern: /vzwrlss|verizon|at&t|tmobile|sprint|xfinity|comcast/i, category: 'utilities' },
  { pattern: /pharmacy|cvs|walgreens|health|medical|doctor|dental|pediatric/i, category: 'health' },
  { pattern: /airline|flight|hotel|airbnb|airport|travel|newslink/i, category: 'travel' },
  { pattern: /fandango|apple|entertainment|cinema|theater/i, category: 'entertainment' },
  { pattern: /arco|shell|chevron|exxon|mobil|bp|gas/i, category: 'gas' },
  { pattern: /insurance/i, category: 'insurance' },
  { pattern: /supercuts|salon|haircut|barber/i, category: 'personal' },
  { pattern: /ccoc|car\s?payment|auto\s?loan|auto\s?pay|motor/i, category: 'auto' },
  { pattern: /xcel|solutions|consulting/i, category: 'business' },
  { pattern: /napa\s?benefits|mvq\*/i, category: 'health' },
  { pattern: /chestnut|pediatric|medical|clinic|hospital/i, category: 'health' },
  { pattern: /kendel|rodas|stylist|spa/i, category: 'personal' },
]

const DB_CATEGORY_MAP = {
  food: 'dining',
  travel: 'travel',
  fun: 'entertainment',
  transport: 'transport',
  shopping: 'shopping',
  dining: 'dining',
  subscriptions: 'subscriptions',
  utilities: 'utilities',
  health: 'health',
  entertainment: 'entertainment',
  gas: 'gas',
  insurance: 'insurance',
  personal: 'personal',
  auto: 'auto',
  business: 'business',
  other: 'other',
  bills: 'utilities',
  essential: 'other',
  debt: 'other',
  weeklyLiving: 'other',
  emergency: 'other',
  pet: 'personal',
  grooming: 'personal',
  interest: 'interest',
  loan: 'loan',
}

export function detectSpendingCategory(description) {
  if (!description) return 'other'
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(description)) return rule.category
  }
  return 'other'
}

export function normalizeSpendingCategory(transaction) {
  if (SPENDING_CATEGORIES.includes(transaction.category)) {
    return transaction.category
  }
  const fromDescription = detectSpendingCategory(transaction.description)
  if (fromDescription !== 'other') return fromDescription
  return DB_CATEGORY_MAP[transaction.category] || 'other'
}

export function getMonthBounds(year, month) {
  const mm = String(month).padStart(2, '0')
  const daysInMonth = new Date(year, month, 0).getDate()
  const dd = String(daysInMonth).padStart(2, '0')
  return {
    firstDay: `${year}-${mm}-01`,
    lastDay: `${year}-${mm}-${dd}`,
    daysInMonth,
  }
}

export function isCurrentMonth(year, month) {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() + 1 === month
}

export function formatMonthYear(year, month, language) {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function getRecentMonthKeys(count, fromDate = new Date()) {
  const keys = []
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
  for (let i = 0; i < count; i++) {
    const y = cursor.getFullYear()
    const m = cursor.getMonth() + 1
    keys.unshift(`${y}-${String(m).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() - 1)
  }
  return keys
}

export function cleanMerchantName(description) {
  if (!description) return 'Unknown'
  let name = description.trim()
  const trailingStateZip = name.match(/^(.*)\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i)
  if (trailingStateZip?.[1]) {
    name = trailingStateZip[1].trim()
  }
  return name || description.trim()
}

function amountsWithinTolerance(amounts, tolerance = 0.1) {
  if (amounts.length < 2) return true
  const mean = amounts.reduce((sum, value) => sum + value, 0) / amounts.length
  if (mean === 0) return true
  return amounts.every(value => Math.abs(value - mean) / mean <= tolerance)
}

export function detectRecurringCharges(transactions, monthKeys) {
  const expenses = transactions.filter(tx => tx.type === 'expense')
  const byMerchant = {}

  for (const tx of expenses) {
    const monthKey = tx.transaction_date?.slice(0, 7)
    if (!monthKey || !monthKeys.includes(monthKey)) continue

    const merchant = cleanMerchantName(tx.description)
    if (!byMerchant[merchant]) {
      byMerchant[merchant] = Object.fromEntries(monthKeys.map(key => [key, []]))
    }
    byMerchant[merchant][monthKey].push(tx.amount)
  }

  const recurring = []

  for (const [merchant, monthlyAmounts] of Object.entries(byMerchant)) {
    const monthlyTotals = monthKeys
      .map(key => ({
        key,
        total: (monthlyAmounts[key] || []).reduce((sum, value) => sum + value, 0),
      }))
      .filter(entry => entry.total > 0)

    if (monthlyTotals.length < 2) continue

    const totals = monthlyTotals.map(entry => entry.total)
    if (!amountsWithinTolerance(totals)) continue

    recurring.push({
      merchant,
      averageAmount: totals.reduce((sum, value) => sum + value, 0) / totals.length,
      frequency: monthlyTotals.length >= 3 ? 'monthly' : 'irregular',
      monthsActive: monthlyTotals.length,
    })
  }

  return recurring.sort((a, b) => b.averageAmount - a.averageAmount)
}

export function summarizeByCategory(transactions, t) {
  const expenses = transactions.filter(tx => tx.type === 'expense')
  const totals = Object.fromEntries(SPENDING_CATEGORIES.map(cat => [cat, { amount: 0, count: 0 }]))
  let totalSpent = 0

  for (const tx of expenses) {
    const category = normalizeSpendingCategory(tx)
    totals[category].amount += tx.amount
    totals[category].count += 1
    totalSpent += tx.amount
  }

  const breakdown = SPENDING_CATEGORIES
    .map(category => ({
      category,
      label: t(`category${category.charAt(0).toUpperCase()}${category.slice(1)}`, {
        defaultValue: t(category, { defaultValue: category }),
      }),
      amount: totals[category].amount,
      count: totals[category].count,
      percentage: totalSpent > 0 ? (totals[category].amount / totalSpent) * 100 : 0,
    }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return { breakdown, totalSpent }
}

export const PURPLE_SHADES = ['#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd']

export const CATEGORY_EMOJI = {
  dining: '🍽️',
  subscriptions: '📱',
  utilities: '💡',
  transport: '🚗',
  shopping: '🛒',
  health: '💊',
  travel: '✈️',
  entertainment: '🎬',
  gas: '⛽',
  insurance: '🛡️',
  personal: '💇',
  auto: '🚗',
  business: '💼',
  interest: '💸',
  loan: '🏦',
  other: '📦',
}
