import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    timezoneId: 'Asia/Dhaka',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: JSON.parse(process.env.PW_CHROMIUM_ARGS || '[]') } : {},
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node ../scripts/serve-pages.mjs',
    url: 'http://127.0.0.1:4173/Rajshahi_tour_-_travels/pro/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
