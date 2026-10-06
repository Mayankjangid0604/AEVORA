import { expect, test, type Page } from '@playwright/test';
import { COMPANY_DOMAINS } from '../src/lib/domains';

/**
 * Browser-level Company OS checks. Requires E2E_IDENTIFIER / E2E_PASSWORD (project fixture test account),
 * E2E_COMPANY (own) and E2E_FOREIGN_COMPANY. Everything is read-only.
 */
const { E2E_IDENTIFIER = '', E2E_PASSWORD = '', E2E_COMPANY = '', E2E_FOREIGN_COMPANY = '' } = process.env;
test.skip(!E2E_IDENTIFIER || !E2E_PASSWORD || !E2E_COMPANY || !E2E_FOREIGN_COMPANY, 'E2E environment not configured');

const axePath = require.resolve('axe-core/axe.min.js');
const NEW_PAGES = ['assistant', 'notifications', 'workers', 'administration', 'operations'];

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or actor ID').fill(E2E_IDENTIFIER);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Waits until no skeleton remains, so checks run against loaded data or a final state. */
async function settled(page: Page) {
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('main [role="status"], main .skeleton')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('h1')).toHaveCount(1);
}

async function axe(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document);
    return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
}

test('unauthenticated visit redirects to login', async ({ page }) => {
  await page.goto(`/company/${E2E_COMPANY}/assistant`);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test.describe('authenticated', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('session token is not readable by page script or stored in browser storage', async ({ page }) => {
    const exposed = await page.evaluate(() => [document.cookie, JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join(' '));
    expect(exposed).not.toMatch(/eyJ|token/i);
  });

  test('every navigation link resolves to a built page (no dead links, no placeholders)', async ({ page }) => {
    await page.goto(`/company/${E2E_COMPANY}`);
    const hrefs = await page.locator('nav a[href^="/company/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
    expect(hrefs.length).toBeGreaterThanOrEqual(COMPANY_DOMAINS.length);
    for (const href of hrefs) {
      const res = await page.goto(href);
      expect(res?.status(), href).toBe(200);
      await expect(page.getByText(/could not be found|not built yet/i), href).toHaveCount(0);
    }
  });

  for (const scheme of ['dark', 'light'] as const) {
    test(`axe (incl. colour contrast), ${scheme} mode, Slice 9-10 pages`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const slug of NEW_PAGES) {
        await page.goto(`/company/${E2E_COMPANY}/${slug}`);
        await settled(page);
        expect(await axe(page), `${slug} (${scheme})`).toEqual([]);
      }
    });
  }

  test('headings: one h1, workspace h2, no skipped levels', async ({ page }) => {
    for (const slug of NEW_PAGES) {
      await page.goto(`/company/${E2E_COMPANY}/${slug}`);
      await settled(page);
      const levels = await page.locator('main h1, main h2, main h3, main h4').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
      expect(levels.filter((l) => l === 1), slug).toHaveLength(1);
      levels.forEach((l, i) => { if (i) expect(l - levels[i - 1]!, slug).toBeLessThanOrEqual(1); });
    }
  });

  test('keyboard: Tab reaches interactive controls with a visible focus indicator', async ({ page }) => {
    await page.goto(`/company/${E2E_COMPANY}/workers`);
    await settled(page);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const cs = a ? getComputedStyle(a) : null;
        return { tag: a?.tagName, visible: !!cs && (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' || cs.boxShadow !== 'none') };
      });
      expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY']).toContain(focus.tag);
      expect(focus.visible).toBe(true);
    }
  });

  for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 768, height: 1024 }], ['mobile', { width: 375, height: 812 }]] as const) {
    test(`responsive ${name}: no horizontal page overflow`, async ({ page }) => {
      await page.setViewportSize(size);
      for (const slug of NEW_PAGES) {
        await page.goto(`/company/${E2E_COMPANY}/${slug}`);
        await settled(page);
        const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(sw, `${slug} @${name}`).toBeLessThanOrEqual(w);
      }
    });
  }

  test('foreign company shows the forbidden state; malformed id shows not-found', async ({ page }) => {
    await page.goto(`/company/${E2E_FOREIGN_COMPANY}/workers`);
    await expect(page.getByText('You do not have access to this company.')).toBeVisible();
    await page.goto(`/company/${E2E_COMPANY}/operations/not%20an%20id`);
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });

  test('Slice 10 pages render real records without action controls', async ({ page }) => {
    for (const slug of ['assistant', 'notifications', 'workers']) {
      await page.goto(`/company/${E2E_COMPANY}/${slug}`);
      await settled(page);
      await expect(page.locator('main button, main textarea, main input'), slug).toHaveCount(0);
    }
    await page.goto(`/company/${E2E_COMPANY}/notifications`);
    await expect(page.getByText(/^\d+ unread$/)).toBeVisible();
  });
});
