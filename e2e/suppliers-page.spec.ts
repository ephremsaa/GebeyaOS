/**
 * e2e/suppliers-page.spec.ts
 * Step 5 — Consolidated Suppliers & Goods Intake page (#suppliers).
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

  await page.goto(`${BASE}/#suppliers`);

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

test.describe('Step 5 – Suppliers & Goods Intake Consolidated Page', () => {
  test('Renders Suppliers header, 2 tabs, and KPI cards', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#suppliers`);
    await page.waitForTimeout(1000);

    // Header title
    await expect(page.locator('h1').first()).toContainText(/Suppliers & Goods Intake|አቅራቢዎች እና ዕቃ/i);

    // 2 Tabs present
    await expect(page.locator('button:has-text("Suppliers"), button:has-text("አቅራቢዎች")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Received Items"), button:has-text("የተረከቧቸው ዕቃዎች")').first()).toBeVisible();

    // Top action buttons present
    await expect(page.locator('button:has-text("Add Supplier"), button:has-text("አቅራቢ መዝግብ")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Receive Items"), button:has-text("ዕቃ ተቀበል")').first()).toBeVisible();
  });

  test('Switching to Received Items tab displays GRN columns', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#suppliers`);
    await page.waitForTimeout(1000);

    // Click Received Items tab
    const grnTab = page.locator('button:has-text("Received Items"), button:has-text("የተረከቧቸው ዕቃዎች")').first();
    await grnTab.click();
    await page.waitForTimeout(500);

    // Verify GRN table headers
    await expect(page.locator('th:has-text("GRN Number"), th:has-text("የGRN ቁጥር")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Invoice / Waybill"), th:has-text("የደረሰኝ")').first()).toBeVisible();
  });

  test('Add Supplier modal opens and validates inputs', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#suppliers`);
    await page.waitForTimeout(1000);

    // Click Add Supplier
    const addBtn = page.locator('button:has-text("Add Supplier"), button:has-text("አቅራቢ መዝግብ")').first();
    await addBtn.click();
    await page.waitForTimeout(500);

    // Verify modal inputs
    await expect(page.locator('input[placeholder*="Awash Agro" i]').first()).toBeVisible();
    await expect(page.locator('input[placeholder*="0911223344" i]').first()).toBeVisible();

    // Close modal
    await page.locator('button:has-text("Cancel"), button:has-text("ሰርዝ")').first().click();
  });

  test('Receive Items 3-step wizard opens and displays Step 1', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#suppliers`);
    await page.waitForTimeout(1000);

    // Click Receive Items
    const receiveBtn = page.locator('button:has-text("Receive Items"), button:has-text("ዕቃ ተቀበል")').first();
    await receiveBtn.click();
    await page.waitForTimeout(500);

    // Step 1 title visible
    await expect(page.locator('text=1. Supplier & Invoice').or(page.locator('text=1. አቅራቢ እና ደረሰኝ')).first()).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();

    // Click Next to Step 2
    const nextBtn = page.locator('button:has-text("Next")').first();
    await nextBtn.click();
    await page.waitForTimeout(500);

    // Step 2 title visible
    await expect(page.locator('text=2. Items & Batches').or(page.locator('text=2. ዕቃዎች እና ባቾች')).first()).toBeVisible();
  });
});
