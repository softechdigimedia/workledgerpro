import { defineConfig } from '@playwright/test';

const backendEnv = {
  NODE_ENV: 'test',
  PORT: '5000',
  CLIENT_URL: 'http://127.0.0.1:5173',
  DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://disabled:disabled@127.0.0.1:5433/workledger_test?schema=public',
  DIRECT_URL: process.env.TEST_DATABASE_URL || 'postgresql://disabled:disabled@127.0.0.1:5433/workledger_test?schema=public',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'local-test-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'local-test-refresh-secret-at-least-32-characters',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: 'http://127.0.0.1:5000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: backendEnv,
    },
    {
      command: 'npm run dev:vite',
      url: 'http://127.0.0.1:5173/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env, E2E_API_TARGET: 'http://127.0.0.1:5000' },
    },
  ],
});
