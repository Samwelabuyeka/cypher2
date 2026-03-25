export default async function validateBalanceConsistency({ record }) {
  // Ensure balance = availableBalance + lockedBalance
  const expectedBalance = (record.availableBalance || 0) + (record.lockedBalance || 0);
  const actualBalance = record.balance || 0;
  
  // Allow small floating point differences (0.00000001)
  const tolerance = 0.00000001;
  const difference = Math.abs(expectedBalance - actualBalance);
  
  if (difference > tolerance) {
    throw new Error(
      `Balance inconsistency: balance (${actualBalance}) must equal availableBalance (${record.availableBalance}) + lockedBalance (${record.lockedBalance})`
    );
  }
}