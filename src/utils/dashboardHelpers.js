import { formatMoney } from './currency'
import { formatDate } from './date'
import { isBillPaidThisMonth } from './bills'
import { getEffectiveRate } from './creditCard'

export function getGreetingKey() {
  const hour = new Date().getHours()
  if (hour < 12) return 'goodMorning'
  if (hour < 17) return 'goodAfternoon'
  return 'goodEvening'
}

export function getFirstName(user) {
  return user?.user_metadata?.full_name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'there'
}

export function getSmartAlert({ bills, promos, safeToSpend, onNavigate, t }) {
  const today = new Date().getDate()
  const unpaid = (bills ?? []).filter(b => b.is_active !== false && !isBillPaidThisMonth(b))

  const dueToday = unpaid.filter(b => Number(b.due_day) === today)
  if (dueToday.length > 0) {
    const bill = dueToday[0]
    return {
      message: `📋 ${bill.name} ${t('dueToday')} — ${formatMoney(bill.amount)}`,
      onTap: () => onNavigate?.('bills'),
    }
  }

  const urgentPromo = (promos ?? []).find(p => {
    const days = Math.ceil((new Date(p.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days > 0
  })
  if (urgentPromo) {
    return {
      message: `⚠️ ${t('payPromoBy', {
        amount: formatMoney(urgentPromo.remaining_balance),
        date: formatDate(urgentPromo.expiration_date),
      })}`,
      onTap: () => onNavigate?.('accounts'),
    }
  }

  const dueThisWeek = unpaid.filter(b => {
    const due = Number(b.due_day)
    return due > today && due <= today + 7
  })
  if (dueThisWeek.length > 0) {
    const total = dueThisWeek.reduce((s, b) => s + (Number(b.amount) || 0), 0)
    return {
      message: `📋 ${t('billsDueThisWeekCount', {
        count: dueThisWeek.length,
        amount: formatMoney(total),
      })}`,
      onTap: () => onNavigate?.('bills'),
    }
  }

  if (safeToSpend < 500 && safeToSpend >= 0) {
    return {
      message: `💛 ${t('safeToSpendLow')}`,
      onTap: null,
    }
  }

  return null
}

export function computeMonthlyInterest(creditCards, loans) {
  const cardInterest = (creditCards ?? [])
    .filter(c => c.is_active && (c.current_balance || 0) > 0)
    .reduce((sum, c) => {
      const rate = getEffectiveRate(c)
      return sum + (c.current_balance * (rate / 100 / 12))
    }, 0)

  const loanInterest = (loans ?? [])
    .filter(l => l.is_active && (l.current_balance || 0) > 0)
    .reduce((sum, l) => sum + (l.current_balance * ((l.interest_rate || 0) / 100 / 12)), 0)

  return cardInterest + loanInterest
}

export function computeDebtPaidOffPct(loans, creditCards) {
  const loanOriginal = (loans ?? [])
    .filter(l => l.is_active)
    .reduce((sum, l) => sum + (Number(l.original_amount) || 0), 0)

  const loanCurrent = (loans ?? [])
    .filter(l => l.is_active)
    .reduce((sum, l) => sum + (Number(l.current_balance) || 0), 0)

  const cardDebt = (creditCards ?? [])
    .filter(c => c.is_active)
    .reduce((sum, c) => sum + (Number(c.current_balance) || 0), 0)

  if (loanOriginal <= 0) {
    return cardDebt > 0 ? 0 : 100
  }

  const loanPaidOff = Math.max(0, loanOriginal - loanCurrent)
  return Math.min(100, Math.max(0, (loanPaidOff / loanOriginal) * 100))
}
