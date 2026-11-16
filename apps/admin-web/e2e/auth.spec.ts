import { test, expect } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@enterprise.com';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'WorkLedger-E2E-Password-Change-Me!';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(adminEmail);
  await page.locator('input[type="password"]').fill(adminPassword);
  await page.getByRole('button', { name: /sign in to operations portal/i }).click();
}

test('backend health endpoint is reachable through the Vite proxy', async ({ request }) => {
  const response = await request.get('/api/v1/health');
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).success).toBe(true);
});

test('invalid credentials show an authentication error', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('not-a-real-user@example.test');
  await page.locator('input[type="password"]').fill('incorrect-password');
  await page.getByRole('button', { name: /sign in to operations portal/i }).click();
  await expect(page.getByText('Authentication Failure')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('super admin can sign in and reach the protected dashboard', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/super-admin\/overview/);
  await expect(page.locator('body')).not.toContainText('Authentication Failure');
});

test('authenticated session is restored after a browser reload', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/super-admin\/overview/);
  await page.reload();
  await expect(page).toHaveURL(/\/super-admin\/overview/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('auth_token'))).not.toBeNull();
});

test('sign out clears browser authentication and returns to login', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/super-admin\/overview/);
  // The header contains the profile menu trigger. Open it, then choose Sign Out.
  await page.getByRole('button', { name: 'Open user menu' }).click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
});
