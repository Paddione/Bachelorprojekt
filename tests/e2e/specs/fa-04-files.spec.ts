import { test, expect } from '@playwright/test';
import { goToChannel } from './helpers';
import path from 'path';
import fs from 'fs';
import os from 'os';

const TEAM = 'bachelorprojekt';

test.describe('FA-04: Dateiablage', () => {
  test('T1: Datei über UI hochladen', async ({ page }) => {
    await goToChannel(page, TEAM, 'test-public');

    const tmpFile = path.join(os.tmpdir(), `e2e-upload-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'E2E test file content');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    await expect(page.locator('.file-preview')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Enter');

    await expect(page.locator('.post-image__column').last()).toBeVisible({
      timeout: 10_000,
    });

    fs.unlinkSync(tmpFile);
  });
});
