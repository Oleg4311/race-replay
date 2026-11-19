import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Путь приложения на GitHub Pages: https://oleg4311.github.io/race-replay/
export default defineConfig({
  base: '/race-replay/',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
});
