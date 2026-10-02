/**
 * AEVORA Currency Domain Rules
 * 
 * This module defines the constants and rules for the dual-currency system.
 * AC: Internal company currency (1,000 AC = ₹1)
 * Real Money: External real-world currency (stored in smallest integer unit, e.g. Paise for INR)
 * 
 * IMPORTANT: 
 * All financial balances and transactions must use integer-safe representations.
 * Do NOT use floating point numbers for financial calculations.
 */

export const CURRENCY = {
  AC: 'AC',
  REAL_MONEY: 'REAL_MONEY',
} as const;

export type CurrencyType = typeof CURRENCY[keyof typeof CURRENCY];

export const CONVERSION_RATE = {
  AC_PER_INR: 1000,
} as const;

/**
 * Validates if the provided amount is a safe integer for financial transactions.
 * @param amount The integer amount
 * @returns boolean
 */
export function isValidFinancialAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && !Number.isNaN(amount) && Number.isFinite(amount);
}

/**
 * Converts an INR amount to AC (e.g. 1 INR -> 1000 AC)
 * Input should be the whole INR amount as an integer if possible, 
 * but this utility helps bridge the conceptual gap.
 * @param inrAmount The amount in whole INR
 * @returns The amount in AC
 */
export function convertINRToAC(inrAmount: number): number {
  const acAmount = inrAmount * CONVERSION_RATE.AC_PER_INR;
  if (!isValidFinancialAmount(acAmount)) {
    throw new Error('Invalid financial amount result from conversion.');
  }
  return acAmount;
}
