import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('NFA-09: Statisches DNS (kein DDNS)', () => {
  const repoRoot = path.resolve(__dirname, '../../../../');

  test('T1: Kein DDNS-Updater-Manifest in prod/', async () => {
    // ddns-updater.yaml must NOT exist — static DNS, no dynamic updater
    expect(fs.existsSync(path.join(repoRoot, 'prod', 'ddns-updater.yaml'))).toBe(false);
  });

  test('T2: Wildcard-Zertifikat-Manifest vorhanden', async () => {
    expect(fs.existsSync(path.join(repoRoot, 'prod', 'wildcard-certificate.yaml'))).toBe(true);
  });

  test('T3: ClusterIssuer nutzt ipv64 DNS-01', async () => {
    const issuerPath = path.join(repoRoot, 'prod', 'cluster-issuer.yaml');
    expect(fs.existsSync(issuerPath)).toBe(true);
    const content = fs.readFileSync(issuerPath, 'utf-8');
    expect(content).toContain('ipv64');
  });

  test('T3: cert-manager Konfiguration nutzt DNS-01 Challenge', async () => {
    const issuerPath = path.join(repoRoot, 'prod', 'cluster-issuer.yaml');
    expect(fs.existsSync(issuerPath)).toBe(true);
    const content = fs.readFileSync(issuerPath, 'utf-8');
    expect(content).toMatch(/dns01|dns-01/i);
  });

  test.fixme(true, 'T4: TLS-Zertifikat-Status im Produktionscluster erfordert kubectl-Zugriff — T000480');
});
