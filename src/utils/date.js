export function getDefaultDateFormat() {
  const lang = navigator.language || ''
  return lang.startsWith('en') && lang !== 'en-CO' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'
}

export function getUserDateFormat() {
  return localStorage.getItem('dateFormat') || getDefaultDateFormat()
}

export function formatDate(date) {
  let yyyy, mm, dd

  // Plain YYYY-MM-DD strings (e.g. transaction_date) must not go through
  // Date parsing, which treats them as UTC and can shift a day locally.
  const isoMatch = typeof date === 'string' && date.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    ;[, yyyy, mm, dd] = isoMatch
  } else {
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d)) return ''
    yyyy = d.getFullYear()
    mm = String(d.getMonth() + 1).padStart(2, '0')
    dd = String(d.getDate()).padStart(2, '0')
  }

  return getUserDateFormat() === 'MM/DD/YYYY'
    ? `${mm}/${dd}/${yyyy}`
    : `${dd}/${mm}/${yyyy}`
}
