export function getBankDisplayName(bank) {
  if (!bank) return ''
  return bank.nickname?.trim() || bank.name || ''
}
