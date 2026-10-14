import { createHash, randomInt } from 'crypto';
import { InquiryStatus } from '@prisma/client';

/** Services a customer can ask for on the public form. */
export const SERVICES = ['WEBSITE', 'AUTOMATION', 'CUSTOM_SOFTWARE', 'CRM', 'OTHER'] as const;
export type Service = (typeof SERVICES)[number];

export interface IntakeInput {
  businessName: string;
  contactName: string;
  email: string;
  phone: string | null;
  service: Service;
  description: string;
}

const LIMITS = { businessName: 120, contactName: 80, email: 254, phone: 32, description: 4000 } as const;
const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9 ()-]{6,32}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(CONTROL, '').replace(/[ \t]+/g, ' ').trim() : '').slice(0, max + 1);

/**
 * Server-side validation for the public form (the web form runs the same checks for fast feedback, but this is the
 * authority). Returns normalized input or per-field errors. `website` is a honeypot: real visitors never fill it.
 */
export function validateIntake(body: unknown): { ok: true; value: IntakeInput } | { ok: false; errors: Record<string, string>; bot?: true } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website.trim() !== '') return { ok: false, errors: { form: 'Submission rejected' }, bot: true };

  const value = {
    businessName: text(b.businessName, LIMITS.businessName),
    contactName: text(b.contactName, LIMITS.contactName),
    email: text(b.email, LIMITS.email).toLowerCase(),
    phone: text(b.phone, LIMITS.phone) || null,
    service: (typeof b.service === 'string' ? b.service.trim().toUpperCase() : '') as Service,
    description: typeof b.description === 'string' ? b.description.replace(CONTROL, '').trim().slice(0, LIMITS.description + 1) : '',
  };
  const errors: Record<string, string> = {};
  if (value.businessName.length < 2) errors.businessName = 'Enter your business name.';
  else if (value.businessName.length > LIMITS.businessName) errors.businessName = `At most ${LIMITS.businessName} characters.`;
  if (value.contactName.length < 2) errors.contactName = 'Enter your name.';
  else if (value.contactName.length > LIMITS.contactName) errors.contactName = `At most ${LIMITS.contactName} characters.`;
  if (!EMAIL_RE.test(value.email) || value.email.length > LIMITS.email) errors.email = 'Enter a valid email address.';
  if (value.phone && !PHONE_RE.test(value.phone)) errors.phone = 'Enter a valid phone number, or leave it empty.';
  if (!SERVICES.includes(value.service)) errors.service = 'Choose a service.';
  if (value.description.length < 20) errors.description = 'Describe what you need in at least 20 characters.';
  else if (value.description.length > LIMITS.description) errors.description = `At most ${LIMITS.description} characters.`;
  else if ((value.description.match(/https?:\/\//gi) ?? []).length > 3) errors.description = 'Please include at most 3 links.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Same customer, same need, same tenant → same hash (duplicate submits return the original reference). */
export function submissionHash(companyId: string, v: IntakeInput): string {
  const norm = v.description.toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(`${companyId}|${v.email}|${v.service}|${norm}`).digest('hex');
}

const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O/1/I/L
/** REQ- plus 10 characters from a 31-symbol alphabet ≈ 49.5 bits: not guessable, and not the row id. */
export function newPublicRef(): string {
  let s = 'REQ-';
  for (let i = 0; i < 10; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return s;
}

/** Operator workflow. CONVERTED is terminal; REJECTED can be reopened for review. */
export const TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  NEW: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['QUALIFIED', 'REJECTED'],
  QUALIFIED: ['CONVERTED', 'REJECTED'],
  REJECTED: ['UNDER_REVIEW'],
  CONVERTED: [],
};

/** What a customer may see about their own request: never notes, ids, tenant or other customers' data. */
export const PUBLIC_STATUS: Record<InquiryStatus, string> = {
  NEW: 'RECEIVED',
  UNDER_REVIEW: 'IN_REVIEW',
  QUALIFIED: 'IN_REVIEW',
  REJECTED: 'CLOSED',
  CONVERTED: 'ACCEPTED',
};
