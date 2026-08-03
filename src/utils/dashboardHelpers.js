import { formatMoney } from './currency'
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

function getPromoDaysLeft(expirationDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expires = new Date(expirationDate)
  expires.setHours(0, 0, 0, 0)
  return Math.ceil((expires - today) / (1000 * 60 * 60 * 24))
}

const DEFAULT_ALERT_STYLE = {
  color: '#F5F3FF',
  textColor: '#7C3AED',
  borderColor: '#EDE9FE',
}

function alertItem({ icon, message, onTap, color, textColor, borderColor }) {
  return {
    icon,
    message,
    onTap,
    color: color ?? DEFAULT_ALERT_STYLE.color,
    textColor: textColor ?? DEFAULT_ALERT_STYLE.textColor,
    borderColor: borderColor ?? DEFAULT_ALERT_STYLE.borderColor,
  }
}

export function getSmartAlert({
  bills,
  promos,
  safeToSpend,
  untrackedRecurringCount = 0,
  onNavigate,
  onOpenCardPromo,
  t,
}) {
  const today = new Date().getDate()
  const unpaid = (bills ?? []).filter(b => b.is_active !== false && !isBillPaidThisMonth(b))

  const urgentPromo = (promos ?? [])
    .filter(p => {
      if (!p.expiration_date) return false
      const daysLeft = getPromoDaysLeft(p.expiration_date)
      return daysLeft <= 60 && daysLeft > 0
    })
    .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))[0]

  if (urgentPromo) {
    const daysLeft = getPromoDaysLeft(urgentPromo.expiration_date)
    const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30))
    const monthlyPayment = Math.ceil((urgentPromo.remaining_balance || 0) / monthsLeft)
    const isRed = daysLeft <= 30

    return alertItem({
      icon: isRed ? '🚨' : '⚠️',
      color: isRed ? '#FEF2F2' : '#FFFBEB',
      textColor: isRed ? '#DC2626' : '#D97706',
      borderColor: isRed ? '#FECACA' : '#FDE68A',
      message: t('promoMonthlyAvoidInterest', {
        monthly: formatMoney(monthlyPayment),
        interest: formatMoney(urgentPromo.deferred_interest || 0),
        days: daysLeft,
      }),
      onTap: () => onOpenCardPromo?.(urgentPromo.credit_card_id),
    })
  }

  const dueToday = unpaid.filter(b => Number(b.due_day) === today)
  if (dueToday.length > 0) {
    const bill = dueToday[0]
    return alertItem({
      icon: '📋',
      message: `${bill.name} ${t('dueToday')} — ${formatMoney(bill.amount)}`,
      onTap: () => onNavigate?.('bills'),
    })
  }

  const dueThisWeek = unpaid.filter(b => {
    const due = Number(b.due_day)
    return due > today && due <= today + 7
  })
  if (dueThisWeek.length > 0) {
    const total = dueThisWeek.reduce((s, b) => s + (Number(b.amount) || 0), 0)
    return alertItem({
      icon: '📋',
      message: t('billsDueThisWeekCount', {
        count: dueThisWeek.length,
        amount: formatMoney(total),
      }),
      onTap: () => onNavigate?.('bills'),
    })
  }

  if (safeToSpend < 500 && safeToSpend >= 0) {
    return alertItem({
      icon: '💛',
      color: '#FFFBEB',
      textColor: '#D97706',
      borderColor: '#FDE68A',
      message: t('safeToSpendLow'),
      onTap: null,
    })
  }

  if (untrackedRecurringCount > 0) {
    const message = untrackedRecurringCount === 1
      ? t('recurringNotTracked', { count: untrackedRecurringCount })
      : t('recurringNotTracked_plural', { count: untrackedRecurringCount })
    return alertItem({
      icon: '🔁',
      message,
      onTap: () => onNavigate?.('reports'),
    })
  }

  return null
}

export function computeMonthlyInterest(creditCards, loans) {
  const cardInterest = (creditCards ?? [])
    .filter(c => c.is_active && (c.current_balance || 0) > 0)
    .reduce((sum, c) => {
      const rate = getEffectiveRate(c).rate
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
