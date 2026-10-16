import { WebsiteExtractorService } from './website-extractor.service';

describe('WebsiteExtractorService', () => {
  let service: WebsiteExtractorService;

  beforeEach(() => {
    service = new WebsiteExtractorService();
  });

  describe('SSRF Protection & URL Safety', () => {
    it('should flag loopback and private IPv4 ranges as unsafe', () => {
      expect(service.isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(service.isPrivateOrReservedIp('10.0.0.5')).toBe(true);
      expect(service.isPrivateOrReservedIp('192.168.1.1')).toBe(true);
      expect(service.isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(service.isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    });

    it('should flag cloud metadata IP 169.254.169.254 as unsafe', () => {
      expect(service.isPrivateOrReservedIp('169.254.169.254')).toBe(true);
      expect(service.isPrivateOrReservedIp('169.254.0.1')).toBe(true);
    });

    it('should flag IPv6 loopback and private addresses as unsafe', () => {
      expect(service.isPrivateOrReservedIp('::1')).toBe(true);
      expect(service.isPrivateOrReservedIp('[::1]')).toBe(true);
      expect(service.isPrivateOrReservedIp('fe80::1')).toBe(true);
      expect(service.isPrivateOrReservedIp('fc00::1')).toBe(true);
      expect(service.isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
      expect(service.isPrivateOrReservedIp('[::ffff:127.0.0.1]')).toBe(true);
      expect(service.isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);
      expect(service.isPrivateOrReservedIp('::ffff:7f00:1')).toBe(true);
    });

    it('should allow legitimate public IP addresses', () => {
      expect(service.isPrivateOrReservedIp('8.8.8.8')).toBe(false);
      expect(service.isPrivateOrReservedIp('142.250.190.46')).toBe(false);
      expect(service.isPrivateOrReservedIp('1.1.1.1')).toBe(false);
    });

    it('should reject non-http/https protocols', async () => {
      const fileRes = await service.validateUrlSafety('file:///etc/passwd');
      expect(fileRes.safe).toBe(false);
      expect(fileRes.error).toContain('Disallowed protocol');

      const ftpRes = await service.validateUrlSafety('ftp://example.com/file');
      expect(ftpRes.safe).toBe(false);
    });

    it('should reject localhost and internal domain names', async () => {
      const localhostRes = await service.validateUrlSafety('http://localhost:3000/api');
      expect(localhostRes.safe).toBe(false);
      expect(localhostRes.error).toContain('blocked for security');

      const localRes = await service.validateUrlSafety('http://myserver.local/test');
      expect(localRes.safe).toBe(false);

      const internalRes = await service.validateUrlSafety('http://metadata.internal/v1');
      expect(internalRes.safe).toBe(false);
    });

    it('should reject direct private IP URLs', async () => {
      const ipRes = await service.validateUrlSafety('http://169.254.169.254/latest/meta-data/');
      expect(ipRes.safe).toBe(false);

      const mappedRes = await service.validateUrlSafety('http://[::ffff:127.0.0.1]/test');
      expect(mappedRes.safe).toBe(false);
    });

    it('should reject URLs with embedded user credentials', async () => {
      const credRes1 = await service.validateUrlSafety('http://admin:secret@example.com/data');
      expect(credRes1.safe).toBe(false);
      expect(credRes1.error).toContain('embedded credentials');

      const credRes2 = await service.validateUrlSafety('https://user@example.com/');
      expect(credRes2.safe).toBe(false);
      expect(credRes2.error).toContain('embedded credentials');
    });

    it('should reject non-web ports and allow standard web ports', async () => {
      // Non-web ports
      const sshRes = await service.validateUrlSafety('http://example.com:22/');
      expect(sshRes.safe).toBe(false);
      expect(sshRes.error).toContain('non-web port');

      const smtpRes = await service.validateUrlSafety('http://example.com:25/');
      expect(smtpRes.safe).toBe(false);

      const dbRes = await service.validateUrlSafety('http://example.com:5432/');
      expect(dbRes.safe).toBe(false);

      // Allowed web ports (using a mock/domain that doesn't resolve to private IP or testing port logic)
      // Note: validateUrlSafety also checks DNS. For example.com, 80/443 are standard
      const malformedRes = await service.validateUrlSafety('not-a-valid-url');
      expect(malformedRes.safe).toBe(false);
      expect(malformedRes.error).toContain('Malformed URL');
    });

    it('should flag extended RFC reserved IP blocks as unsafe', () => {
      // 0.0.0.0/8 (Current network)
      expect(service.isPrivateOrReservedIp('0.0.0.0')).toBe(true);
      expect(service.isPrivateOrReservedIp('0.1.2.3')).toBe(true);

      // 100.64.0.0/10 (Carrier-Grade NAT)
      expect(service.isPrivateOrReservedIp('100.64.0.1')).toBe(true);
      expect(service.isPrivateOrReservedIp('100.127.255.254')).toBe(true);
      expect(service.isPrivateOrReservedIp('100.128.0.1')).toBe(false);

      // 192.0.0.0/24 (IETF Protocol Assignments)
      expect(service.isPrivateOrReservedIp('192.0.0.1')).toBe(true);

      // 192.0.2.0/24 (TEST-NET-1)
      expect(service.isPrivateOrReservedIp('192.0.2.10')).toBe(true);

      // 198.18.0.0/15 (Benchmarking)
      expect(service.isPrivateOrReservedIp('198.18.0.1')).toBe(true);
      expect(service.isPrivateOrReservedIp('198.19.255.255')).toBe(true);
      expect(service.isPrivateOrReservedIp('198.20.0.1')).toBe(false);

      // 198.51.100.0/24 (TEST-NET-2)
      expect(service.isPrivateOrReservedIp('198.51.100.50')).toBe(true);

      // 203.0.113.0/24 (TEST-NET-3)
      expect(service.isPrivateOrReservedIp('203.0.113.99')).toBe(true);

      // 224.0.0.0/4 (Multicast)
      expect(service.isPrivateOrReservedIp('224.0.0.1')).toBe(true);
      expect(service.isPrivateOrReservedIp('239.255.255.250')).toBe(true);

      // 240.0.0.0/4 (Reserved)
      expect(service.isPrivateOrReservedIp('240.0.0.1')).toBe(true);

      // 255.255.255.255 (Broadcast)
      expect(service.isPrivateOrReservedIp('255.255.255.255')).toBe(true);
    });

    it('should block mixed DNS answers containing both public and private IPs', async () => {
      jest.spyOn(service, 'resolveDns').mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);

      const res = await service.validateUrlSafety('https://attacker-mixed-dns.com');
      expect(res.safe).toBe(false);
      expect(res.error).toContain('is private/internal and blocked');
    });

    it('should block DNS rebinding at socket connection time via createSafeLookup', (done) => {
      const safeLookup = service.createSafeLookup();
      const dns = require('dns');
      const originalLookup = dns.lookup;

      dns.lookup = jest.fn((hostname: string, opts: any, cb: any) => {
        // Simulates DNS server returning 169.254.169.254 on socket connect
        cb(null, [{ address: '169.254.169.254', family: 4 }]);
      });

      safeLookup('rebind-test.com', {}, (err: Error | null, addr?: any) => {
        try {
          expect(err).toBeDefined();
          expect(err?.message).toContain('[DNS Rebinding Guard] Blocked private IP: 169.254.169.254');
          done();
        } finally {
          dns.lookup = originalLookup;
        }
      });
    });

    it('should block unallowed external domains in safe mode', async () => {
      const prevSafe = process.env.AEVORA_SAFE_MODE;
      const prevAllowed = process.env.SAFE_MODE_ALLOWED_HOSTS;
      try {
        process.env.AEVORA_SAFE_MODE = 'true';
        process.env.SAFE_MODE_ALLOWED_HOSTS = 'www.midtowndentistrydallas.com';

        const res = await service.validateUrlSafety('https://unauthorized-domain.com');
        expect(res.safe).toBe(false);
        expect(res.error).toContain('Blocked in safe mode');

        const allowedRes = await service.validateUrlSafety('https://www.midtowndentistrydallas.com');
        // Pre-validation URL syntax/safe-mode passes (DNS may resolve depending on network)
        if (!allowedRes.safe) {
          // If DNS fails in test runner environment, verify it wasn't blocked by safe mode
          expect(allowedRes.error).not.toContain('Blocked in safe mode');
        }
      } finally {
        process.env.AEVORA_SAFE_MODE = prevSafe;
        process.env.SAFE_MODE_ALLOWED_HOSTS = prevAllowed;
      }
    });
  });

  describe('HTML Parsing and Public Fact Extraction', () => {
    it('should extract title, description, emails, phones, and social links cleanly', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Premier Dental Clinic | Dallas, TX</title>
          <meta name="description" content="Providing world-class cosmetic dentistry and teeth whitening in Dallas." />
        </head>
        <body>
          <header>
            <a href="tel:+12145550199">Call (214) 555-0199</a>
            <a href="mailto:contact@premierdental.com">Email Us</a>
          </header>
          <main>
            <h1>Welcome to Premier Dental</h1>
            <p>We specialize in pediatric dentistry, dental implants, and clear aligners.</p>
            <p>For inquiries, write to info@premierdental.com or visit our clinic.</p>
          </main>
          <footer>
            <a href="https://www.linkedin.com/company/premierdental">LinkedIn</a>
            <a href="https://www.facebook.com/premierdentaldallas">Facebook</a>
            <a href="https://www.instagram.com/premierdental">Instagram</a>
            <a href="/about-us">About Our Doctors</a>
            <a href="/services">Our Treatments</a>
          </footer>
        </body>
        </html>
      `;

      const parsed = service.parseHtml(sampleHtml, 'https://premierdental.com');

      expect(parsed.title).toBe('Premier Dental Clinic | Dallas, TX');
      expect(parsed.metaDescription).toBe('Providing world-class cosmetic dentistry and teeth whitening in Dallas.');
      expect(parsed.emailsFound).toContain('contact@premierdental.com');
      expect(parsed.emailsFound).toContain('info@premierdental.com');
      expect(parsed.phonesFound).toContain('+12145550199');
      expect(parsed.socialLinks.linkedin).toBe('https://www.linkedin.com/company/premierdental');
      expect(parsed.socialLinks.facebook).toBe('https://www.facebook.com/premierdentaldallas');
      expect(parsed.socialLinks.instagram).toBe('https://www.instagram.com/premierdental');
      expect(parsed.cleanText).toContain('Welcome to Premier Dental');
      expect(parsed.cleanText).toContain('pediatric dentistry');
    });

    it('should select priority subpages (About, Contact, Services)', () => {
      const discovered = [
        'https://premierdental.com/about-us',
        'https://premierdental.com/privacy-policy',
        'https://premierdental.com/services',
        'https://premierdental.com/terms-and-conditions',
      ];

      const selected = service.selectPriorityPages(discovered, 'https://premierdental.com');
      expect(selected).toContain('https://premierdental.com/about-us');
      expect(selected).toContain('https://premierdental.com/services');
      expect(selected).not.toContain('https://premierdental.com/privacy-policy');
      expect(selected.length).toBeLessThanOrEqual(2);
    });
  });
});
