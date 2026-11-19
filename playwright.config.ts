import { defineConfig } from '@playwright/test';

// BASE_URL задаётся для проверки опубликованной версии, иначе тесты идут на локальной сборке.
const live = process.env.BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: live ?? 'http://127.0.0.1:4173/race-replay/' },
  webServer: live
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: 'http://127.0.0.1:4173/race-replay/',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
