/** On a phone the three screens stack, and nothing scrolls sideways. */
import { test, expect } from '@playwright/test';

test('the screens fit a phone', async ({ page }) => {
  for (const path of ['/', '/setup', '/dashboard']) {
    await page.goto(path);
    await expect(page.getByRole('navigation')).toBeVisible();
    const wider = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(wider, `${path} scrolls sideways`).toBe(false);
  }
});
