import { test, expect } from '@playwright/test';

test('minimal browser launch smoke test', async ({ page }) => {
  // A. launch - Playwright handles this implicitly
  
  // B. open the AEVORA web application
  try {
    await page.goto('http://localhost:3001', { timeout: 120000 });
  } catch (e: any) {
    throw new Error('Failed to reach http://localhost:3001 - ' + e.message);
  }

  // C. Wait for the page to render
  await page.waitForTimeout(5000); 
  
  await page.screenshot({ path: 'aevora_login.png', fullPage: true });

  // D. authenticate
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 120000 });
  await emailInput.fill('chairman@aevora.local');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button:has-text("Sign in")');
  
  // Wait for dashboard to load
  await page.waitForTimeout(15000);
  
  await page.screenshot({ path: 'aevora_dashboard.png', fullPage: true });
  const title = await page.title();
  console.log(`Page title: ${title}`);
});
