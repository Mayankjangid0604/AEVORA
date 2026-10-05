import { COMPANY_DOMAINS, OS_DOMAINS } from './domains';
import { isSafeId } from './http';

export interface NavEntry { href: string; label: string; group: string }

/** The company id in the current URL, if any. Navigation state only: never used for authorization. */
export function companyFromPath(pathname: string | null): string | null {
  const id = pathname?.match(/^\/company\/([^/]+)/)?.[1];
  return id && isSafeId(id) ? id : null;
}

/** Destinations for the command palette / mobile menu, derived from the domain registry. */
export function commandEntries(pathname: string | null): NavEntry[] {
  const entries: NavEntry[] = [{ href: '/', label: 'Companies', group: 'AEVORA' }];
  const companyId = companyFromPath(pathname);
  if (companyId) {
    entries.push({ href: `/company/${companyId}`, label: 'Company home', group: 'Company' });
    for (const d of COMPANY_DOMAINS) entries.push({ href: `/company/${companyId}/${d.slug}`, label: d.label, group: 'Company' });
  }
  for (const d of OS_DOMAINS) entries.push({ href: `/${d.slug}`, label: d.label, group: 'AEVORA' });
  return entries;
}
