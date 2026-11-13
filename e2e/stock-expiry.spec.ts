/**
 * e2e/stock-expiry.spec.ts
 * Step 4 — Consolidated Stock & Expiry page (#stock).
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function loginAsManager(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem('gebeyaos_company_code', 'kerod');
    const tabs = [
      'checkout', 'sales', 'shifts', 'shift', 'inventory', 'stock',
      'purchasing', 'suppliers', 'reports', 'settings', 'catalog',
      'items', 'stocktake', 'staff', 'users',
    ];
    for (const t of tabs) {
      localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
      localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
    }
  });

  await page.goto(`${BASE}/#stock`);

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
  await usernameInput.fill('kerodpos');
  await passwordInput.fill('Kerod2026!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
}

test.describe('Step 4 – Stock & Expiry Consolidated Page', () => {
  test('Renders Stock & Expiry header, KPI cards, and filter tabs', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#stock`);
    await page.waitForTimeout(1000);

    // Header title
    await expect(page.locator('h1').first()).toContainText(/Stock & Expiry|የክምችትና/i);

    // View toggle buttons (By Item / By Batch)
    await expect(page.locator('button:has-text("By Item"), button:has-text("በዕቃ")').first()).toBeVisible();
    await expect(page.locator('button:has-text("By Batch"), button:has-text("በምድብ")').first()).toBeVisible();

    // 4 KPI cards present
    await expect(page.locator('text=Expired').or(page.locator('text=ጊዜያቸው ያለፈ')).first()).toBeVisible();
    await expect(page.locator('text=Expiring in 7 Days').or(page.locator('text=በ7 ቀናት')).first()).toBeVisible();
    await expect(page.locator('text=Low Stock').or(page.locator('text=ዝቅተኛ ክምችት')).first()).toBeVisible();

    // Filter tabs
    await expect(page.locator('button:has-text("All stock"), button:has-text("ሁሉም ክምችት")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Expiring soon"), button:has-text("በቅርቡ ጊዜያቸው")').first()).toBeVisible();
  });

  test('View mode switches to By Batch and shows expiry columns', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#stock`);
    await page.waitForTimeout(1000);

    // Switch to By Batch
    const batchBtn = page.locator('button:has-text("By Batch"), button:has-text("በምድብ")').first();
    await batchBtn.click();
    await page.waitForTimeout(500);

    // Verify batch table header
    await expect(page.locator('th:has-text("Batch Number"), th:has-text("የምድብ ቁጥር")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Expiry Date"), th:has-text("የማለቂያ ቀን")').first()).toBeVisible();
  });

  test('Add Stock button opens chooser modal with Scan, Manual, and Excel options', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#stock`);
    await page.waitForTimeout(1000);

    // Click Add Stock button
    const addStockBtn = page.locator('button:has-text("Add Stock"), button:has-text("ክምችት ጨምር")').first();
    await addStockBtn.click();
    await page.waitForTimeout(500);

    // Chooser modal displays options
    await expect(page.locator('text=Scan-to-Add').or(page.locator('text=Scan')).first()).toBeVisible();
    await expect(page.locator('text=Manual Multi-Line Entry').or(page.locator('text=Manual')).first()).toBeVisible();
    await expect(page.locator('text=Excel / CSV').first()).toBeVisible();
  });
});
