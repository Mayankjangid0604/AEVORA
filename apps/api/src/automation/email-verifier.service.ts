import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import {
  EmailVerificationResult,
  EmailVerificationStatus,
} from './automation.types';

@Injectable()
export class EmailVerifierService {
  private readonly logger = new Logger(EmailVerifierService.name);

  // RFC 5322 compliant regex for practical email syntax verification
  private readonly emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  /**
   * Validates email syntax strictly without external dependencies.
   */
  isValidSyntax(email?: string | null): boolean {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (trimmed.length > 254 || trimmed.length < 6) return false;
    if (trimmed.includes('..') || trimmed.startsWith('.') || trimmed.endsWith('.')) return false;
    return this.emailRegex.test(trimmed);
  }

  /**
   * Extracts clean domain from email address.
   */
  extractDomain(email: string): string | null {
    if (!email || !email.includes('@')) return null;
    const parts = email.trim().toLowerCase().split('@');
    if (parts.length !== 2) return null;
    return parts[1];
  }

  /**
   * Performs asynchronous DNS MX verification.
   * Never claims mailbox deliverability or inbox existence.
   */
  async verifyEmail(email?: string | null): Promise<EmailVerificationResult> {
    const verifiedAt = new Date().toISOString();

    if (!email || typeof email !== 'string') {
      return {
        email: '',
        status: 'SYNTAX_INVALID',
        syntaxValid: false,
        domain: '',
        mxFound: false,
        mxRecords: [],
        verificationMethod: 'SYNTAX_ONLY',
        isDeliverableInbox: false,
        notes: 'Email string is empty or missing.',
        verifiedAt,
      };
    }

    const trimmed = email.trim().toLowerCase();
    const syntaxValid = this.isValidSyntax(trimmed);

    if (!syntaxValid) {
      return {
        email: trimmed,
        status: 'SYNTAX_INVALID',
        syntaxValid: false,
        domain: this.extractDomain(trimmed) || '',
        mxFound: false,
        mxRecords: [],
        verificationMethod: 'SYNTAX_ONLY',
        isDeliverableInbox: false,
        notes: 'Email failed syntax validation (malformed username, domain, or illegal characters).',
        verifiedAt,
      };
    }

    const domain = this.extractDomain(trimmed)!;

    try {
      const mxEntries = await dns.promises.resolveMx(domain);
      const sortedMx = (mxEntries || [])
        .sort((a, b) => a.priority - b.priority)
        .map((entry) => entry.exchange);

      if (sortedMx.length > 0) {
        return {
          email: trimmed,
          status: 'VALID_SYNTAX_MX',
          syntaxValid: true,
          domain,
          mxFound: true,
          mxRecords: sortedMx,
          verificationMethod: 'DNS_MX',
          isDeliverableInbox: false, // Never claim mailbox exists based solely on MX
          notes: `Domain has ${sortedMx.length} active MX host(s) (${sortedMx.slice(0, 2).join(', ')}). Mailbox existence not probed.`,
          verifiedAt,
        };
      }

      // If no MX records, check if domain has an A record (RFC 5321 fallback)
      try {
        const aRecords = await dns.promises.resolve4(domain);
        if (aRecords && aRecords.length > 0) {
          return {
            email: trimmed,
            status: 'VALID_SYNTAX_MX',
            syntaxValid: true,
            domain,
            mxFound: false,
            mxRecords: [],
            verificationMethod: 'DNS_MX',
            isDeliverableInbox: false,
            notes: 'Domain has no explicit MX records, but possesses valid A record host. May accept direct mail.',
            verifiedAt,
          };
        }
      } catch {}

      return {
        email: trimmed,
        status: 'NO_MX_RECORDS',
        syntaxValid: true,
        domain,
        mxFound: false,
        mxRecords: [],
        verificationMethod: 'DNS_MX',
        isDeliverableInbox: false,
        notes: `Domain "${domain}" exists but has no configured mail exchangers (MX records).`,
        verifiedAt,
      };
    } catch (err: any) {
      if (err.code === 'ENOTFOUND' || err.code === 'NXDOMAIN') {
        return {
          email: trimmed,
          status: 'DOMAIN_NOT_FOUND',
          syntaxValid: true,
          domain,
          mxFound: false,
          mxRecords: [],
          verificationMethod: 'DNS_MX',
          isDeliverableInbox: false,
          notes: `Domain "${domain}" does not exist in DNS (NXDOMAIN).`,
          verifiedAt,
        };
      }

      if (err.code === 'ENODATA') {
        return {
          email: trimmed,
          status: 'NO_MX_RECORDS',
          syntaxValid: true,
          domain,
          mxFound: false,
          mxRecords: [],
          verificationMethod: 'DNS_MX',
          isDeliverableInbox: false,
          notes: `Domain "${domain}" has no MX records (ENODATA).`,
          verifiedAt,
        };
      }

      // DNS timeout or temporary server failure
      this.logger.warn(`DNS lookup error for domain ${domain}: ${err?.message}`);
      return {
        email: trimmed,
        status: 'UNKNOWN',
        syntaxValid: true,
        domain,
        mxFound: false,
        mxRecords: [],
        verificationMethod: 'DNS_MX',
        isDeliverableInbox: false,
        notes: `DNS resolution failed temporarily: ${err?.message || err}`,
        verifiedAt,
      };
    }
  }
}
