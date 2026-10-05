import { convertINRToAC, isValidFinancialAmount } from './currency';

describe('Currency Domain Rules', () => {
  describe('isValidFinancialAmount', () => {
    it('should return true for safe integers', () => {
      expect(isValidFinancialAmount(100)).toBe(true);
      expect(isValidFinancialAmount(0)).toBe(true);
      expect(isValidFinancialAmount(-50)).toBe(true);
    });

    it('should return false for floats', () => {
      expect(isValidFinancialAmount(100.5)).toBe(false);
    });

    it('should return false for unsafe integers', () => {
      expect(isValidFinancialAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });
  });

  describe('convertINRToAC', () => {
    it('should correctly convert whole INR to AC', () => {
      expect(convertINRToAC(1)).toBe(1000);
      expect(convertINRToAC(50)).toBe(50000);
    });

    it('should throw if the result is not a safe integer', () => {
      expect(convertINRToAC(10.5)).toBe(10500); // This is a safe integer
      expect(() => convertINRToAC(10.0001)).toThrow(); // 10.0001 * 1000 = 10000.1 (not an integer)
    });
  });
});
