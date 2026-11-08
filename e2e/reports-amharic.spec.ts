import { test, expect } from '@playwright/test';

test.describe('Reports Page Complete Amharic & English Localization', () => {
  test('Renders 100% Amharic when language is Amharic, switches cleanly to English', async ({ page }) => {
    // 0. Disable tour hints and set language to Amharic
    await page.addInitScript(() => {
      localStorage.setItem('gebeya_lang', 'am');
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

    // 4. Ensure navigation is visible
    const navReportsBtn = page.locator('nav button:has-text("ሪፖርቶች"), nav button:has-text("Reports")').first();
    await expect(navReportsBtn).toBeVisible({ timeout: 15000 });

    // 5. Ensure Amharic is active
    const isAmharic = await page.evaluate(() => document.documentElement.lang === 'am');
    if (!isAmharic) {
      const amBtn = page.locator('button:has-text("አማ")').first();
      if (await amBtn.isVisible()) {
        await amBtn.click();
      }
    }

    // 6. Navigate to Reports
    await navReportsBtn.click();

    // 7. Verify Reports page header in Amharic
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('የፋይናንስ እና የስራ እንቅስቃሴ ሪፖርቶች');

    // 8. Verify Reconciliation ribbon
    const ribbon = page.locator('text=የመዝገብ ሂሳብ ማስታረቂያ ሁኔታ፡').first();
    await expect(ribbon).toBeVisible();

    // 9. Verify KPI cards in Amharic
    await expect(page.locator('text=ጠቅላላ የሽያጭ ገቢ (ብር)').first()).toBeVisible();
    await expect(page.locator('text=15% ተ.እ.ታ (VAT)').first()).toBeVisible();
    await expect(page.locator('text=ጠቅላላ ትርፍ (የዕቃው ወጪ ተቀንሶ)').first()).toBeVisible();
    await expect(page.locator('text=ግብይቶች እና አማካይ ቅርጫት').first()).toBeVisible();

    // 10. Verify Tabs in Amharic
    await expect(page.locator('button:has-text("አጠቃላይ እይታ እና የክፍያ ዘዴዎች")').first()).toBeVisible();
    await expect(page.locator('button:has-text("የሰዓታት እና የምድብ አዝማሚያዎች")').first()).toBeVisible();
    await expect(page.locator('button:has-text("ከፍተኛ ትርፍ ያላቸው ምርቶች")').first()).toBeVisible();
    await expect(page.locator('button:has-text("የተ.እ.ታ ማጠቃለያ (ገቢዎች)")').first()).toBeVisible();
    await expect(page.locator('button:has-text("የክምችት ግምት እና ባቾች")').first()).toBeVisible();
    await expect(page.locator('button:has-text("የገንዘብ ተቀባይ መሳቢያ ኦዲት")').first()).toBeVisible();

    // 11. Switch to English
    const enBtn = page.locator('button:has-text("EN")').first();
    await enBtn.click();

    // 12. Verify English texts
    await expect(heading).toHaveText('Financial & Operational Reports');
    await expect(page.locator('text=Gross Revenue (ETB)').first()).toBeVisible();
    await expect(page.locator('text=Overview & Payment Mix').first()).toBeVisible();
  });
});
