import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('AK-04: Prototyp-Betrieb', () => {
  const repoRoot = path.resolve(__dirname, '../../../../');

  test('T1: k3d-Konfiguration im Repo vorhanden', async () => {
    expect(fs.existsSync(path.join(repoRoot, 'k3d-config.yaml'))).toBe(true);
  });

  test('T1: Taskfile.yml im Repo vorhanden', async () => {
    expect(fs.existsSync(path.join(repoRoot, 'Taskfile.yml'))).toBe(true);
  });

  test('T1: workspace:up in Taskfile definiert', async () => {
    const taskfilePath = path.join(repoRoot, 'Taskfile.yml');
    const taskfile = fs.readFileSync(taskfilePath, 'utf-8');
    expect(taskfile).toMatch(/workspace:up|workspace:deploy/);
  });

  test('T2: scripts/setup.sh existiert und ist ausführbar (falls vorhanden)', async () => {
    const setupScript = path.join(repoRoot, 'scripts', 'setup.sh');
    if (fs.existsSync(setupScript)) {
      const stat = fs.statSync(setupScript);
      // Check executable bit (mode & 0o111)
      expect(stat.mode & 0o111).toBeTruthy();
    } else {
      // setup.sh may not exist — log and pass (not all repos have this)
      console.log('scripts/setup.sh not found — skipping executable check (informational)');
      expect(true).toBe(true);
    }
  });

  test('T2: scripts/-Verzeichnis enthält Betriebsskripte', async () => {
    const scriptsDir = path.join(repoRoot, 'scripts');
    expect(fs.existsSync(scriptsDir)).toBe(true);
    const scripts = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.sh'));
    expect(scripts.length).toBeGreaterThan(0);
  });

  test('T5a: DSGVO — Website lädt keine Google Fonts', async ({ page }) => {
    const gFontRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        gFontRequests.push(url);
      }
    });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    expect(gFontRequests).toHaveLength(0);
  });

  test('T5b: DSGVO — Website lädt keine externen Analytics-Scripts', async ({ page }) => {
    const trackerRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.net') ||
        url.includes('hotjar') ||
        url.includes('mixpanel')
      ) {
        trackerRequests.push(url);
      }
    });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    expect(trackerRequests).toHaveLength(0);
  });

  test.skip(true, 'T3-T4: kubectl-Operationen und vollständiger Setup-von-null erfordern Cluster-Zugriff und mehrere Stunden');
});
