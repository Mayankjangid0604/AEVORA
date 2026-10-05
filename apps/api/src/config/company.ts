/** Company contact details from env (COMPANY_NAME / COMPANY_EMAIL / COMPANY_PHONE / COMPANY_ADDRESS). No hardcoded real data. */
export function companyProfile(env: NodeJS.ProcessEnv = process.env) {
  return {
    name: env.COMPANY_NAME?.trim() || 'our company',
    email: env.COMPANY_EMAIL?.trim() || env.SMTP_USER?.trim() || '',
    phone: env.COMPANY_PHONE?.trim() || '',
    address: env.COMPANY_ADDRESS?.trim() || '',
  };
}

/** For anything sent to a client: refuses to go out with blank contact details. */
export function requireCompanyContact(env: NodeJS.ProcessEnv = process.env) {
  const c = companyProfile(env);
  const missing = [!env.COMPANY_NAME?.trim() && 'COMPANY_NAME', !c.email && 'COMPANY_EMAIL', !c.phone && 'COMPANY_PHONE'].filter(Boolean);
  if (missing.length) throw new Error(`Cannot send: ${missing.join(', ')} not set (see .env.example)`);
  return c;
}

/** "Name, Address" (or just the name) for prompts. */
export const companyLine = () => {
  const c = companyProfile();
  return c.address ? `${c.name}, ${c.address}` : c.name;
};
