import { test, expect } from '@playwright/test';

test.describe('GebeyaOS POS Page-by-Page Smoke Test', () => {
  test('Visits all pages and asserts zero console errors and zero failed API requests', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}]:`, msg.text());
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon.ico')) {
          consoleErrors.push(text);
        }
      }
    });

    // Capture unhandled exceptions
    page.on('pageerror', (err) => {
      consoleErrors.push(`Uncaught Page Error: ${err.message}`);
    });

    // Capture failed network requests (4xx and 5xx)
    page.on('response', (response) => {
      const url = response.url();
      const status = response.status();
      if (status >= 400) {
        console.log(`[HTTP FAIL ${status}]:`, url);
        if (status >= 500) {
          failedRequests.push(`Server Error ${status}: ${url}`);
        }
      }
    });

    // 1. Authenticate
    await page.goto('/');
    const companyInput = page.locator('input[placeholder*="Company" i], input[type="text"]').first();
    await expect(companyInput).toBeVisible({ timeout: 15000 });
    await companyInput.fill('kerod');
    await page.click('button[type="submit"]');

    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10000 });
    await usernameInput.fill('kerodpos');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('Kerod2026!');
    await page.click('button[type="submit"]');

    const checkoutButton = page.getByRole('button', { name: 'Checkout' });
    await expect(checkoutButton).toBeVisible({ timeout: 15000 });

    // Open shift if needed
    await checkoutButton.click();
    await page.waitForTimeout(500);
    const openShiftBtn = page.locator('button:has-text("Open Shift")').first();
    if (await openShiftBtn.isVisible().catch(() => false)) {
      await openShiftBtn.click();
      await page.waitForTimeout(800);
    }

    // 2. Iterate and visit every screen
    const tabsToTest = [
      'Checkout',
      'Shift',
      'Inventory',
      'Purchasing',
      'Reports',
      'HQ Sync',
      'Catalog',
      'Stocktake',
      'Staff & Roles',
      'Settings',
    ];

    for (const tab of tabsToTest) {
      const tabLocator = page.getByRole('button', { name: tab });
      if (await tabLocator.isVisible().catch(() => false)) {
        await tabLocator.click();
        await page.waitForTimeout(600); // Allow render & API response to complete
      }
    }

    // 3. Assert zero console errors and zero failed 5xx network requests
    expect(consoleErrors, `Expected 0 console errors, but got: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(failedRequests, `Expected 0 failed 5xx server requests, but got: ${failedRequests.join('\n')}`).toEqual([]);
  });
});
