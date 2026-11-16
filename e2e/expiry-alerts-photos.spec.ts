import { test, expect } from '@playwright/test';

test.describe('Expiry List, Alerts, and Product Photo Upload & ZIP Import', () => {
  test('Expiry List tab renders with summary cards, value at risk, clearance modal, and photo upload has NO image URL fields', async ({
    page,
  }) => {
    // 0. Disable tour hints and set language to English
    await page.addInitScript(() => {
      localStorage.setItem('gebeya_lang', 'en');
      localStorage.setItem('gebeya_theme', 'dark');
      const tabs = ['checkout', 'shift', 'inventory', 'purchasing', 'reports', 'settings', 'catalog', 'stocktake'];
      for (const t of tabs) {
        localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
        localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
      }
    });

    // 1. Visit root page
    await page.goto('/');

    // 2. Authenticate
    const companyInput = page.locator('input[placeholder*="Company" i], input[placeholder*="KEROD" i]').first();
    if (await companyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await companyInput.fill('kerod');
      await companyInput.press('Enter');
      await expect(companyInput).toBeHidden({ timeout: 10000 });
    }

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    const usernameInput = page.locator('input[placeholder*="admin" i], input[type="text"]').first();
    await usernameInput.fill('kerodpos');
    await passwordInput.fill('Kerod2026!');
    await page.click('button[type="submit"]');

    // 3. Navigate to Stock & Expiry page
    const navStockBtn = page.locator('nav button:has-text("Stock & Expiry"), nav button:has-text("ክምችት እና ማለቂያ")').first();
    await expect(navStockBtn).toBeVisible({ timeout: 15000 });
    await navStockBtn.click();

    // 4. Click "Expiry List" tab
    const expiryListTab = page.locator('button:has-text("Expiry List"), button:has-text("የማለቂያ ቀናት ዝርዝር")').first();
    await expect(expiryListTab).toBeVisible({ timeout: 10000 });
    await expiryListTab.click();

    // 5. Verify Summary Cards and Value at Risk card
    await expect(page.locator('text=Value at Risk').first()).toBeVisible();
    await expect(page.locator('button:has-text("Excel")').first()).toBeVisible();
    await expect(page.locator('button:has-text("PDF")').first()).toBeVisible();

    // 6. Navigate to Items page (Catalog)
    const navItemsBtn = page.locator('nav button:has-text("Items"), nav button:has-text("እቃዎች")').first();
    await expect(navItemsBtn).toBeVisible({ timeout: 10000 });
    await navItemsBtn.click();

    // 7. Verify "Import" button opens CatalogImportModal with both Excel and Photo ZIP tabs
    const importBtn = page.locator('button:has-text("Import from Excel"), button:has-text("ከኤክሴል አስገባ")').first();
    await expect(importBtn).toBeVisible({ timeout: 10000 });
    await importBtn.click();

    // Verify ZIP Import tab in modal
    const zipTab = page.locator('button:has-text("Bulk Photo ZIP"), button:has-text("የብዙ ፎቶዎች ZIP")').first();
    await expect(zipTab).toBeVisible({ timeout: 5000 });
    await zipTab.click();
    await expect(page.locator('text=Choose ZIP Archive').first()).toBeVisible();

    // Close import modal
    const closeModalBtn = page.locator('button:has-text("Close"), button:has-text("ዝጋ")').first();
    await closeModalBtn.click();

    // 8. Open "Add Item" drawer and verify Product Photo Upload is present and NO "Image URL" field exists
    const addItemBtn = page.locator('button:has-text("Add Product"), button:has-text("አዲስ እቃ")').first();
    await expect(addItemBtn).toBeVisible({ timeout: 10000 });
    await addItemBtn.click();

    // Verify Product Photo Upload dropzone and controls
    await expect(page.locator('text=Product Photo').first()).toBeVisible();
    await expect(page.locator('button:has-text("Choose photo"), button:has-text("ፎቶ ይምረጡ")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Take photo"), button:has-text("ፎቶ አንሳ")').first()).toBeVisible();

    // Strictly assert NO "Image URL" input is present on the page
    const imageUrlInputs = page.locator('input[placeholder*="unsplash" i], input[placeholder*="image" i]');
    expect(await imageUrlInputs.count()).toBe(0);
    const imageUrlLabels = page.locator('text=Image URL, text=የምስል አድራሻ');
    expect(await imageUrlLabels.count()).toBe(0);
  });
});
