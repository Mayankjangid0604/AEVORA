import { EmailVerifierService } from './email-verifier.service';

describe('EmailVerifierService', () => {
  let service: EmailVerifierService;

  beforeEach(() => {
    service = new EmailVerifierService();
  });

  describe('Syntax Validation', () => {
    it('should validate valid email syntax patterns', () => {
      expect(service.isValidSyntax('test@example.com')).toBe(true);
      expect(service.isValidSyntax('john.doe@company.co.uk')).toBe(true);
      expect(service.isValidSyntax('user+tag@sub.domain.org')).toBe(true);
      expect(service.isValidSyntax('dr.smith@dentalcare.com')).toBe(true);
    });

    it('should reject invalid email syntax patterns', () => {
      expect(service.isValidSyntax('')).toBe(false);
      expect(service.isValidSyntax(null)).toBe(false);
      expect(service.isValidSyntax('plainaddress')).toBe(false);
      expect(service.isValidSyntax('@missingusername.com')).toBe(false);
      expect(service.isValidSyntax('username@.com')).toBe(false);
      expect(service.isValidSyntax('user..name@domain.com')).toBe(false);
      expect(service.isValidSyntax('user name@domain.com')).toBe(false);
    });

    it('should extract domains correctly', () => {
      expect(service.extractDomain('test@example.com')).toBe('example.com');
      expect(service.extractDomain('USER@SUB.DOMAIN.ORG')).toBe('sub.domain.org');
      expect(service.extractDomain('invalid')).toBe(null);
    });
  });

  describe('DNS & MX Verification Classification', () => {
    it('should verify live domain MX records for google.com', async () => {
      const result = await service.verifyEmail('info@google.com');

      expect(result.syntaxValid).toBe(true);
      expect(result.mxFound).toBe(true);
      expect(result.status).toBe('VALID_SYNTAX_MX');
      expect(result.mxRecords.length).toBeGreaterThan(0);
      expect(result.verificationMethod).toBe('DNS_MX');
      // Crucial requirement: Never claim mailbox deliverability
      expect(result.isDeliverableInbox).toBe(false);
    }, 15000);

    it('should return DOMAIN_NOT_FOUND for non-existent domains', async () => {
      const result = await service.verifyEmail('test@nonexistent-domain-aevora-xyz-987654.com');

      expect(result.syntaxValid).toBe(true);
      expect(['DOMAIN_NOT_FOUND', 'UNKNOWN']).toContain(result.status);
      expect(result.mxFound).toBe(false);
      expect(result.isDeliverableInbox).toBe(false);
    }, 30000);

    it('should return SYNTAX_INVALID for malformed email inputs without doing DNS queries', async () => {
      const result = await service.verifyEmail('not-an-email');

      expect(result.syntaxValid).toBe(false);
      expect(result.status).toBe('SYNTAX_INVALID');
      expect(result.verificationMethod).toBe('SYNTAX_ONLY');
      expect(result.isDeliverableInbox).toBe(false);
    });
  });
});
