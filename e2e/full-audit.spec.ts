import { test, expect } from '@playwright/test';

test('AEVORA Visual Company Full Audit', async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('requestfailed', req => {
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });
    
    console.log('=== STEP 1: Navigate to app ===');
    // The app loads with a 3D office splash ("BUILDING THE 3D OFFICE…"), need to wait
    await page.goto('http://localhost:3001', { timeout: 120000 });
    await page.waitForTimeout(8000); // Wait for 3D splash to finish
    await page.screenshot({ path: 'audit_01_initial.png', fullPage: true });
    
    // Check if login form is visible (may auto redirect to login after 3D loads)
    const isLoginVisible = await page.locator('input[type="email"]').isVisible();
    console.log(`Login form visible: ${isLoginVisible}`);
    
    if (!isLoginVisible) {
        console.log('Navigating directly to /os (office OS login)...');
        await page.goto('http://localhost:3001/os', { timeout: 120000 });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'audit_01b_os.png', fullPage: true });
    }
    
    console.log('=== STEP 2: Login ===');
    // Try to find the login form
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 30000 });
    await emailInput.fill('chairman@aevora.local');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Sign in")');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: 'audit_02_after_login.png', fullPage: true });
    console.log(`After login URL: ${page.url()}`);
    
    console.log('=== STEP 3: Visual Company (3D office) ===');
    await page.screenshot({ path: 'audit_03_visual_company.png', fullPage: true });
    
    console.log('=== STEP 4: Navigate to /overview ===');
    await page.goto('http://localhost:3001/overview', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_04_overview.png', fullPage: true });
    
    console.log('=== STEP 5: Navigate to /ceo ===');
    await page.goto('http://localhost:3001/ceo', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_05_ceo.png', fullPage: true });
    
    console.log('=== STEP 6: Navigate to /employees ===');
    await page.goto('http://localhost:3001/employees', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_06_employees.png', fullPage: true });
    
    console.log('=== STEP 7: Navigate to /departments ===');
    await page.goto('http://localhost:3001/departments', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_07_departments.png', fullPage: true });
    
    console.log('=== STEP 8: Navigate to /sales ===');
    await page.goto('http://localhost:3001/sales', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_08_sales.png', fullPage: true });
    
    console.log('=== STEP 9: Navigate to /boardroom ===');
    await page.goto('http://localhost:3001/boardroom', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_09_boardroom.png', fullPage: true });
    
    console.log('=== STEP 10: Navigate to /financials ===');
    await page.goto('http://localhost:3001/financials', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_10_financials.png', fullPage: true });
    
    console.log('=== STEP 11: Navigate to /delivery ===');
    await page.goto('http://localhost:3001/delivery', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_11_delivery.png', fullPage: true });
    
    console.log('=== STEP 12: Navigate to /chairman ===');
    await page.goto('http://localhost:3001/chairman', { timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'audit_12_chairman.png', fullPage: true });
    
    console.log(`Total console errors: ${errors.length}`);
    console.log(`Total failed requests: ${failedRequests.length}`);
    errors.slice(0, 5).forEach(e => console.log(`ERROR: ${e}`));
    failedRequests.slice(0, 5).forEach(r => console.log(`FAILED_REQ: ${r}`));
});
