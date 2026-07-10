import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function BillsCalendar({ bills, language }) {
  const { t } = useTranslation()
  const locale = language === 'es' ? 'es-CO' : 'en-US'
  const startMonday = language === 'es'

  const { monthLabel, weekdayLabels, weeks, today, billsByDay } = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const todayDate = now.getDate()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstWeekday = new Date(year, month, 1).getDay()

    const offset = startMonday
      ? (firstWeekday === 0 ? 6 : firstWeekday - 1)
      : firstWeekday

    const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })

    const weekdayLabels = []
    const baseDate = startMonday ? new Date(2024, 0, 1) : new Date(2023, 11, 31)
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate)
      d.setDate(baseDate.getDate() + i)
      weekdayLabels.push(weekdayFormatter.format(d))
    }

    const cells = []
    for (let i = 0; i < offset; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) cells.push(day)

    const weeks = []
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7)
      while (week.length < 7) week.push(null)
      weeks.push(week)
    }

    const counts = {}
    for (const bill of bills) {
      const day = bill.due_day
      if (day >= 1 && day <= daysInMonth) {
        counts[day] = (counts[day] || 0) + 1
      }
    }

    return {
      monthLabel: monthFormatter.format(now),
      weekdayLabels,
      weeks,
      today: todayDate,
      billsByDay: counts,
    }
  }, [bills, locale, startMonday])

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-6">
      <h2 className="text-base font-semibold text-gray-700 mb-3 capitalize">{t('billsCalendar')}</h2>
      <p className="text-xs text-gray-400 mb-3 capitalize">{monthLabel}</p>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayLabels.map((label, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-gray-400 py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day, i) => {
          if (day == null) {
            return <div key={`empty-${i}`} className="aspect-square" />
          }

          const count = billsByDay[day] || 0
          const isToday = day === today

          return (
            <div
              key={day}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 ${
                isToday ? 'bg-purple-100 ring-1 ring-purple-300' : 'bg-gray-50'
              }`}
            >
              <span className={`text-[11px] leading-none ${isToday ? 'font-bold text-purple-700' : 'text-gray-600'}`}>
                {day}
              </span>
              {count > 0 && (
                <span className="text-[9px] leading-none font-semibold text-purple-600 bg-purple-50 rounded-full min-w-[14px] px-1 text-center">
                  {count}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
