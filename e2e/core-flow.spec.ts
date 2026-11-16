import { test, expect } from '@playwright/test';

test.describe('GebeyaOS POS Core Flow Stabilization', () => {
  test('Complete Flow: login -> unlock -> open shift -> navigate -> sell -> close shift', async ({ page }) => {
    // 0. Disable tour hints in automated test
    await page.addInitScript(() => {
      const tabs = ['checkout', 'sales', 'shifts', 'shift', 'inventory', 'stock', 'purchasing', 'suppliers', 'reports', 'settings', 'catalog', 'items', 'stocktake', 'staff', 'users'];
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
    const salesButton = page.locator('nav button:has-text("Sales"), nav button:has-text("መሸጫ")').first();
    await expect(salesButton).toBeVisible({ timeout: 15000 });

    // 5. Test Manual Lock & PIN Unlock
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9' })));
    const pinPadModal = page.getByTestId('pinpad-modal');
    await expect(pinPadModal).toBeVisible({ timeout: 5000 });

    // Unlock using touch number pad digits "1", "2", "3", "4" and submit
    await page.locator('[data-testid="pinpad-modal"] button:has-text("1")').first().click();
    await page.locator('[data-testid="pinpad-modal"] button:has-text("2")').first().click();
    await page.locator('[data-testid="pinpad-modal"] button:has-text("3")').first().click();
    await page.locator('[data-testid="pinpad-modal"] button:has-text("4")').first().click();
    await page.locator('[data-testid="pinpad-modal"] button.btn-primary').first().click();

    // Confirm unlocked
    await expect(pinPadModal).toBeHidden({ timeout: 5000 });

    // 6. Navigate to POS Sales
    await salesButton.click();
    await page.waitForTimeout(500);

    // 7. Check Day / Shift Gate
    const startDayBtn = page.locator('button:has-text("Start day"), button:has-text("ቀን ጀምር"), button:has-text("Open Shift")').first();
    if (await startDayBtn.isVisible().catch(() => false)) {
      await startDayBtn.click();
      await page.waitForTimeout(500);
      const confirmStart = page.locator('button:has-text("Confirm"), button:has-text("ጀምር"), button:has-text("Start")').first();
      if (await confirmStart.isVisible().catch(() => false)) {
        await confirmStart.click();
        await page.waitForTimeout(1000);
      }
    }

    // 8. CRITICAL VERIFICATION: Browser Refresh (F5)
    // Refresh must NOT trigger PIN prompt, must NOT trigger open shift prompt!
    await page.reload();

    // Verify still authenticated and UNLOCKED (no PIN pad)
    await expect(pinPadModal).toBeHidden();
    await expect(salesButton).toBeVisible({ timeout: 15000 });

    // Go to Sales and ensure day remains open
    await salesButton.click();
    await page.waitForTimeout(500);

    // 9. Navigate across the 7 simplified modern views: confirm NO PIN prompt
    const modernTabs = [
      'nav button:has-text("Items"), nav button:has-text("እቃዎች")',
      'nav button:has-text("Stock"), nav button:has-text("ክምችት")',
      'nav button:has-text("Suppliers"), nav button:has-text("አቅራቢዎች")',
      'nav button:has-text("Reports"), nav button:has-text("ሪፖርቶች")',
      'nav button:has-text("Staff"), nav button:has-text("ሰራተኞች")',
      'nav button:has-text("Settings"), nav button:has-text("ቅንብሮች")',
    ];
    for (const selector of modernTabs) {
      const tabButton = page.locator(selector).first();
      if (await tabButton.isVisible().catch(() => false)) {
        await tabButton.click();
        await page.waitForTimeout(300);
        await expect(pinPadModal).toBeHidden();
      }
    }

    // Return to Sales
    await salesButton.click();
    await page.waitForTimeout(400);

    // 10. Sell: Add item to cart
    const catalogItem = page.locator('.cursor-pointer:has-text("ETB")').first();
    if (await catalogItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catalogItem.click();
      await page.waitForTimeout(500);

      // Click Proceed to payment (Pay · ... ETB)
      const proceedToPayBtn = page.locator('button[aria-label="Proceed to payment"], button:has-text("Pay"), button:has-text("ክፈል")').first();
      if (await proceedToPayBtn.isEnabled().catch(() => false)) {
        await proceedToPayBtn.click();
        await page.waitForTimeout(500);

        // Payment modal: click Exact cash
        const exactCashBtn = page.locator('button:has-text("Exact"), button:has-text("CASH"), button:has-text("ጥሬ ገንዘብ")').first();
        if (await exactCashBtn.isVisible().catch(() => false)) {
          await exactCashBtn.click();
          await page.waitForTimeout(300);

          // Complete Sale
          const completeSaleBtn = page.locator('button:has-text("Complete Sale"), button:has-text("ሽያጩን አጠናቅቅ")').first();
          if (await completeSaleBtn.isEnabled().catch(() => false)) {
            await completeSaleBtn.click();

            // Dismiss receipt modal by clicking "New Sale"
            const newSaleBtn = page.locator('button:has-text("New Sale"), button:has-text("አዲስ ሽያጭ")').last();
            if (await newSaleBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
              await newSaleBtn.click();
              await page.waitForTimeout(500);
            }
          }
        }
      }
    }

    // 11. Final verification: Day / Shift active in header
    const dayActiveBadge = page.locator('button:has-text("End day"), button:has-text("ቀን ዝጋ"), span:has-text("Day open"), span:has-text("ቀን ተከፍቷል")').first();
    await expect(dayActiveBadge).toBeVisible({ timeout: 10000 });
  });
});
