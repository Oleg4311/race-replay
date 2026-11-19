// Делает скриншот демо для README: исходная гонка на детерминированных часах.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.env.BASE_URL ?? 'http://127.0.0.1:4173/race-replay/';
mkdirSync('docs', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 860, height: 900 }, colorScheme: 'light' });
await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
await page.goto(url);
await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
await page.getByTestId('scenario').click();
await page.clock.runFor(2000);
await page.screenshot({ path: 'docs/screenshot.png', fullPage: true });
await browser.close();
console.log('docs/screenshot.png');
