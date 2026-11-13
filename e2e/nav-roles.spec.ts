/**
 * e2e/nav-roles.spec.ts
 * Step 1 — Navigation, role visibility, and old-route redirects.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

/** Login helper */
async function login(page: any, username: string = 'kerodpos', password: string = 'Kerod2026!') {
  await page.addInitScript(() => {
    localStorage.setItem('gebeyaos_company_code', 'kerod');
    const tabs = ['checkout', 'sales', 'shifts', 'shift', 'inventory', 'stock', 'purchasing', 'suppliers', 'reports', 'settings', 'catalog', 'items', 'stocktake', 'staff', 'users'];
    for (const t of tabs) {
      localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
      localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
    }
  });

  await page.goto(BASE);

  const companyInput = page.locator('input[placeholder*="Company" i], input[placeholder*="KEROD" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await Promise.race([
    companyInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
    passwordInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
  ]);

  if (await companyInput.isVisible()) {
    await companyInput.fill('kerod');
    await page.locator('button[type="submit"]').first().click();
    await expect(companyInput).toBeHidden({ timeout: 10000 });
  }

  await expect(passwordInput).toBeVisible({ timeout: 10000 });
  const usernameInput = page.locator('input[placeholder*="admin" i], input[type="text"]').first();
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
}

test.describe('Step 1 – 7-page nav and role visibility', () => {
  test('Cashier sees only Sales', async ({ page }) => {
    await login(page, 'addistaddes', 'Cashier1234!');
    // Nav should show exactly 1 button: Sales
    const navButtons = page.locator('nav[aria-label="Main navigation"] button');
    await expect(navButtons).toHaveCount(1);
    await expect(navButtons.first()).toContainText(/sales|መሸጫ/i);
  });

  test('Manager sees all 7 pages', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    const navButtons = page.locator('nav[aria-label="Main navigation"] button');
    await expect(navButtons).toHaveCount(7);
  });

  test('Old hash #checkout redirects to Sales page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#checkout`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#sales');
  });

  test('Old hash #shifts redirects to Sales page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#shifts`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#sales');
  });

  test('Old hash #catalog redirects to Items page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#catalog`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#items');
  });

  test('Old hash #inventory redirects to Stock page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#inventory`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#stock');
  });

  test('Old hash #purchasing redirects to Suppliers page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#purchasing`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#suppliers');
  });

  test('Old hash #users redirects to Staff page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#users`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#staff');
  });

  test('Old hash #sync redirects to Settings page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#sync`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#settings');
  });

  test('Old hash #backup redirects to Settings page', async ({ page }) => {
    await login(page, 'kerodpos', 'Kerod2026!');
    await page.goto(`${BASE}/#backup`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#settings');
  });
});
