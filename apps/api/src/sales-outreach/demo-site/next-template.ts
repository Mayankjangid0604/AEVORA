/**
 * Next.js (App Router, React) demo site for a lead. The model only writes the content (JSON);
 * the code is this fixed, tested template — so every demo builds on Vercel.
 * Shown on the site: the business's own public name, city and phone. Never any personal or company email.
 */

export interface DemoContent {
  businessName: string;
  city: string;
  phone?: string | null;
  tagline: string;
  about: string;
  services: { name: string; description: string }[];
  highlights: string[];
  cta: string;
  primaryColor: string; // #rrggbb
  address?: string | null; // real street address from the business listing
  hours?: string | null; // real opening hours from the business listing
}

/**
 * The real public profile of a lead, from its listing (OpenStreetMap / Places): what kind of place it is,
 * its street address, opening hours and whether it already has a website. The demo-email note is dropped.
 */
export function realProfile(lead: { notes?: string | null; geography?: string | null; website?: string | null }) {
  const parts = (lead.notes ?? '').split(' · ').map((s) => s.trim()).filter((s) => s && !/^DEMO lead/i.test(s));
  const hoursPart = parts.find((s) => s.startsWith('open '));
  const kind = parts.find((s) => s !== hoursPart && /^[a-z_]+$/.test(s))?.replace(/_/g, ' ') ?? null;
  return {
    kind,
    hours: hoursPart ? hoursPart.slice(5).replace(/;\s*/g, '; ') : null,
    address: lead.geography?.trim() || null,
    website: lead.website?.trim() || null,
  };
}

const INDUSTRY_DEFAULTS: Record<string, Partial<DemoContent>> = {
  restaurant: { primaryColor: '#b45309', services: [{ name: 'Dine-in', description: 'A warm table and freshly cooked food.' }, { name: 'Takeaway', description: 'Order ahead and pick up hot.' }, { name: 'Catering', description: 'Food for your events and parties.' }], highlights: ['Fresh ingredients', 'Family friendly', 'Quick service'] },
  salon: { primaryColor: '#be185d', services: [{ name: 'Hair', description: 'Cuts, colour and styling.' }, { name: 'Skin', description: 'Facials and skin care.' }, { name: 'Bridal', description: 'Complete bridal packages.' }], highlights: ['Trained stylists', 'Hygienic tools', 'Easy booking'] },
  gym: { primaryColor: '#15803d', services: [{ name: 'Strength', description: 'Modern equipment for every level.' }, { name: 'Personal training', description: 'Plans built around your goals.' }, { name: 'Group classes', description: 'Train together, stay motivated.' }], highlights: ['Certified trainers', 'Flexible timings', 'Clean facility'] },
  clinic: { primaryColor: '#0e7490', services: [{ name: 'Consultation', description: 'Experienced doctors, clear advice.' }, { name: 'Diagnostics', description: 'Tests and reports you can trust.' }, { name: 'Follow-up', description: 'Care that continues after your visit.' }], highlights: ['Experienced staff', 'Easy appointments', 'Patient first'] },
  coaching_center: { primaryColor: '#4338ca', services: [{ name: 'Courses', description: 'Structured programs with clear goals.' }, { name: 'Test series', description: 'Practice that builds confidence.' }, { name: 'Doubt sessions', description: 'Personal attention for every student.' }], highlights: ['Expert faculty', 'Proven methods', 'Small batches'] },
  retail_shop: { primaryColor: '#1d4ed8', services: [{ name: 'Wide range', description: 'Quality products for every need.' }, { name: 'Best prices', description: 'Fair prices every day.' }, { name: 'Home delivery', description: 'Order by phone, delivered to you.' }], highlights: ['Trusted locally', 'Genuine products', 'Friendly service'] },
};

const clamp = (s: unknown, max: number, fallback = '') => (typeof s === 'string' && s.trim() ? s.trim().replace(/\s+/g, ' ').slice(0, max) : fallback);
/** Strip anything that looks like an email address — the demo must never show one. */
const noEmail = (s: string) => s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '').replace(/\s{2,}/g, ' ').trim();

/** Model output (or nothing) → safe, complete content. */
export function normalizeDemoContent(raw: any, lead: { name: string; industry?: string | null; city: string; phone?: string | null; address?: string | null; hours?: string | null }): DemoContent {
  const d = INDUSTRY_DEFAULTS[(lead.industry ?? '').toLowerCase()] ?? INDUSTRY_DEFAULTS.retail_shop;
  const services = (Array.isArray(raw?.services) ? raw.services : [])
    .map((x: any) => ({ name: noEmail(clamp(x?.name, 40)), description: noEmail(clamp(x?.description, 140)) }))
    .filter((x: any) => x.name && x.description)
    .slice(0, 6);
  const highlights = (Array.isArray(raw?.highlights) ? raw.highlights : []).map((h: any) => noEmail(clamp(h, 40))).filter(Boolean).slice(0, 4);
  const color = typeof raw?.primaryColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.primaryColor) ? raw.primaryColor : d.primaryColor!;
  return {
    businessName: lead.name.slice(0, 80),
    city: lead.city.slice(0, 60),
    phone: lead.phone?.split(/[;,]/)[0]?.trim() || null,
    tagline: noEmail(clamp(raw?.tagline, 90, `Welcome to ${lead.name}`)),
    about: noEmail(clamp(raw?.about, 500, `${lead.name} serves customers in ${lead.city} with care and quality.`)),
    services: services.length >= 2 ? services : d.services!,
    highlights: highlights.length >= 2 ? highlights : d.highlights!,
    cta: noEmail(clamp(raw?.cta, 40, lead.phone ? 'Call us today' : 'Visit us today')),
    primaryColor: color,
    address: lead.address ? noEmail(lead.address).slice(0, 160) : null,
    hours: lead.hours ? noEmail(lead.hours).slice(0, 120) : null,
  };
}

/** Vercel project name: lowercase slug + short random suffix (keeps <name>.vercel.app free, so no account name is added). */
export function demoProjectName(businessName: string, rand = Math.random().toString(36).slice(2, 6)) {
  const slug = businessName.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36).replace(/-+$/, '') || 'business';
  return `${slug}-demo-${rand}`;
}

/** The files of the Next.js project, ready for the Vercel deployments API. */
export function nextDemoFiles(c: DemoContent): { file: string; data: string }[] {
  const pkg = {
    name: 'demo-site',
    private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dependencies: { next: 'latest', react: 'latest', 'react-dom': 'latest' },
  };
  const layout = `export const metadata = {
  title: ${JSON.stringify(`${c.businessName} — ${c.city}`)},
  description: ${JSON.stringify(c.tagline)},
  robots: { index: false, follow: false },
};
import './globals.css';
export default function RootLayout({ children }) {
  return (<html lang="en"><body>{children}</body></html>);
}
`;
  const page = `import content from '../content.json';
export default function Home() {
  const c = content;
  return (
    <main>
      <header className="hero">
        <nav><strong>{c.businessName}</strong><span>{c.city}</span></nav>
        <h1>{c.tagline}</h1>
        <p className="lead">{c.about}</p>
        {c.phone ? <a className="btn" href={'tel:' + c.phone.replace(/[^+0-9]/g, '')}>{c.cta} · {c.phone}</a> : <span className="btn">{c.cta}</span>}
      </header>
      <section className="grid">
        {c.services.map((s) => (<article key={s.name} className="card"><h3>{s.name}</h3><p>{s.description}</p></article>))}
      </section>
      <section className="chips">{c.highlights.map((h) => <span key={h}>{h}</span>)}</section>
      {(c.address || c.hours) ? (
        <section className="card visit"><h3>Visit us</h3>{c.address ? <p>{c.address}</p> : null}{c.hours ? <p className="muted">Open: {c.hours}</p> : null}</section>
      ) : null}
      <footer>
        <p><strong>{c.businessName}</strong> · {c.city}{c.phone ? ' · ' + c.phone : ''}</p>
        <p className="muted">Free demo design prepared for {c.businessName}. This is a preview, not the live website.</p>
      </footer>
    </main>
  );
}
`;
  const css = `:root { --p: ${c.primaryColor}; }
* { box-sizing: border-box; margin: 0; }
body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2937; background: #fafafa; line-height: 1.6; }
main { max-width: 1040px; margin: 0 auto; padding: 0 20px 48px; }
.hero { padding: 28px 0 56px; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 8px 0 40px; color: #6b7280; }
nav strong { color: var(--p); font-size: 20px; }
h1 { font-size: clamp(32px, 6vw, 56px); line-height: 1.1; max-width: 16ch; }
.lead { font-size: 18px; color: #4b5563; max-width: 60ch; margin: 18px 0 28px; }
.btn { display: inline-block; background: var(--p); color: #fff; padding: 14px 22px; border-radius: 10px; text-decoration: none; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-top: 4px solid var(--p); border-radius: 12px; padding: 20px; }
.card h3 { margin-bottom: 6px; }
.visit { max-width: 960px; margin: 0 auto 32px; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; margin: 32px 0; }
.chips span { background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 8px 14px; font-size: 14px; }
footer { border-top: 1px solid #e5e7eb; padding-top: 20px; color: #374151; }
.muted { color: #9ca3af; font-size: 13px; margin-top: 6px; }
`;
  const files: Record<string, string> = {
    'package.json': JSON.stringify(pkg, null, 2),
    'next.config.js': 'module.exports = { reactStrictMode: true };\n',
    'jsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.' } }, null, 2),
    'content.json': JSON.stringify(c, null, 2),
    'app/layout.js': layout,
    'app/page.js': page,
    'app/globals.css': css,
  };
  return Object.entries(files).map(([file, data]) => ({ file, data }));
}

export const DEMO_CONTENT_PROMPT = (lead: { name: string; industry?: string | null; city: string; kind?: string | null }) =>
  `Write website content for a demo homepage of "${lead.name}", a real ${lead.kind ?? String(lead.industry ?? 'local business').replace(/_/g, ' ')} in ${lead.city}.
Return ONLY JSON: {"tagline": string (max 8 words), "about": string (2 sentences), "services": [{"name": string, "description": string (1 sentence)}] (3-4 items),
"highlights": string[] (3 short phrases), "cta": string (max 4 words), "primaryColor": "#rrggbb"}.
Rules: no email addresses, no prices, no invented awards, statistics, reviews or years in business.`;
