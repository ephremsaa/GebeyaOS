/**
 * e2e/settings.spec.ts
 * Step 7 — Consolidated Settings page with 5 clean sections (#settings).
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

  await page.goto(`${BASE}/#settings`);

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

test.describe('Step 7 – Consolidated Settings Page (5 Sections)', () => {
  test('Renders Settings header, 5 sections, and Business details', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#settings`);
    await page.waitForTimeout(1000);

    // Header title
    await expect(page.locator('h1').first()).toContainText(/Settings|ቅንብር/i);

    // 5 Sections visible on left rail
    const nav = page.locator('[data-testid="settings-nav"]');
    await expect(nav.locator('button:has-text("Business"), button:has-text("የንግድ ድርጅት")').first()).toBeVisible();
    await expect(nav.locator('button:has-text("Sales"), button:has-text("ሽያጭ")').first()).toBeVisible();
    await expect(nav.locator('button:has-text("Stock"), button:has-text("ክምችት")').first()).toBeVisible();
    await expect(nav.locator('button:has-text("Data & Backups"), button:has-text("መረጃ እና ቅጂ")').first()).toBeVisible();
    await expect(nav.locator('button:has-text("Account"), button:has-text("መለያ")').first()).toBeVisible();
  });

  test('Section navigation: Sales and Stock sections render expected fields', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#settings`);
    await page.waitForTimeout(1000);

    const nav = page.locator('[data-testid="settings-nav"]');

    // Navigate to Sales section
    await nav.locator('button:has-text("Sales"), button:has-text("ሽያጭ")').first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('select').first()).toBeVisible(); // default payment method
    await expect(page.locator('text=Allow Credit Sales').or(page.locator('text=የብድር ሽያጭ')).first()).toBeVisible();

    // Navigate to Stock section
    await nav.locator('button:has-text("Stock"), button:has-text("ክምችት")').first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('text=Default Low Stock Alert').or(page.locator('text=ዝቅተኛ የክምችት')).first()).toBeVisible();
  });

  test('Data & Backups section displays Backup, Restore, Sync, and dangerous Reset modal', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#settings`);
    await page.waitForTimeout(1000);

    const nav = page.locator('[data-testid="settings-nav"]');

    // Navigate to Data & Backups section
    await nav.locator('button:has-text("Data & Backups"), button:has-text("መረጃ እና ቅጂ")').first().click();
    await page.waitForTimeout(400);

    // Actions visible
    await expect(page.locator('button:has-text("Backup Now"), button:has-text("አሁን ቅጂ")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Restore Database"), button:has-text("ቅጂ መልስ")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Sync Now"), button:has-text("አሁን አመሳስል")').first()).toBeVisible();

    // Reset All Data button triggers dangerous modal
    const resetBtn = page.locator('button:has-text("Reset All Data"), button:has-text("ሁሉንም መረጃ አጥፋ")').first();
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await page.waitForTimeout(400);

    // Modal is visible
    await expect(page.locator('text=Reset Supermarket Data').or(page.locator('text=የሱፐርማርኬት መረጃን')).first()).toBeVisible();

    // Close modal
    await page.locator('button:has-text("Cancel"), button:has-text("ሰርዝ")').first().click();
  });

  test('Account section displays profile card and credential action triggers', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#settings`);
    await page.waitForTimeout(1000);

    const nav = page.locator('[data-testid="settings-nav"]');

    // Navigate to Account section
    await nav.locator('button:has-text("Account"), button:has-text("መለያ")').first().click();
    await page.waitForTimeout(400);

    // Profile details & change credential buttons
    await expect(page.locator('text=Change Password').or(page.locator('text=የይለፍ ቃል ቀይር')).first()).toBeVisible();
    await expect(page.locator('text=Change Quick PIN').or(page.locator('text=ፈጣን ፒን ቀይር')).first()).toBeVisible();
    await expect(page.locator('text=Log Out').or(page.locator('text=ውጣ')).first()).toBeVisible();
  });

  test('Appearance section allows switching text scaling (Medium, Large, Extra Large)', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#settings`);
    await page.waitForTimeout(1000);

    const nav = page.locator('[data-testid="settings-nav"]');

    // Navigate to Appearance section
    const appearanceBtn = nav.locator('button:has-text("Appearance"), button:has-text("ገጽታ")').first();
    await expect(appearanceBtn).toBeVisible();
    await appearanceBtn.click();
    await page.waitForTimeout(400);

    // Verify text size buttons exist
    const largeBtn = page.locator('button:has-text("Large (18px"), button:has-text("ትልቅ (18px")').first();
    await expect(largeBtn).toBeVisible();
    await largeBtn.click();
    await page.waitForTimeout(300);

    // Verify html element has class text-size-large
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('text-size-large');

    // Switch to Extra large
    const xlargeBtn = page.locator('button:has-text("Extra Large (20px"), button:has-text("Extra large (20px"), button:has-text("በጣም ትልቅ (20px")').first();
    await expect(xlargeBtn).toBeVisible();
    await xlargeBtn.click();
    await page.waitForTimeout(300);

    const htmlClassXl = await page.evaluate(() => document.documentElement.className);
    expect(htmlClassXl).toContain('text-size-xlarge');

    // Reset back to Medium
    const mediumBtn = page.locator('button:has-text("Medium (16px"), button:has-text("መካከለኛ (16px")').first();
    await expect(mediumBtn).toBeVisible();
    await mediumBtn.click();
    await page.waitForTimeout(300);

    const htmlClassMed = await page.evaluate(() => document.documentElement.className);
    expect(htmlClassMed).toContain('text-size-medium');
  });
});
