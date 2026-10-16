import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { promisify } from 'util';
import { safeMode, isAllowedInSafeMode, blockedInSafeMode, callType } from '../common/safe-mode';

const dnsLookup = promisify(dns.lookup);

export interface CrawledPage {
  url: string;
  statusCode: number;
  title: string;
  metaDescription: string;
  cleanText: string;
  emailsFound: string[];
  phonesFound: string[];
  socialLinks: Record<string, string>;
  discoveredLinks: string[];
}

export interface WebsiteCrawlResult {
  reachable: boolean;
  finalUrl?: string;
  statusCode?: number;
  responseTimeMs: number;
  pagesCrawled: number;
  pages: CrawledPage[];
  aggregatedText: string;
  emailsFound: string[];
  phonesFound: string[];
  socialLinks: Record<string, string>;
  error?: string;
}

@Injectable()
export class WebsiteExtractorService {
  private readonly logger = new Logger(WebsiteExtractorService.name);
  private readonly maxPagesPerSite = 3;
  private readonly maxBytes = 512 * 1024; // 512 KB
  private readonly timeoutMs = 10000; // 10s per request
  private readonly maxRedirects = 3;

  /**
   * SSRF IP validation: checks if an IPv4 or IPv6 address is in a private, loopback,
   * link-local, or cloud metadata range.
   */
  isPrivateOrReservedIp(ip: string): boolean {
    let clean = ip.trim().toLowerCase();
    if (clean.startsWith('[') && clean.endsWith(']')) {
      clean = clean.slice(1, -1);
    }

    // IPv4-mapped IPv6 check (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (clean.startsWith('::ffff:')) {
      const rest = clean.slice('::ffff:'.length);
      if (rest.includes('.')) {
        return this.isPrivateOrReservedIp(rest);
      }
      const hexParts = rest.split(':');
      if (hexParts.length === 2) {
        const h1 = parseInt(hexParts[0], 16);
        const h2 = parseInt(hexParts[1], 16);
        if (!isNaN(h1) && !isNaN(h2)) {
          const v4 = [(h1 >> 8) & 0xff, h1 & 0xff, (h2 >> 8) & 0xff, h2 & 0xff].join('.');
          return this.isPrivateOrReservedIp(v4);
        }
      }
    }

    // IPv6 checks
    if (
      clean === '::1' ||
      clean === '::' ||
      clean.startsWith('fe80:') ||
      clean.startsWith('fc') ||
      clean.startsWith('fd') ||
      clean.startsWith('ff')
    ) {
      return true;
    }

    // IPv4 checks
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      return false;
    }

    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;
    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Metadata: 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private network: 172.16 - 172.31)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (a >= 240 && a <= 254) return true;
    // 255.255.255.255 (Broadcast)
    if (a === 255) return true;

    return false;
  }

  /**
   * Validates target URL against SSRF rules:
   * 1. Protocol must be http or https
   * 2. No embedded user credentials
   * 3. Allowed web ports only (80, 443, 8080, 8443)
   * 4. Hostname cannot be localhost or internal domain
   * 5. Resolves DNS and blocks private or cloud-metadata IPs
   */
  async validateUrlSafety(targetUrl: string): Promise<{ safe: boolean; error?: string; resolvedIp?: string }> {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return { safe: false, error: 'Malformed URL' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, error: `Disallowed protocol: ${parsed.protocol}. Only http and https are permitted.` };
    }

    // Safe mode check
    if (safeMode() && !isAllowedInSafeMode(targetUrl)) {
      return { safe: false, error: `Blocked in safe mode: ${callType(parsed.hostname)}` };
    }

    // Block embedded credentials
    if (parsed.username || parsed.password) {
      return { safe: false, error: 'URLs containing embedded credentials are not permitted for security.' };
    }

    // Restrict destination ports to standard web ports
    if (parsed.port) {
      const allowedPorts = ['80', '443', '8080', '8443'];
      if (!allowedPorts.includes(parsed.port)) {
        return { safe: false, error: `Access to non-web port "${parsed.port}" is blocked for security.` };
      }
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

    if (!hostname) {
      return { safe: false, error: 'Empty hostname is not permitted.' };
    }

    // Check blocked hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1'
    ) {
      return { safe: false, error: `Access to internal host "${hostname}" is blocked for security.` };
    }

    // Direct IP check if hostname is already an IP literal
    if (this.isPrivateOrReservedIp(hostname)) {
      return { safe: false, error: `Access to private IP "${hostname}" is blocked for security.` };
    }

    // Resolve DNS and check resulting IP
    try {
      const lookup = await this.resolveDns(hostname);
      for (const entry of lookup) {
        if (this.isPrivateOrReservedIp(entry.address)) {
          return {
            safe: false,
            error: `Resolved IP ${entry.address} for host ${hostname} is private/internal and blocked.`,
            resolvedIp: entry.address,
          };
        }
      }
      return { safe: true, resolvedIp: lookup[0]?.address };
    } catch (err: any) {
      return { safe: false, error: `DNS resolution failed for host "${hostname}": ${err?.message || err}` };
    }
  }

  async resolveDns(hostname: string): Promise<dns.LookupAddress[]> {
    return promisify(dns.lookup)(hostname, { all: true });
  }

  /**
   * Creates a DNS lookup function for http/https client that intercepts DNS resolution
   * at the exact moment of socket creation and enforces SSRF/private-IP blocking,
   * completely eliminating Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding attacks.
   */
  createSafeLookup(
    customLookupFn?: (hostname: string, opts: any, cb: (err: Error | null, addr?: any, family?: number) => void) => void,
  ) {
    if (customLookupFn) return customLookupFn;

    return (hostname: string, options: any, callback?: (err: Error | null, address?: any, family?: number) => void) => {
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'object' && options !== null ? options : {};
      if (typeof cb !== 'function') return;
      dns.lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return cb(err);
        if (!addresses || addresses.length === 0) {
          return cb(new Error(`No DNS records found for host "${hostname}"`));
        }
        for (const entry of addresses) {
          if (this.isPrivateOrReservedIp(entry.address)) {
            return cb(
              new Error(`[DNS Rebinding Guard] Blocked private IP: ${entry.address} for host: ${hostname}`),
            );
          }
        }
        if (opts.all) {
          return cb(null, addresses);
        }
        const primary = addresses[0];
        return cb(null, primary.address, primary.family);
      });
    };
  }

  /**
   * Performs an SSRF-safe HTTP request with redirect validation, size limits, timeout,
   * and socket-level DNS rebinding defense.
   */
  async safeFetch(
    targetUrl: string,
    redirectCount = 0,
    customLookup?: (hostname: string, opts: any, cb: (err: Error | null, addr?: any, family?: number) => void) => void,
  ): Promise<{ statusCode: number; finalUrl: string; html: string }> {
    if (redirectCount > this.maxRedirects) {
      throw new Error(`Too many redirects (limit: ${this.maxRedirects})`);
    }

    if (safeMode() && !isAllowedInSafeMode(targetUrl)) {
      blockedInSafeMode(callType(new URL(targetUrl).hostname));
    }

    const safety = await this.validateUrlSafety(targetUrl);
    if (!safety.safe) {
      throw new Error(`SSRF validation failed: ${safety.error}`);
    }

    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err?: Error, result?: { statusCode: number; finalUrl: string; html: string }) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(result!);
      };

      const req = client.request(
        parsedUrl,
        {
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 AevoraBot/1.0',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Host: parsedUrl.host,
          },
          agent: false, // Prevents socket reuse/pooling across requests
          lookup: this.createSafeLookup(customLookup), // Socket connection-level lookup guard
          timeout: this.timeoutMs,
        },
        (res) => {
          const statusCode = res.statusCode || 200;

          // Handle Redirects safely
          if ([301, 302, 303, 307, 308].includes(statusCode)) {
            const location = res.headers.location;
            res.resume(); // Discard remaining stream
            if (!location) {
              return done(new Error(`Redirect status ${statusCode} without Location header`));
            }
            let resolvedRedirect: string;
            try {
              resolvedRedirect = new URL(location, targetUrl).toString();
            } catch {
              return done(new Error(`Invalid redirect Location: ${location}`));
            }
            this.safeFetch(resolvedRedirect, redirectCount + 1, customLookup).then(
              (val) => done(undefined, val),
              (err) => done(err),
            );
            return;
          }

          // Check content type
          const rawContentType = res.headers['content-type'] || '';
          const contentType = Array.isArray(rawContentType) ? rawContentType.join(';') : rawContentType;
          const lowerContentType = contentType.toLowerCase();
          if (
            lowerContentType &&
            !lowerContentType.includes('text/html') &&
            !lowerContentType.includes('application/xhtml+xml') &&
            !lowerContentType.includes('text/plain')
          ) {
            res.resume();
            return done(new Error(`Unsupported content type: ${contentType}`));
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;

          res.on('data', (chunk: Buffer) => {
            if (totalBytes < this.maxBytes) {
              const remaining = this.maxBytes - totalBytes;
              if (chunk.length <= remaining) {
                chunks.push(chunk);
                totalBytes += chunk.length;
              } else {
                chunks.push(chunk.subarray(0, remaining));
                totalBytes += remaining;
                res.destroy(); // Cease receiving stream beyond maxBytes limit
                const bodyBuffer = Buffer.concat(chunks);
                const html = bodyBuffer.toString('utf-8');
                done(undefined, { statusCode, finalUrl: targetUrl, html });
              }
            }
          });

          res.on('end', () => {
            const bodyBuffer = Buffer.concat(chunks);
            const html = bodyBuffer.toString('utf-8');
            done(undefined, { statusCode, finalUrl: targetUrl, html });
          });

          res.on('error', (err) => done(err));
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error(`Request timed out after ${this.timeoutMs}ms`));
      });

      req.on('error', (err) => {
        done(err);
      });

      req.end();
    });
  }

  /**
   * Sanitizes and parses raw HTML content into structured page facts without third-party DOM dependencies.
   */
  parseHtml(html: string, pageUrl: string): CrawledPage {
    // 1. Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = (titleMatch ? titleMatch[1] : '').replace(/\s+/g, ' ').trim();

    // 2. Extract meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
    const metaDescription = (metaDescMatch ? metaDescMatch[1] : '').replace(/\s+/g, ' ').trim();

    // 3. Extract mailto emails
    const emailsFound = new Set<string>();
    const mailtoRegex = /href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']/gi;
    let match: RegExpExecArray | null;
    while ((match = mailtoRegex.exec(html)) !== null) {
      if (match[1]) emailsFound.add(match[1].toLowerCase().trim());
    }

    // In-text email regex
    const textEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    while ((match = textEmailRegex.exec(html)) !== null) {
      const emailCandidate = match[0].toLowerCase().trim();
      // Filter out common false positives (image extensions, generic domains)
      if (!emailCandidate.endsWith('.png') && !emailCandidate.endsWith('.jpg') && !emailCandidate.endsWith('.svg') && !emailCandidate.endsWith('.webp')) {
        emailsFound.add(emailCandidate);
      }
    }

    // 4. Extract phones
    const phonesFound = new Set<string>();
    const telRegex = /href=["']tel:([^"']+)["']/gi;
    while ((match = telRegex.exec(html)) !== null) {
      if (match[1]) {
        const cleaned = match[1].replace(/[^\d+()-.\s]/g, '').trim();
        if (cleaned.length >= 7) phonesFound.add(cleaned);
      }
    }

    // 5. Extract social links
    const socialLinks: Record<string, string> = {};
    const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    const discoveredLinks = new Set<string>();

    let currentOrigin = '';
    try {
      currentOrigin = new URL(pageUrl).origin;
    } catch {}

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1].trim();
      const lower = url.toLowerCase();

      if (lower.includes('linkedin.com/') && !lower.includes('share') && !socialLinks.linkedin) {
        socialLinks.linkedin = url;
      } else if (lower.includes('facebook.com/') && !lower.includes('sharer') && !socialLinks.facebook) {
        socialLinks.facebook = url;
      } else if (lower.includes('instagram.com/') && !socialLinks.instagram) {
        socialLinks.instagram = url;
      } else if ((lower.includes('twitter.com/') || lower.includes('x.com/')) && !lower.includes('intent') && !socialLinks.twitter) {
        socialLinks.twitter = url;
      } else if (lower.includes('youtube.com/') && !socialLinks.youtube) {
        socialLinks.youtube = url;
      }

      // Internal discovered links for navigation
      if (currentOrigin && url.startsWith(currentOrigin)) {
        discoveredLinks.add(url);
      }
    }

    // Also match relative internal links
    const relLinkRegex = /href=["'](\/[a-zA-Z0-9_\-\/]+)["']/gi;
    while ((match = relLinkRegex.exec(html)) !== null) {
      const path = match[1];
      if (currentOrigin && !path.startsWith('//')) {
        discoveredLinks.add(`${currentOrigin}${path}`);
      }
    }

    // 6. Clean body text: strip script, style, head, noscript, tags
    let clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Cap text to 10,000 characters to keep prompt compact and performant
    if (clean.length > 10000) {
      clean = clean.slice(0, 10000);
    }

    return {
      url: pageUrl,
      statusCode: 200,
      title,
      metaDescription,
      cleanText: clean,
      emailsFound: Array.from(emailsFound),
      phonesFound: Array.from(phonesFound),
      socialLinks,
      discoveredLinks: Array.from(discoveredLinks),
    };
  }

  /**
   * Identifies candidate subpages (About, Contact, Services) from discovered links.
   */
  selectPriorityPages(discoveredLinks: string[], baseUrl: string): string[] {
    const priorityKeywords = [
      'about',
      'about-us',
      'contact',
      'contact-us',
      'services',
      'our-services',
      'team',
      'treatments',
      'pricing',
    ];

    const selected: string[] = [];
    const normalizedBase = baseUrl.replace(/\/+$/, '');

    for (const link of discoveredLinks) {
      if (selected.length >= 2) break; // max 2 additional pages
      const lower = link.toLowerCase();
      if (lower === normalizedBase || lower === `${normalizedBase}/`) continue;

      const hasKeyword = priorityKeywords.some((kw) => lower.includes(`/${kw}`) || lower.includes(`-${kw}`) || lower.endsWith(kw));
      if (hasKeyword && !selected.includes(link)) {
        selected.push(link);
      }
    }

    return selected;
  }

  /**
   * Crawls a website starting from its base URL, crawling homepage + priority pages.
   */
  async crawlWebsite(websiteUrl: string): Promise<WebsiteCrawlResult> {
    const startTime = Date.now();

    if (!websiteUrl || typeof websiteUrl !== 'string') {
      return {
        reachable: false,
        responseTimeMs: 0,
        pagesCrawled: 0,
        pages: [],
        aggregatedText: '',
        emailsFound: [],
        phonesFound: [],
        socialLinks: {},
        error: 'No website URL provided',
      };
    }

    const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

    try {
      // 1. Fetch homepage
      const homeFetch = await this.safeFetch(normalizedUrl);
      const homePage = this.parseHtml(homeFetch.html, homeFetch.finalUrl);
      homePage.statusCode = homeFetch.statusCode;

      const allPages: CrawledPage[] = [homePage];
      const aggregatedEmails = new Set<string>(homePage.emailsFound);
      const aggregatedPhones = new Set<string>(homePage.phonesFound);
      const aggregatedSocial: Record<string, string> = { ...homePage.socialLinks };

      // 2. Select priority subpages
      const priorityPages = this.selectPriorityPages(homePage.discoveredLinks, homeFetch.finalUrl);

      // 3. Fetch subpages sequentially
      for (const pageUrl of priorityPages) {
        try {
          const subFetch = await this.safeFetch(pageUrl);
          const subPage = this.parseHtml(subFetch.html, subFetch.finalUrl);
          subPage.statusCode = subFetch.statusCode;
          allPages.push(subPage);

          subPage.emailsFound.forEach((e) => aggregatedEmails.add(e));
          subPage.phonesFound.forEach((p) => aggregatedPhones.add(p));
          Object.assign(aggregatedSocial, subPage.socialLinks);
        } catch (subErr: any) {
          this.logger.debug(`Subpage crawl skipped for ${pageUrl}: ${subErr?.message}`);
        }
      }

      // 4. Combine text representation
      const aggregatedText = allPages
        .map((p) => `--- PAGE: ${p.url} ---\nTitle: ${p.title}\nDescription: ${p.metaDescription}\nText Content:\n${p.cleanText}`)
        .join('\n\n');

      const responseTimeMs = Date.now() - startTime;

      return {
        reachable: homeFetch.statusCode >= 200 && homeFetch.statusCode < 400,
        finalUrl: homeFetch.finalUrl,
        statusCode: homeFetch.statusCode,
        responseTimeMs,
        pagesCrawled: allPages.length,
        pages: allPages,
        aggregatedText,
        emailsFound: Array.from(aggregatedEmails),
        phonesFound: Array.from(aggregatedPhones),
        socialLinks: aggregatedSocial,
      };
    } catch (err: any) {
      const responseTimeMs = Date.now() - startTime;
      return {
        reachable: false,
        responseTimeMs,
        pagesCrawled: 0,
        pages: [],
        aggregatedText: '',
        emailsFound: [],
        phonesFound: [],
        socialLinks: {},
        error: err?.message || 'Unknown network error during crawl',
      };
    }
  }
}
