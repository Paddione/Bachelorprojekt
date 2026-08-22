import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('NFA-07: Open-Source-Lizenz', () => {
  // T013329 F4/D3: Die Repo-Datei-Asserts (LICENSE, Taskfile) sind entfernt —
  // sie lösten den Repo-Root neben das Repository auf und prüften den
  // Repositoriums-Zustand statt der laufenden Anwendung. Die Existenz von
  // LICENSE/Taskfile deckt der Kustomize-Strukturtest in `task test:all` ab.
  test('T3: Website gibt keine proprietären Lizenzhinweise aus', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const bodyText = (await page.locator('body').textContent()) ?? '';
    // Verify no obvious proprietary license restrictions are advertised
    expect(bodyText).not.toMatch(/All Rights Reserved.*Microsoft|All Rights Reserved.*Google/i);
  });
});
