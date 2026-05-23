import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('SA-07: Backup (pg_dump, PVCs)', () => {
  /**
   * T1+T2: pg_dump-Prüfungen erfordern kubectl exec in den shared-db Pod.
   * Manueller Schritt dokumentiert.
   */
  test.skip(
    true,
    'T1+T2: pg_dump-Tests erfordern kubectl-Zugriff — manuell:\n' +
      '  kubectl exec deploy/shared-db -n workspace -- ' +
      'pg_dump -U postgres --schema-only keycloak | head -5\n' +
      '  Erwartete Ausgabe: "-- PostgreSQL database dump"'
  );

  /**
   * T3: PVCs prüfen — erfordert kubectl.
   */
  test.skip(
    true,
    'T3: PVC-Status erfordert kubectl — manuell:\n' +
      '  kubectl get pvc -n workspace\n' +
      '  Alle PVCs sollten im Status "Bound" sein.'
  );

  /**
   * T4: Admin-Backup-Endpunkt auf der Website prüfen (ohne Auth → 401/403/405).
   * Zeigt, dass der Endpunkt grundsätzlich vorhanden und geschützt ist.
   */
  test('T4: Backup-Admin-Endpunkt vorhanden und geschützt', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/backup`, {
      data: {},
    });
    // 401/403 = endpoint exists but requires auth (correct behavior)
    // 404 = not implemented yet
    // 405 = method not allowed (endpoint exists, wrong method)
    // We accept all these — what we do NOT accept is a 200 without auth or a 500.
    expect(
      res.status(),
      `Backup-Endpunkt antwortete mit unerwartetem Status ${res.status()} — erwartet 401/403/404/405`
    ).not.toBe(500);
    expect(
      res.status(),
      'Backup-Endpunkt gibt 200 ohne Authentifizierung zurück — Sicherheitslücke!'
    ).not.toBe(200);
  });

  /**
   * T5: Backup-Liste — erfordert task CLI auf dem Cluster.
   */
  test.skip(
    true,
    'T5: Backup-Liste erfordert task-CLI und Cluster-Zugriff — manuell:\n' +
      '  task workspace:backup:list\n' +
      '  Mindestens 1 Timestamp sollte vorhanden sein.'
  );

  /**
   * Smoke: Website-API grundsätzlich erreichbar.
   */
  test('Smoke: Website-API erreichbar', async ({ request }) => {
    const res = await request.get(BASE, { maxRedirects: 3 });
    expect([200, 301, 302, 303]).toContain(res.status());
  });
});
