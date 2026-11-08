import { test, expect } from '@playwright/test';

test.describe('Settings Page UI/UX and Persistence', () => {
  test('Dark mode color matching and settings save verification', async ({ page }) => {
    // 0. Disable tour hints and set dark mode in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('gebeya_theme', 'dark');
      const tabs = ['checkout', 'shift', 'inventory', 'purchasing', 'reports', 'settings', 'catalog', 'stocktake'];
      for (const t of tabs) {
        localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
        localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
      }
    });

    // 1. Visit root page
    await page.goto('/');

    // 2. Step 1: Supermarket Company Code
    const companyInput = page.locator('input[placeholder*="Company" i], input[placeholder*="KEROD" i]').first();
    if (await companyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await companyInput.fill('kerod');
      await companyInput.press('Enter');
      await expect(companyInput).toBeHidden({ timeout: 10000 });
    }

    // 3. Step 2: Cashier / Owner Authentication
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    const usernameInput = page.locator('input[placeholder*="admin" i], input[type="text"]').first();
    await usernameInput.fill('kerodpos');
    await passwordInput.fill('Kerod2026!');
    await page.click('button[type="submit"]');

    // 4. Verify successful login: main navigation visible
    const checkoutButton = page.getByRole('button', { name: 'Checkout' });
    await expect(checkoutButton).toBeVisible({ timeout: 15000 });

    // 5. Ensure dark mode class is on html
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('gebeya_theme', 'dark');
    });
    await expect(page.locator('html')).toHaveClass(/dark/);

    // 6. Navigate to Settings via sidebar navigation rail
    const settingsNavBtn = page.locator('nav button:has-text("Settings"), nav button:has-text("ቅንብሮች")').first();
    await expect(settingsNavBtn).toBeVisible({ timeout: 10000 });
    await settingsNavBtn.click();

    // 7. Verify Settings Page loaded
    const pageHeader = page.locator('h1');
    await expect(pageHeader).toBeVisible({ timeout: 10000 });
    await expect(pageHeader).toContainText(/Settings|ቅንብሮች/i);

    // 8. Inspect the sub-navigation background color in dark mode
    // It must NOT be pure white rgb(255, 255, 255)
    const branchTabBtn = page.locator('button:has-text("Branch Details"), button:has-text("የቅርንጫፍ ዝርዝር")').first();
    await expect(branchTabBtn).toBeVisible();
    const subNavParent = branchTabBtn.locator('xpath=./../..');
    const subNavBg = await subNavParent.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node && (window.getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)' || window.getComputedStyle(node).backgroundColor === 'transparent')) {
        node = node.parentElement;
      }
      return node ? window.getComputedStyle(node).backgroundColor : '';
    });
    console.log('Sub-navigation background color in dark mode:', subNavBg);
    expect(subNavBg).not.toBe('rgb(255, 255, 255)');

    // 9. Test Data Modification & Saving
    const storeNameInput = page.locator('input[placeholder*="Kerod Supermarket" i], input[placeholder*="ሱቅ" i]').first();
    await expect(storeNameInput).toBeVisible();

    const testStoreName = `Gebeya Supermarket ${Date.now()}`;
    await storeNameInput.fill(testStoreName);

    // Click Save Button
    const saveBtn = page.locator('button:has-text("Save Branch Details"), button:has-text("የቅርንጫፍ መረጃ አስቀምጥ")').first();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // 10. Assert Success Toast
    const toast = page.locator('div:has-text("saved successfully"), div:has-text("ተቀምጧል")').first();
    await expect(toast).toBeVisible({ timeout: 5000 });

    // 11. Reload page and assert saved value persists
    await page.reload();
    await page.waitForTimeout(1000);
    const reloadedSettingsBtn = page.locator('nav button:has-text("Settings"), nav button:has-text("ቅንብሮች")').first();
    await expect(reloadedSettingsBtn).toBeVisible();
    await reloadedSettingsBtn.click();

    const reloadedStoreNameInput = page.locator('input[placeholder*="Kerod Supermarket" i], input[placeholder*="ሱቅ" i]').first();
    await expect(reloadedStoreNameInput).toHaveValue(testStoreName);
  });
});
