/**
 * e2e/nav-roles.spec.ts
 * Step 1 — Navigation, role visibility, and old-route redirects.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

/** Login helper */
async function login(page: any, username: string, password: string) {
  await page.goto(BASE);
  const companyInput = page.locator('input[placeholder*="company" i], input[name="company"], input[placeholder*="supermarket" i]');
  if (await companyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await companyInput.fill('gebeya');
  }
  await page.fill('input[type="text"]:not([name="company"]), input[name="username"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
}

test.describe('Step 1 – 7-page nav and role visibility', () => {
  test('Cashier sees only Sales', async ({ page }) => {
    await login(page, 'cashier1', 'cashier1password');
    // Nav should show exactly 1 button: Sales
    const navButtons = page.locator('nav[aria-label="Main navigation"] button');
    const count = await navButtons.count();
    expect(count).toBe(1);
    await expect(navButtons.first()).toContainText(/sales|መሸጫ/i);
  });

  test('Manager sees all 7 pages', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    const navButtons = page.locator('nav[aria-label="Main navigation"] button');
    await expect(navButtons).toHaveCount(7);
  });

  test('Old hash #checkout redirects to Sales page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#checkout`);
    await page.waitForTimeout(500);
    // Hash should become #sales
    expect(page.url()).toContain('#sales');
  });

  test('Old hash #shifts redirects to Sales page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#shifts`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#sales');
  });

  test('Old hash #catalog redirects to Items page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#catalog`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#items');
  });

  test('Old hash #inventory redirects to Stock page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#inventory`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#stock');
  });

  test('Old hash #purchasing redirects to Suppliers page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#purchasing`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#suppliers');
  });

  test('Old hash #users redirects to Staff page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#users`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#staff');
  });

  test('Old hash #sync redirects to Settings page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#sync`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#settings');
  });

  test('Old hash #backup redirects to Settings page', async ({ page }) => {
    await login(page, 'manager1', 'manager1password');
    await page.goto(`${BASE}/#backup`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#settings');
  });

  test('Nav has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await login(page, 'manager1', 'manager1password');
    await page.waitForTimeout(1000);
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
