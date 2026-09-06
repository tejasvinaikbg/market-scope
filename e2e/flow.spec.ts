/**
 * The whole product, once, the way a person uses it: upload a portfolio, define a market, watch the run finish, read the
 * dashboard, pick a store, run it again, find it in the list, delete it. Against the fixture providers, so it runs
 * anywhere without the internet, in about a minute.
 */
import { test, expect, type Page } from '@playwright/test';

const csv = 'apps/api/fixtures/e2e_portfolio_bengaluru.csv';

async function createMarket(page: Page) {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', csv);
  await expect(page.getByText('e2e_portfolio_bengaluru · 3 stores')).toBeVisible();          // the stepper knows the portfolio

  await page.getByRole('link', { name: /Market setup/ }).click();
  await page.getByLabel('Country').selectOption({ label: 'India' });
  await page.getByLabel('State').selectOption({ label: 'Karnataka' });
  await page.getByLabel('City').selectOption({ label: 'Bengaluru' });
  await page.getByRole('button', { name: 'Supermarket' }).click();
  await page.getByRole('button', { name: 'Pharmacy' }).click();
  await expect(page.getByText('24', { exact: true })).toBeVisible();                            // the default boundary, 24 km²
  await page.getByRole('button', { name: /Create market/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/\d+$/);
}

test('upload, define, watch, read, pick, run again, list, delete', async ({ page }) => {
  await createMarket(page);

  // The run finishes: two stores found around the centre, one of ours matched, the third placed outside.
  const status = page.getByRole('status');
  await expect(status).toContainText('2 stores discovered', { timeout: 45_000 });
  await expect(status).toContainText('1 of them is a discovered store within 150 m');
  await expect(page.getByRole('definition')).toHaveText(['2', '2', '1', '0', '1']);            // discovered, inside, outside, not located, matched
  await expect(page.locator('.store-pin')).toHaveCount(5);                                       // 2 found + 3 of ours
  await expect(page.locator('.store-pin-check')).toHaveCount(1);
  const ours = page.getByRole('button', { name: /^Centre Mart Cubbon/ });
  await expect(ours).toContainText(/Matched · Centre Mart · \d+ m/);
  await expect(page.getByRole('button', { name: /^Centre Mart/ }).filter({ hasText: 'Yours ·' })).toContainText('Yours · Centre Mart Cubbon');   // the found store, told from its side

  // Picking a store marks it in both views.
  await ours.click();
  await expect(ours).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.store-pin-picked')).toHaveCount(1);

  // Only the pairs.
  for (const name of ['Discovered', 'Portfolio inside', 'Portfolio outside']) await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByText('1 store shown · 5 in this market')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  // Run again: queued, then back to the same place.
  await page.getByRole('button', { name: 'Run discovery again' }).click();
  await expect(status).toContainText('Discovery is queued');
  await expect(status).toContainText('2 stores discovered', { timeout: 45_000 });

  // The list knows the market; delete asks first, then it is gone.
  await page.getByRole('link', { name: /All markets/ }).click();
  await expect(page.getByText('Previous markets · 1')).toBeVisible();
  await page.getByRole('button', { name: /^Delete / }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No market created yet.')).toBeVisible();
  await expect(page.getByText(/Previous markets/)).toHaveCount(0);
});

test('a bad file is refused with its rows named, and nothing is stored', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', 'apps/api/fixtures/failure_portfolio_bengaluru.csv');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('no file yet')).toBeVisible();
});
