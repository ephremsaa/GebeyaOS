/**
 * e2e/sales-day-control.spec.ts
 * Step 2 — Sales page with Start day / End day control
 */
import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.addInitScript(() => {
    const tabs = ['checkout', 'sales', 'shifts', 'shift', 'inventory', 'stock', 'purchasing', 'suppliers', 'reports', 'settings', 'catalog', 'items', 'stocktake', 'staff', 'users'];
    for (const t of tabs) {
      localStorage.setItem(`gebeyaos_hints_dismissed_anon_${t}`, 'true');
      localStorage.setItem(`gebeyaos_hints_dismissed_01a19309-1e78-7e91-a0a7-56edac4beb90_${t}`, 'true');
    }
  });

  await page.goto('/');

  const companyInput = page.locator('input[placeholder*="Company" i], input[placeholder*="KEROD" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await Promise.race([
    companyInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
    passwordInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
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

  await page.waitForTimeout(1500);
}

test.describe('Step 2 – Sales page Start day / End day control', () => {
  test('Sales page displays Day Control Bar in header', async ({ page }) => {
    await login(page);

    // Day Control Bar buttons in Sales header
    const dayControl = page.locator('button:has-text("Start day"), button:has-text("ቀን ጀምር"), button:has-text("End day"), button:has-text("ቀን ዝጋ")');
    await expect(dayControl.first()).toBeVisible({ timeout: 15000 });
  });

  test('Friendly Start Day prompt opens Start Day dialog with opening float input', async ({ page }) => {
    await login(page);

    // If day is not started, start day button is in bar or banner
    const startDayBtn = page.locator('button:has-text("Start day"), button:has-text("ቀን ጀምር")').first();
    if (await startDayBtn.isVisible()) {
      await startDayBtn.click();
      // Should show the Start Day modal with Opening cash input
      await expect(page.locator('text=/Opening cash|የመክፈቻ ብር/i').first()).toBeVisible({ timeout: 5000 });
      // Cancel / Close via X button
      const closeBtn = page.locator('button:has(svg.lucide-x)').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
  });

  test('When day is open, Put cash in safe and End day controls are accessible', async ({ page }) => {
    await login(page);

    const startDayBtn = page.locator('button:has-text("Start day"), button:has-text("ቀን ጀምር")').first();

    if (await startDayBtn.isVisible()) {
      await startDayBtn.click();
      const confirmStart = page.locator('button:has-text("Start day"), button:has-text("ቀን ጀምር")').last();
      await confirmStart.click();
      await page.waitForTimeout(1500);
    }

    // Day open indicator
    await expect(page.locator('text=/Day open since|ቀን ከ/i').first()).toBeVisible({ timeout: 10000 });

    // "Put cash in safe" button
    const safeDropBtn = page.locator('button:has-text("Put cash in safe"), button:has-text("ብርን ወደ ካዝና አስቀምጥ")').first();
    await expect(safeDropBtn).toBeVisible();

    // Click Put cash in safe
    await safeDropBtn.click();
    await expect(page.locator('text=/safe|ካዝና/i').first()).toBeVisible({ timeout: 5000 });

    // Close safe drop modal
    const closeBtn = page.locator('button:has(svg.lucide-x)').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });
});
