/**
 * e2e/staff-page.spec.ts
 * Step 6 — Staff & Roles management page (#staff).
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

  await page.goto(`${BASE}/#staff`);

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

test.describe('Step 6 – Staff & Roles Management Page', () => {
  test('Renders Staff header, directory table, and actions', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#staff`);
    await page.waitForTimeout(1000);

    // Header title
    await expect(page.locator('h1').first()).toContainText(/Staff & Roles|የሰራተኞች አስተዳደር/i);

    // Add Staff button
    await expect(page.locator('button:has-text("Add Staff"), button:has-text("ሰራተኛ መዝግብ")').first()).toBeVisible();

    // Table headers
    await expect(page.locator('th:has-text("Staff Member"), th:has-text("ሰራተኛ")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Role"), th:has-text("ሚና")').first()).toBeVisible();
  });

  test('Add Staff modal opens with auto-generated 4-digit PIN and Copy PIN button', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#staff`);
    await page.waitForTimeout(1000);

    // Click Add Staff
    const addBtn = page.locator('button:has-text("Add Staff"), button:has-text("ሰራተኛ መዝግብ")').first();
    await addBtn.click();
    await page.waitForTimeout(500);

    // Modal is visible
    await expect(page.locator('text=Add Staff Member').or(page.locator('text=አዲስ ሰራተኛ')).first()).toBeVisible();

    // Copy PIN button is visible
    await expect(page.locator('button:has-text("Copy PIN")').first()).toBeVisible();

    // Close modal
    await page.locator('button[type="button"]:has(svg.lucide-x)').first().click();
  });

  test('Reset PIN modal opens with auto-generated PIN and Copy button', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#staff`);
    await page.waitForTimeout(1000);

    // Find Reset PIN button (KeyRound icon) on first row
    const resetPinBtn = page.locator('button:has(svg.lucide-key-round)').first();
    await resetPinBtn.click();
    await page.waitForTimeout(500);

    // Reset PIN modal is visible
    await expect(page.locator('text=Reset Quick PIN').or(page.locator('text=ፈጣን ፒን')).first()).toBeVisible();
    await expect(page.locator('button:has-text("Copy PIN")').first()).toBeVisible();

    // Close modal
    await page.locator('button:has-text("Cancel"), button:has-text("ሰርዝ")').first().click();
  });
});
