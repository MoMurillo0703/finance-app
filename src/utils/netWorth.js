export function calculateNetWorth({ banks, creditCards, loans }) {
  const totalBankBalance = banks
    .filter(b => b.is_active)
    .reduce((sum, b) => sum + (b.balance || 0), 0)

  const totalCreditCardDebt = creditCards
    .filter(c => c.is_active)
    .reduce((sum, c) => sum + (c.current_balance || 0), 0)

  const totalLoanDebt = loans
    .filter(l => l.is_active)
    .reduce((sum, l) => sum + (l.current_balance || 0), 0)

  const totalAssets = totalBankBalance
  const totalLiabilities = totalCreditCardDebt + totalLoanDebt
  const netWorth = totalAssets - totalLiabilities

  return {
    totalAssets,
    totalLiabilities,
    totalBankBalance,
    totalCreditCardDebt,
    totalLoanDebt,
    netWorth,
  }
}
