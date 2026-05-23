import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('NFA-08: Produktions-Deployment (Hetzner/k3s)', () => {
  const repoRoot = path.resolve(__dirname, '../../../../');

  test('T1: prod/-Verzeichnis existiert', async () => {
    expect(fs.existsSync(path.join(repoRoot, 'prod'))).toBe(true);
  });

  test('T2: YAML-Dateien in prod/ vorhanden', async () => {
    const prodDir = path.join(repoRoot, 'prod');
    expect(fs.existsSync(prodDir)).toBe(true);
    const yamlFiles = fs.readdirSync(prodDir).filter(
      (f) => f.endsWith('.yaml') || f.endsWith('.yml'),
    );
    expect(yamlFiles.length).toBeGreaterThan(0);
  });

  test('T3: cert-manager Tasks in Taskfile.yml vorhanden', async () => {
    const taskfilePath = path.join(repoRoot, 'Taskfile.yml');
    expect(fs.existsSync(taskfilePath)).toBe(true);
    const taskfile = fs.readFileSync(taskfilePath, 'utf-8');
    expect(taskfile).toContain('cert:');
  });

  test('T2: prod-mentolder/-Overlay existiert', async () => {
    expect(fs.existsSync(path.join(repoRoot, 'prod-mentolder'))).toBe(true);
  });

  test('T2: prod-korczewski/-Overlay existiert', async () => {
    expect(fs.existsSync(path.join(repoRoot, 'prod-korczewski'))).toBe(true);
  });

  test('T2: k3d/-Basis-Manifest-Verzeichnis existiert', async () => {
    expect(fs.existsSync(path.join(repoRoot, 'k3d'))).toBe(true);
    const k3dFiles = fs.readdirSync(path.join(repoRoot, 'k3d')).filter(
      (f) => f.endsWith('.yaml') || f.endsWith('.yml'),
    );
    expect(k3dFiles.length).toBeGreaterThan(0);
  });

  test.skip(true, 'T4-T5: Manifest-Validierung (task workspace:validate) und Produktions-Deploy erfordern kubectl/task-Zugriff');
});
