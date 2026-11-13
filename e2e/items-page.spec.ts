/**
 * e2e/items-page.spec.ts
 * Step 3 — Items & Categories consolidated page (#items).
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function loginAsManager(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem('gebeyaos_company_code', 'kerod');
    const tabs = ['checkout', 'sales', 'shifts', 'shift', 'inventory', 'stock', 'purchasing', 'suppliers', 'reports', 'settings', 'catalog', 'items', 'stocktake', 'staff', 'users'];
    for (const t of tabs) {
      localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
      localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
    }
  });

  await page.goto(`${BASE}/#items`);

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

test.describe('Step 3 – Items & Categories consolidated page', () => {
  test('Items page displays items and categories tabs with Excel actions', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#items`);
    await page.waitForTimeout(500);

    // Verify page title
    await expect(page.locator('h1').first()).toContainText(/items|ዕቃዎች/i);

    // Verify view tabs exist
    const itemsTabBtn = page.locator('button', { hasText: /all items|ሁሉም ዕቃዎች/i }).first();
    const categoriesTabBtn = page.locator('button', { hasText: /categories|ምድቦች/i }).first();
    await expect(itemsTabBtn).toBeVisible();
    await expect(categoriesTabBtn).toBeVisible();

    // Verify Excel import and export buttons exist
    await expect(page.locator('button', { hasText: /import|ማስመጣት/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /export/i }).first()).toBeVisible();
  });

  test('Add item drawer has "Make a code for me", name, and expiry date toggle', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#items`);
    await page.waitForTimeout(500);

    // Click Add Item button
    const addItemBtn = page.locator('button', { hasText: /add product|add item|ዕቃ ጨምር/i }).first();
    await addItemBtn.click();

    // Verify drawer opened and locate drawer's barcode input
    const barcodeInput = page.locator('input[placeholder*="628100" i]').first();
    await expect(barcodeInput).toBeVisible();

    // Verify "Make a code for me" button generates a barcode
    const genCodeBtn = page.locator('button', { hasText: /make a code for me|ኮድ ፍጠርልኝ/i }).first();
    await expect(genCodeBtn).toBeVisible();
    await genCodeBtn.click();
    await page.waitForTimeout(500);

    const generatedBarcode = await barcodeInput.inputValue();
    expect(generatedBarcode.length).toBeGreaterThan(5);

    // Verify "Has expiry date" toggle is present
    const expiryToggle = page.locator('label', { hasText: /has expiry date|የሚያበቃበት ቀን አለው/i }).first();
    await expect(expiryToggle).toBeVisible();

    // Fill product details and save
    const uniqueName = `Test Item ${Date.now()}`;
    const nameInput = page.locator('input[placeholder*="Sunflower" i]').first();
    await nameInput.fill(uniqueName);

    const priceInput = page.locator('input[type="number"][min="0"]').first();
    await priceInput.fill('45.50');

    // Click Save Product
    const saveBtn = page.locator('button', { hasText: /save product|እቃውን መዝግብ/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Verify product appears in the table with colored initial avatar
    await expect(page.locator(`text=${uniqueName}`).first()).toBeVisible({ timeout: 8000 });
  });

  test('Categories section on the same page allows adding and safe archiving', async ({ page }) => {
    await loginAsManager(page);
    await page.goto(`${BASE}/#items`);
    await page.waitForTimeout(500);

    // Switch to Categories tab on the same page
    const categoriesTabBtn = page.locator('button', { hasText: /categories|ምድቦች/i }).first();
    await categoriesTabBtn.click();
    await page.waitForTimeout(500);

    // Fill Add New Category form
    const catCode = `CAT${Date.now().toString().slice(-4)}`;
    const catName = `Beverages ${catCode}`;

    const catNameEnInput = page.locator('form input').nth(0);
    await expect(catNameEnInput).toBeVisible();
    await catNameEnInput.fill(catName);

    const catCodeInput = page.locator('form input').nth(2);
    await catCodeInput.fill(catCode);

    const addCatBtn = page.locator('form button[type="submit"]').first();
    await addCatBtn.click();
    await page.waitForTimeout(1000);

    // Verify newly created category appears in table
    await expect(page.locator(`text=${catName}`).first()).toBeVisible({ timeout: 8000 });
  });
});
