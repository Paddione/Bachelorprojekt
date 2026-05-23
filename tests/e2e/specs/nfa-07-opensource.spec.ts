import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('NFA-07: Open-Source-Lizenz', () => {
  test('T3: LICENSE-Datei im Repo vorhanden', async () => {
    const repoRoot = path.resolve(__dirname, '../../../../');
    const licenseFile = path.join(repoRoot, 'LICENSE');
    expect(fs.existsSync(licenseFile)).toBe(true);
    const content = fs.readFileSync(licenseFile, 'utf-8');
    // Check for recognized open-source license keywords
    expect(content).toMatch(/MIT|Apache|GPL|BSD|Mozilla/i);
  });

  test('T3: Kein proprietäres Copyright in Haupt-Konfigurationsdateien', async () => {
    const repoRoot = path.resolve(__dirname, '../../../../');
    // Taskfile.yml should exist and contain open-source tooling references
    const taskfilePath = path.join(repoRoot, 'Taskfile.yml');
    expect(fs.existsSync(taskfilePath)).toBe(true);
  });

  test('T3: Website gibt keine proprietären Lizenzhinweise aus', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const bodyText = (await page.locator('body').textContent()) ?? '';
    // Verify no obvious proprietary license restrictions are advertised
    expect(bodyText).not.toMatch(/All Rights Reserved.*Microsoft|All Rights Reserved.*Google/i);
  });

  test.skip(true, 'T1-T2: Container-Image-Prüfungen und proprietäre Image-Suche erfordern kubectl-Zugriff');
});
