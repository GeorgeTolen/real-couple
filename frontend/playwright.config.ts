import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:8001',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    channel: process.env.E2E_CHANNEL ?? 'msedge',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: 'http://127.0.0.1:8001/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
