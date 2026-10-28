import { defineConfig, devices } from '@playwright/test'

/** Smoke + axe em todas as stories (requer `npm run build-storybook`). */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.sb.ts',
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: { command: 'npx http-server storybook-static -p 6007 -s', url: 'http://localhost:6007', reuseExistingServer: true },
})
