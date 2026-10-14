/**
 * Client-side mirror of the API's intake rules (apps/api/src/inquiry/intake.ts) for instant feedback.
 * The API re-validates everything and is the authority; keep the limits in step.
 */
export const SERVICES = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'AUTOMATION', label: 'Business automation' },
  { value: 'CUSTOM_SOFTWARE', label: 'Custom software' },
  { value: 'CRM', label: 'CRM' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export interface IntakeForm { businessName: string; contactName: string; email: string; phone: string; service: string; description: string; website: string }
export const LIMITS = { businessName: 120, contactName: 80, email: 254, phone: 32, description: 4000 } as const;

export function intakeErrors(f: IntakeForm): Partial<Record<keyof IntakeForm, string>> {
  const e: Partial<Record<keyof IntakeForm, string>> = {};
  const bn = f.businessName.trim(), cn = f.contactName.trim(), em = f.email.trim(), ph = f.phone.trim(), d = f.description.trim();
  if (bn.length < 2) e.businessName = 'Enter your business name.'; else if (bn.length > LIMITS.businessName) e.businessName = `At most ${LIMITS.businessName} characters.`;
  if (cn.length < 2) e.contactName = 'Enter your name.'; else if (cn.length > LIMITS.contactName) e.contactName = `At most ${LIMITS.contactName} characters.`;
  if (!/^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i.test(em) || em.length > LIMITS.email) e.email = 'Enter a valid email address.';
  if (ph && !/^\+?[0-9 ()-]{6,32}$/.test(ph)) e.phone = 'Enter a valid phone number, or leave it empty.';
  if (!SERVICES.some((s) => s.value === f.service)) e.service = 'Choose a service.';
  if (d.length < 20) e.description = 'Describe what you need in at least 20 characters.';
  else if (d.length > LIMITS.description) e.description = `At most ${LIMITS.description} characters.`;
  else if ((d.match(/https?:\/\//gi) ?? []).length > 3) e.description = 'Please include at most 3 links.';
  return e;
}
