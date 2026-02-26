import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron, expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainEntry = path.resolve(__dirname, '..', 'app', 'renderer', 'dist-electron', 'index.js');

test.describe('Strata desktop MVP', () => {
  test.skip(!process.env.E2E_ELECTRON, 'Set E2E_ELECTRON=1 after building desktop bundles to run Electron e2e tests.');

  test('app launches and shows top bar', async () => {
    const electronApp = await electron.launch({ args: [mainEntry] });
    const window = await electronApp.firstWindow();

    await expect(window.getByRole('heading', { name: 'Strata Dev' })).toBeVisible();

    await electronApp.close();
  });
});
