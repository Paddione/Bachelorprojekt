---
title: "db-identity-guard — Implementation Plan"
ticket_id: T015168
domains: [infra, tickets]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# db-identity-guard — Implementation Plan

_Ticket: T015168 · Design: design.md (D1–D4) · Spec-Delta: specs/db-identity-guard.md_

## File Structure

```
migrations/20260824-db-identity-marker.sql        # NEW: tickets.db_identity + Marker-Zeile (idempotent)
scripts/vda/ticket/_ticket-core.sh                # WIRE-IN: Singleton-Assertion + _assert_db_identity im _pgpod
tests/spec/db-guard/db-identity-guard.bats        # RED-Guard, im Stage-Commit enthalten (6 Tests, rot verifiziert)
```

Disjunkte Partials (D1): p1 berührt `migrations/` + `scripts/vda/ticket/_ticket-core.sh`,
p2 nur Tests.

## Partial P1 — p1-impl

- [ ] **P1.1 Migration.** `migrations/20260824-db-identity-marker.sql`, idempotent
      (Lauft über `task db:migrate ENV=mentolder`, tracked in
      `public.factory_schema_migrations`): `CREATE TABLE IF NOT EXISTS tickets.db_identity
      (identity UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())` plus
      INSERT der Konstante `9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00` mit
      `WHERE NOT EXISTS`-Schutz. Rollback-Kommentar oben (DROP TABLE), Muster
      `migrations/20260814-model-registry.sql`.

- [ ] **P1.2 Singleton-Assertion in `_pgpod`.** Statt blindem `head -1`: Podliste sammeln;
      >1 Zeile → Exit 1 mit Fehler, der ALLE Kandidaten (Namen) und die Remediation nennt
      (Ghost-Pod identifizieren/löschen, `kubectl get pod -o wide`). Eine Zeile → wie bisher.
      Die Assertion bleibt unter BATS AKTIV (Stub-Antworten sind einzeilig → trivial grün).

- [ ] **P1.3 Marker-Probe `_assert_db_identity`.** Neue Funktion in `_ticket-core.sh`,
      aufgerufen am Ende von `_pgpod` nach erfolgreicher Auflösung:
      - Prozess-Cache in globaler Var (`_TICKET_DB_IDENTITY_VERIFIED=1`) — Zweitproben frei.
      - Skip unter BATS-Sentinel: dieselbe Bedingung wie der T002224-Block
        (`BATS_TEST_NAME/BATS_VERSION gesetzt && TICKET_TEST_DB_OK != 1`).
      - Hatch: `TICKET_ALLOW_UNVERIFIED_DB=1` → `WARN:`-Zeile auf stderr, Return 0.
      - Sonst `_exec_sql "$pod" … <<< "SELECT identity FROM tickets.db_identity"` (leer/fehler)
        → Exit 1, Fehler nennt wörtlich `task db:migrate ENV=mentolder`.
      - Wert ≠ `${TICKET_DB_IDENTITY_EXPECTED:-9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00}`
        → Exit 1 mit beiden Werten. Konstante als default-belegte Env-Var oben in der Datei.
      - S1-Budget: `_ticket-core.sh` 293/800 (.sh-Limit gates.yaml), +~45 Zeilen → ~340/800.

- [ ] **P1.4 Smoke.** Mit Stub-kubectl (eine Pod-Zeile, Identity-SELECT antwortet korrekt)
      läuft `get --id <irgendein Ticket>` bis zur DB-Antwort durch; mit leerer
      Identity-Antwort bricht es vor dem eigentlichen SQL ab und nennt die Remediation.

## Partial P2 — p2-tests (Tests-Rolle, STRUCT2)

- [ ] **P2.1 Failing-Test-Step (RED).** Die Suite
      `tests/spec/db-guard/db-identity-guard.bats` liegt dem Stage-Commit bei und ist dort
      rot verifiziert (Migration fehlt, Assertion/Probe existieren vor P1 nicht):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-guard/db-identity-guard.bats
# expected: FAIL (red — Migration fehlt, _pgpod wählt bei Mehrfachtreffern blind head -1,
#            Marker-Probe existiert nicht)
```

      Testdesign (Output-Verifikation, T002448-M4; Stub-Muster
      tests/spec/feature-product-linking.bats): Stub-kubectl per PATH voranstellen,
      `_pgpod` direkt via `bash -c 'source …/_ticket-core.sh; …'` fahren.
      1. Singleton: `get pod` antwortet zwei Zeilen → Exit ≠ 0, beide Namen im Output.
      2. Missing-Marker (mit `TICKET_TEST_DB_OK=1`): Identity-SELECT antwortet leer →
         Exit ≠ 0, Output enthält `db:migrate`.
      3. Mismatch (mit `TICKET_TEST_DB_OK=1`): Identity-SELECT antwortet mit Fremd-UUID →
         Exit ≠ 0, Output enthält beide Werte.
      4. Hatch: wie 2., aber `TICKET_ALLOW_UNVERIFIED_DB=1` → Exit 0, Output enthält `WARN`.
      5. Sentinel-Skip: ohne `TICKET_TEST_DB_OK` (Sentinel-Regime) antwortet Identity-SELECT
         leer → Exit 0 (Probe übersprungen).
      6. Parität: UUID-Literal aus Migrationsdatei == Literal aus `_ticket-core.sh`
         (Querschnittstest, grep ist hier das richtige Mittel).

- [ ] **P2.2 GREEN-Nachweis.** Nach P1 müssen alle 6 Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-guard/db-identity-guard.bats
```

- [ ] **P2.3 Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

      Deploy-Notiz an den Operator (Merge-Kommentar): NACH dem Merge und VOR dem ersten
      Ticket-Write `task db:migrate ENV=mentolder` gegen die SSOT fahren — bis dahin
      bricht jeder Write laut mit Migrations-Remediation ab (bewusst, D4).
