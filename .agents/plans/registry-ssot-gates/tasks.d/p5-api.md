# P5 — API-Endpoint-Register

## Ausgang (verifiziert)

- `docs/agent-guide/registry/api-overlay.yaml:3` (Orphan-Guard existiert),
  `taskfiles/Taskfile.quality.yml:13` (`scripts/sdlc/api-inventory.mjs`),
  `taskfiles/Taskfile.test.yml:518` (`test:api-auth` via `api-auth-check.mjs`).

## Ziel

- [ ] `docs/agent-guide/registry/api.yaml`: Endpoint, Auth-Klasse, Tier, Quelle.
- [ ] `scripts/api-check.mjs`: fail-closed — unklassifizierter/neuer Endpoint
      aus `api-inventory.json` → Exit ≠ 0; baut auf `api-auth-check.mjs` +
      `api-inventory.mjs` auf (nicht ersetzen).
- [ ] `docs/agent-guide/maps/api-map.md`: generiert.
- [ ] Falls `api-inventory.json` de facto SSOT ist: nur Kurations-Felder im
      Overlay, im Plan vermerken.

## Abnahme

- Check grün; Fixture (neuer Endpoint ohne Klassifikation) → rot.
