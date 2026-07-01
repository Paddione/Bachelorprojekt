---
title: "pocket-id-client-seed-auth-header — Implementation Plan"
ticket_id: T001355
domains: [infra, auth, ops]
status: active
file_locks: [k3d/pocket-id-client-seed.yaml, tests/spec/pocket-id-client-seed-auth-header.bats, openspec/changes/pocket-id-client-seed-auth-header/]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-client-seed-auth-header — Implementation Plan

**Ticket:** T001355 (korrigiert die Fehldiagnose von T001327)
**Branch:** `fix/pocket-id-seed-timeout-race`
**Worktree:** `/tmp/wt-pocket-id-seed-timeout-race`
**Brainstorm:** `.lavish/pocket-id-seed-timeout-race-brainstorm.html`

## File Structure

**Geändert (1):**
- `k3d/pocket-id-client-seed.yaml` — Auth-Header für Pocket-IDs Admin-API von
  `Authorization: Bearer ${POCKET_ID_API_KEY}` auf `X-API-KEY: ${POCKET_ID_API_KEY}` korrigiert
  (S1: Datei bereits gebaselined, Änderung ist netto ±0 Zeilen an der AUTH-Zeile plus Kommentar —
  siehe Task 1). Kommentarblock oben in der Datei korrigiert (Fehldiagnose entfernt).

**Neu (1):**
- `tests/spec/pocket-id-client-seed-auth-header.bats` — 2 BATS-Tests (Header ist X-API-KEY, kein
  `Authorization: Bearer` mehr vorhanden).

**Nicht geändert (SSOT-Schutz):**
- `k3d/pocket-id.yaml` — Pocket-ID-Deployment selbst, keine Änderung nötig.
- `k3d/pocket-id-client-seed.yaml` Init-Container-Timeout/backoffLimit — bereits durch T001327
  korrekt auf 300/2 gesetzt, hier nicht erneut angefasst.
- `openspec/changes/pocket-id-client-seed-timeout/` — bleibt als historischer (Fehl-)Diagnose-Trail
  unangetastet, nicht Teil dieses Changes.

## Vorgehen

- [ ] **Task 0: Failing-Test ist bereits rot gegen `main` — `tests/spec/pocket-id-client-seed-auth-header.bats` (RED, Step 1)**
  - **Step 1: verify test fails against main's manifest (RED-Sanity, reproduces the bug):**
    ```bash
    git show main:k3d/pocket-id-client-seed.yaml | grep -qE 'AUTH="X-API-KEY: \$\{POCKET_ID_API_KEY\}"'
    ```
    **expected: FAIL** — main enthält noch `AUTH="Authorization: Bearer ${POCKET_ID_API_KEY}"`,
    nicht den korrekten `X-API-KEY`-Header. Live gegen Pocket-ID v2.9.0 verifiziert (T001355,
    2026-07-01): derselbe Key liefert mit `Authorization: Bearer` 401 "You are not signed in",
    mit `X-API-KEY` 200 OK.

- [ ] **Task 1: Fix in `k3d/pocket-id-client-seed.yaml` anwenden (GREEN, Step 2)**
  - Datei: `k3d/pocket-id-client-seed.yaml`.
  - **Schritt 2a:** `AUTH="Authorization: Bearer ${POCKET_ID_API_KEY}"` →
    `AUTH="X-API-KEY: ${POCKET_ID_API_KEY}"` (Zeile mit der `AUTH=`-Zuweisung im `seed`-Container-Command).
  - **Schritt 2b:** Kommentarblock am Dateianfang (Zeilen zum Admin-API-Verhalten) korrigieren —
    die alte Aussage "API key authentication is not allowed for this endpoint" durch die
    verifizierte Ursache (falscher Header-Name) ersetzen, mit Verweis auf T001355 und
    https://pocket-id.org/docs/api.
  - **Schritt 2c:** Kurzer Inline-Kommentar direkt über der `AUTH=`-Zeile, der den Grund für
    `X-API-KEY` statt `Authorization: Bearer` festhält (nicht offensichtlich aus dem Code selbst).

- [ ] **Task 2: GREEN-Sanity — der neue Test ist jetzt grün**
  - **Step 2: run the test, expect PASS (GREEN) after fix is applied:**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-auth-header.bats
    ```
    **expected:** beide Tests `ok`.

- [ ] **Task 3: Final Verification — mandatory CI gates**
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

## Nach dem Merge (nicht Teil dieses PRs)

- Ein produktiver Lauf von `pocket-id-client-seed` für **beide** Brands (korczewski + mentolder)
  muss nach dem Merge zu einem ruhigen Zeitpunkt erfolgen, um alle 16 OIDC-Clients (nicht nur
  `website`) zu reconcilen. Während der Live-Diagnose zu T001355 wurde Pocket-ID durch einen
  `shared-db`-Rollout kurzzeitig instabil (SQLSTATE 57P01, selbst erholt) — ein produktiver
  Seed-Lauf sollte das nicht wiederholen, da er keinen `shared-db`-Rollout auslöst, aber zur
  Sicherheit außerhalb der Hauptnutzungszeit laufen.
- `pocket-id-db-init` Job hat beim Deploy einen "field is immutable"-Fehler geworfen (fehlendes
  Delete-before-apply, analog zu `pocket-id-client-seed`) — separates Ticket nötig, nicht Teil
  dieses Fixes.
- Eine IngressRoute mit `.spec.forwardedHeaders` schlug beim Deploy mit "field not declared in
  schema" fehl (Traefik-CRD-Schema-Drift) — separates Ticket nötig, nicht Teil dieses Fixes.
- Kein Renewal-Mechanismus für Pocket-ID API-Keys (`expires_at` ist NOT NULL, kein Auto-Rotate) —
  falls gewünscht, eigenes Ticket/Change für Monitoring/Alerting auf Job-Failures oder
  Key-Ablauf, damit dieser Drift nicht erneut unbemerkt über Wochen besteht.
