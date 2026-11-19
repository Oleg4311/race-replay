import { expect, test, type Page } from '@playwright/test';

// Часы браузера подменены и стоят на паузе, поэтому порядок ответов детерминирован:
// A стартует в 0 мс и отвечает в 1200, B стартует в 100 мс и отвечает в 400.
async function setup(page: Page, mode: 'race' | 'abort' | 'guard') {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('./');
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
  await page.getByTestId(`mode-${mode}`).click();
}

async function playAndSettle(page: Page) {
  await page.getByTestId('scenario').click();
  await page.clock.runFor(2000);
}

const entry = (page: Page, n: number) => page.getByTestId(`entry-${n}`);

test('исходная гонка: поздний A перезаписывает B', async ({ page }) => {
  await setup(page, 'race');
  await playAndSettle(page);

  await expect(page.getByTestId('result')).toHaveText('A');
  await expect(page.getByTestId('result')).toHaveAttribute('data-stale', 'true');
  await expect(page.getByTestId('verdict')).toContainText('Баг');
  // B пришёл первым (400 мс) и был показан, затем затёрт ответом A (1200 мс)
  await expect(entry(page, 2)).toHaveAttribute('data-outcome', 'replaced');
  await expect(entry(page, 2)).toHaveAttribute('data-end', '400');
  await expect(entry(page, 1)).toHaveAttribute('data-outcome', 'shown');
  await expect(entry(page, 1)).toHaveAttribute('data-end', '1200');
});

test('отмена: на экране остаётся B', async ({ page }) => {
  await setup(page, 'abort');
  await playAndSettle(page);

  await expect(page.getByTestId('result')).toHaveText('B');
  await expect(page.getByTestId('result')).toHaveAttribute('data-stale', 'false');
  await expect(page.getByTestId('verdict')).toContainText('Верно');
  await expect(entry(page, 1)).toHaveAttribute('data-outcome', 'aborted');
  await expect(entry(page, 1)).toHaveAttribute('data-end', '100'); // отменён в момент выбора B
  await expect(entry(page, 2)).toHaveAttribute('data-outcome', 'shown');
});

test('проверка актуальности: на экране остаётся B', async ({ page }) => {
  await setup(page, 'guard');
  await playAndSettle(page);

  await expect(page.getByTestId('result')).toHaveText('B');
  await expect(page.getByTestId('result')).toHaveAttribute('data-stale', 'false');
  await expect(entry(page, 1)).toHaveAttribute('data-outcome', 'ignored');
  await expect(entry(page, 1)).toHaveAttribute('data-end', '1200'); // ответ пришёл, но отброшен
  await expect(entry(page, 2)).toHaveAttribute('data-outcome', 'shown');
  await expect(entry(page, 2)).toHaveAttribute('data-end', '400');
});

test('смена режима и сброс очищают таймлайн', async ({ page }) => {
  await setup(page, 'race');
  await playAndSettle(page);
  await expect(page.getByTestId('timeline')).toBeVisible();

  await page.getByTestId('reset').click();
  await expect(page.getByTestId('timeline')).toHaveCount(0);
  await expect(page.getByTestId('result')).toHaveText('—');

  await page.getByTestId('scenario').click();
  await page.getByTestId('mode-guard').click(); // смена режима во время полёта
  await expect(page.getByTestId('timeline')).toHaveCount(0);
  await page.clock.runFor(2000);
  await expect(page.getByTestId('result')).toHaveText('—'); // ответы старого движка не просочились
});
