import { isAllowedInSafeMode, callType, blockedInSafeMode, safeMode } from './safe-mode';

describe('SafeMode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('safeMode()', () => {
    it('should return true only when AEVORA_SAFE_MODE is "true"', () => {
      process.env.AEVORA_SAFE_MODE = 'true';
      expect(safeMode()).toBe(true);

      process.env.AEVORA_SAFE_MODE = 'false';
      expect(safeMode()).toBe(false);

      delete process.env.AEVORA_SAFE_MODE;
      expect(safeMode()).toBe(false);
    });
  });

  describe('isAllowedInSafeMode()', () => {
    it('should allow loopback/local hosts unconditionally', () => {
      expect(isAllowedInSafeMode('http://localhost:3000/api')).toBe(true);
      expect(isAllowedInSafeMode('http://127.0.0.1:13000/health')).toBe(true);
      expect(isAllowedInSafeMode('http://[::1]:8080/')).toBe(true);
      expect(isAllowedInSafeMode('http://LOCALHOST/')).toBe(true);
    });

    it('should block external domains when SAFE_MODE_ALLOWED_HOSTS is not set', () => {
      delete process.env.SAFE_MODE_ALLOWED_HOSTS;
      expect(isAllowedInSafeMode('https://api.google.com/places')).toBe(false);
      expect(isAllowedInSafeMode('https://www.midtowndentistrydallas.com/')).toBe(false);
      expect(isAllowedInSafeMode('https://evil.com/')).toBe(false);
    });

    it('should allow specifically configured hosts in SAFE_MODE_ALLOWED_HOSTS', () => {
      process.env.SAFE_MODE_ALLOWED_HOSTS = 'www.midtowndentistrydallas.com,midtowndentistrydallas.com';

      expect(isAllowedInSafeMode('https://www.midtowndentistrydallas.com/')).toBe(true);
      expect(isAllowedInSafeMode('https://www.midtowndentistrydallas.com:443/services')).toBe(true);
      expect(isAllowedInSafeMode('https://midtowndentistrydallas.com/about')).toBe(true);
      expect(isAllowedInSafeMode('https://WWW.MIDTOWNDENTISTRYDALLAS.COM/')).toBe(true);
    });

    it('should handle trailing dots in hostname and configuration', () => {
      process.env.SAFE_MODE_ALLOWED_HOSTS = 'example.com., www.test.com';

      expect(isAllowedInSafeMode('https://example.com/')).toBe(true);
      expect(isAllowedInSafeMode('https://example.com./')).toBe(true);
      expect(isAllowedInSafeMode('https://www.test.com./')).toBe(true);
    });

    it('should NOT allow arbitrary subdomains or prefix/suffix spoofing', () => {
      process.env.SAFE_MODE_ALLOWED_HOSTS = 'example.com';

      // Subdomains require explicit inclusion
      expect(isAllowedInSafeMode('https://sub.example.com/')).toBe(false);
      // Suffix collision
      expect(isAllowedInSafeMode('https://notexample.com/')).toBe(false);
      // Prefix domain masquerading
      expect(isAllowedInSafeMode('https://example.com.attacker.com/')).toBe(false);
    });

    it('should return false safely for malformed URLs', () => {
      expect(isAllowedInSafeMode('')).toBe(false);
      expect(isAllowedInSafeMode('not-a-valid-url')).toBe(false);
      expect(isAllowedInSafeMode('://invalid')).toBe(false);
    });
  });

  describe('callType()', () => {
    it('should classify host categories correctly', () => {
      expect(callType('nominatim.openstreetmap.org')).toBe('lead-gen (OpenStreetMap)');
      expect(callType('maps.googleapis.com')).toBe('lead-gen (Google)');
      expect(callType('api.sendgrid.com')).toBe('outreach email');
      expect(callType('api.twilio.com')).toBe('outreach messaging');
      expect(callType('hooks.slack.com')).toBe('webhook');
      expect(callType('example.com')).toBe('network (example.com)');
    });
  });

  describe('blockedInSafeMode()', () => {
    it('should throw an error with the blocked category', () => {
      expect(() => blockedInSafeMode('lead-gen (Google)')).toThrow(
        'blocked in safe mode: lead-gen (Google)',
      );
    });
  });
});
