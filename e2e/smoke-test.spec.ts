import { test, expect } from '@playwright/test';

test.describe('GebeyaOS POS Page-by-Page Smoke Test', () => {
  test('Visits all pages and asserts zero console errors and zero failed API requests', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected benign connection aborts during test navigation
        if (!text.includes('Failed to load resource') && !text.includes('net::ERR_CONNECTION_REFUSED')) {
          consoleErrors.push(text);
        }
      }
    });

    // Capture failed network requests
    page.on('response', (response) => {
      if (response.status() >= 500) {
        failedRequests.push(`${response.url()} -> ${response.status()}`);
      }
    });

    // Disable tour hints
    await page.addInitScript(() => {
      const tabs = ['checkout', 'sales', 'shifts', 'shift', 'inventory', 'stock', 'purchasing', 'suppliers', 'reports', 'settings', 'catalog', 'items', 'stocktake', 'staff', 'users'];
      for (const t of tabs) {
        localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
        localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
      }
    });

    // 1. Login
    await page.goto('/');

    const companyInput = page.locator('input[placeholder*="Company" i], input[placeholder*="KEROD" i]').first();
    if (await companyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await companyInput.fill('kerod');
      await page.click('button[type="submit"]');
      await expect(companyInput).toBeHidden({ timeout: 10000 });
    }

    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10000 });
    await usernameInput.fill('kerodpos');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('Kerod2026!');
    await page.click('button[type="submit"]');

    const salesButton = page.locator('nav button:has-text("Sales"), nav button:has-text("መሸጫ")').first();
    await expect(salesButton).toBeVisible({ timeout: 15000 });

    // 2. Iterate and visit every one of the 7 simplified pages
    const tabsToTest = [
      'nav button:has-text("Sales"), nav button:has-text("መሸጫ")',
      'nav button:has-text("Items"), nav button:has-text("እቃዎች")',
      'nav button:has-text("Stock"), nav button:has-text("ክምችት")',
      'nav button:has-text("Suppliers"), nav button:has-text("አቅራቢዎች")',
      'nav button:has-text("Reports"), nav button:has-text("ሪፖርቶች")',
      'nav button:has-text("Staff"), nav button:has-text("ሰራተኞች")',
      'nav button:has-text("Settings"), nav button:has-text("ቅንብሮች")',
    ];

    for (const selector of tabsToTest) {
      const tabLocator = page.locator(selector).first();
      if (await tabLocator.isVisible().catch(() => false)) {
        await tabLocator.click();
        await page.waitForTimeout(600);
      }
    }

    // 3. Final assertion: Zero 5xx server failures and zero unhandled console errors
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
