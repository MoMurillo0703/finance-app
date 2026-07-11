import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isBillPaidThisMonth } from '../../utils/bills'

export default function BillsCalendar({ bills, language, selectedDay, onSelectDay }) {
  const locale = language === 'es' ? 'es-CO' : 'en-US'
  const startMonday = language === 'es'
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })

  const prevMonth = () => {
    setView(v => {
      const d = new Date(v.year, v.month - 1, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const nextMonth = () => {
    setView(v => {
      const d = new Date(v.year, v.month + 1, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const { monthLabel, weekdayLabels, cells, isCurrentMonth, todayDate } = useMemo(() => {
    const { year, month } = view
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstWeekday = new Date(year, month, 1).getDay()
    const offset = startMonday ? (firstWeekday === 0 ? 6 : firstWeekday - 1) : firstWeekday

    const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })

    const labels = []
    const baseDate = startMonday ? new Date(2024, 0, 1) : new Date(2023, 11, 31)
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate)
      d.setDate(baseDate.getDate() + i)
      labels.push(weekdayFormatter.format(d))
    }

    const dayCells = []
    for (let i = 0; i < offset; i++) dayCells.push(null)
    for (let day = 1; day <= daysInMonth; day++) dayCells.push(day)

    const nowInner = new Date()
    const current = year === nowInner.getFullYear() && month === nowInner.getMonth()

    return {
      monthLabel: monthFormatter.format(new Date(year, month, 1)),
      weekdayLabels: labels,
      cells: dayCells,
      isCurrentMonth: current,
      todayDate: current ? nowInner.getDate() : null,
    }
  }, [view, locale, startMonday])

  return (
    <div className="bg-white rounded-2xl mx-4 mb-4 p-4 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-3">
        <button type="button" onClick={prevMonth} className="text-gray-400 hover:text-gray-600 p-1">
          <ChevronLeft size={18} />
        </button>
        <p className="font-semibold text-gray-800 text-sm capitalize">{monthLabel}</p>
        <button type="button" onClick={nextMonth} className="text-gray-400 hover:text-gray-600 p-1">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {weekdayLabels.map((d, i) => (
          <p key={i} className="text-center text-xs text-gray-400 font-medium">{d}</p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((date, i) => {
          if (date == null) {
            return <div key={`empty-${i}`} className="py-1" />
          }

          const billsOnDay = bills.filter(b => b.due_day === date)
          const isToday = isCurrentMonth && date === todayDate
          const isSelected = selectedDay === date

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay?.(date)}
              className={`relative flex flex-col items-center py-1 rounded-xl ${
                isToday ? 'bg-purple-600' : isSelected ? 'bg-purple-50' : ''
              }`}
            >
              <p className={`text-xs font-medium ${isToday ? 'text-white' : 'text-gray-700'}`}>
                {date}
              </p>
              <div className="flex gap-0.5 mt-0.5 h-1 items-center">
                {billsOnDay.slice(0, 3).map((b, j) => {
                  const paid = isBillPaidThisMonth(b)
                  const overdue = isCurrentMonth && !paid && date < todayDate
                  const dotColor = paid
                    ? 'bg-green-400'
                    : overdue
                      ? 'bg-red-400'
                      : isToday
                        ? 'bg-white'
                        : 'bg-amber-400'
                  return <div key={j} className={`w-1 h-1 rounded-full ${dotColor}`} />
                })}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
