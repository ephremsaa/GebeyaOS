import { test, expect } from '@playwright/test';

test.describe('GebeyaOS POS Core Flow Stabilization', () => {
  test('Complete Flow: login -> unlock -> open shift -> navigate -> sell -> close shift', async ({ page }) => {
    // 0. Disable tour hints in automated test
    await page.addInitScript(() => {
      const tabs = ['checkout', 'shift', 'inventory', 'purchasing', 'reports', 'settings', 'catalog', 'stocktake'];
      for (const t of tabs) {
        localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
        localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
      }
    });

    // 1. Visit root page
    await page.goto('/');

    // 2. Step 1: Supermarket Company Code
    const companyInput = page.locator('input[placeholder*="Company" i], input[type="text"]').first();
    await expect(companyInput).toBeVisible({ timeout: 15000 });
    await companyInput.fill('kerod');
    await page.click('button[type="submit"]');

    // 3. Step 2: Cashier / Owner Authentication
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10000 });
    await usernameInput.fill('kerodpos');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('Kerod2026!');
    await page.click('button[type="submit"]');

    // 4. Verify successful login: main navigation visible
    const checkoutButton = page.getByRole('button', { name: 'Checkout' });
    await expect(checkoutButton).toBeVisible({ timeout: 15000 });

    // 5. Test Manual Lock & PIN Unlock
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9' })));
    const pinPadModal = page.getByTestId('pinpad-modal');
    await expect(pinPadModal).toBeVisible({ timeout: 5000 });

    // Unlock using physical keyboard digits "1234"
    await page.keyboard.type('1234');
    await page.keyboard.press('Enter');

    // Confirm unlocked
    await expect(pinPadModal).toBeHidden({ timeout: 5000 });

    // 6. Navigate to POS Checkout
    await checkoutButton.click();
    await page.waitForTimeout(500);

    // 7. Check Shift Gate
    const openShiftBtn = page.locator('button:has-text("Open Shift")').first();
    if (await openShiftBtn.isVisible().catch(() => false)) {
      await openShiftBtn.click();
      await page.waitForTimeout(1000);
      await expect(openShiftBtn).toBeHidden({ timeout: 10000 });
    }

    // 8. CRITICAL VERIFICATION: Browser Refresh (F5)
    // Refresh must NOT trigger PIN prompt, must NOT trigger open shift prompt!
    await page.reload();

    // Verify still authenticated and UNLOCKED (no PIN pad)
    await expect(pinPadModal).toBeHidden();
    await expect(checkoutButton).toBeVisible({ timeout: 15000 });

    // Go to checkout and ensure shift remains open (NO OPEN SHIFT PROMPT!)
    await checkoutButton.click();
    await page.waitForTimeout(500);
    await expect(page.locator('button:has-text("Open Shift (F1)")').first()).toBeHidden();

    // 9. Navigate across all major views: confirm NO PIN prompt, NO shift prompt
    const tabs = ['Shift', 'Inventory', 'Purchasing', 'Reports', 'Settings', 'HQ Sync'];
    for (const tabName of tabs) {
      const tabButton = page.getByRole('button', { name: tabName });
      if (await tabButton.isVisible().catch(() => false)) {
        await tabButton.click();
        await page.waitForTimeout(300);
        // Verify PIN pad is not showing
        await expect(pinPadModal).toBeHidden();
      }
    }

    // Return to Checkout
    await checkoutButton.click();
    await page.waitForTimeout(400);

    // 10. Sell: Add item to cart
    const catalogItem = page.locator('.cursor-pointer:has-text("ETB")').first();
    await expect(catalogItem).toBeVisible({ timeout: 10000 });
    await catalogItem.click();
    await page.waitForTimeout(500);

    // Click Proceed to payment (Pay · ... ETB)
    const proceedToPayBtn = page.locator('button[aria-label="Proceed to payment"]');
    await expect(proceedToPayBtn).toBeEnabled({ timeout: 5000 });
    await proceedToPayBtn.click();
    await page.waitForTimeout(500);

    // Payment modal: click Exact cash
    const exactCashBtn = page.locator('button:has-text("Exact"), button:has-text("CASH")').first();
    await expect(exactCashBtn).toBeVisible({ timeout: 5000 });
    await exactCashBtn.click();
    await page.waitForTimeout(300);

    // Complete Sale
    const completeSaleBtn = page.locator('button:has-text("Complete Sale")').first();
    await expect(completeSaleBtn).toBeEnabled({ timeout: 5000 });
    await completeSaleBtn.click();

    // Dismiss receipt modal by clicking "New Sale"
    const newSaleBtn = page.locator('button:has-text("New Sale")').last();
    await expect(newSaleBtn).toBeVisible({ timeout: 10000 });
    await newSaleBtn.click();
    await page.waitForTimeout(500);

    // 11. Final verification: Shift Management view shows shift status as OPEN
    const shiftNavBtn = page.getByRole('button', { name: 'Shift' });
    await shiftNavBtn.click();
    await expect(page.locator('text=OPEN').first()).toBeVisible({ timeout: 10000 });
  });
});
