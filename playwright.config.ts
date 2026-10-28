import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5179', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1500, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1500, height: 900 } } },
  ],
  webServer: { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true },
})
