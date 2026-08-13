# Proposal: purge-test-data-bats-T003285

## Why

`tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats` ist auf `main` rot:
Test 1 (Positiv-Anker) grün, Test 2 schlägt in Zeile 88 (`[ "$status" -eq 0 ]' failed`) fehl.
Der Positiv-Anker belegt, dass die Datenbank erreichbar ist und der Sät-Teil funktioniert —
der Fehler liegt also im Teardown-Pfad `purge_factory_test_data()` → `tickets.fn_purge_test_data()`.

### Verifizierte Ursache (T002448-M5 — Symptom von Hypothese getrennt, beide belegt)

1. **Die lokale k3d-Dev-DB läuft `tickets.fn_purge_test_data()` in v6, nicht in v8.**
   `obj_description` liefert „v6 (2026-07-08, T001638)"; der Funktionskörper hat keinen
   `to_regclass`-Guard um den ersten Schritt (`UPDATE questionnaire_test_status`), die Tabelle
   existiert lokal nicht → die Funktion bricht vor allen Sweep-Schritten ab → Exit ≠ 0.
2. **Der gemergte Fix v8 (`scripts/one-shot/purge-fn-v8.sql`, T002894/PR #3977) ist auf keiner
   der beiden erreichbaren DBs deployed.** Der Laufzeit-Drift-Guard (`scripts/runtime-drift-check.sh`,
   T003825) meldet heute für die lokale k3d-Dev-DB **und** für Fleet mentolder (Prod!) denselben
   Befund: `DB-Funktion tickets.fn_purge_test_data traegt Marker 'to_regclass' nicht`. Die in
   T002894 geplante post-merge-Anwendung auf Fleet ist offenbar nie erfolgt.
3. **Der Drift-Guard ist an kein Taskfile-Target und keine CI-Job angebunden**
   (`grep -n runtime-drift Taskfile.yml .github/workflows/ci.yml` = 0 Treffer) — der Befund kann
   nur manuell entstehen und wird nirgends automatisch sichtbar.
4. **CI führt diesen Test nie wirklich aus (T002922 bestätigt):** der Spec-Shard-Job
   (`test-factory-shard`) läuft ohne Cluster; `_skip_if_no_db` macht den Test zu einem `ok`-Skip.
   Die volle Spec-Suite (nightly `task test:spec`) enthält ihn ebenfalls nur als Skip. Ein auf
   `main` roter Test konnte deshalb unentdeckt bleiben.
5. **Installationspfad der Funktion ist rein manuell:** nichts im reproduzierbaren Bootstrap
   (Schema-ConfigMap, Init-Skripte, Seed-Jobs) legt `fn_purge_test_data` an; ein Cluster-Reset
   oder DB-Restore regrediert auf eine alte Version (hier: v6), bis jemand die One-Shot-Datei
   erneut manuell einspielt. Genau das ist zwischen dem grünen T002894-Verifikationslauf
   (2026-08-09) und heute passiert.

### Offene Frage des Tickets — beantwortet

„Läuft CI diesen Test überhaupt?" — **Nein, nicht ausführbar:** CI hat keinen Cluster; der Test
skippt dort per Design (T002182-Muster). Die CI-registrierbare Seite ist der Drift-Kontrakt
(offline prüfbar), nicht der Cluster-Test selbst. Beide Fälle des Tickets (Funktion fixen,
CI-Registrierung) werden im Plan abgedeckt.

## What

1. **Funktion sofort fixen (RED→GREEN-Beleg):** `scripts/one-shot/purge-fn-v8.sql` auf die lokale
   k3d-Dev-DB und auf Fleet `workspace` anwenden (idempotent, `CREATE OR REPLACE FUNCTION`).
   Danach läuft der BATS-Test grün.
2. **Dauerhaft selbstheilend:** `purge_factory_test_data()` in `tests/lib/factory-test-fixtures.sh`
   stellt vor dem Purge sicher, dass die Repo-Version der Funktion (neueste `purge-fn-v*.sql`)
   deployed ist (Marker-Probe wie `runtime-drift-check.sh`, bedingtes Einspielen). Damit ist der
   Test unabhängig vom manuellen Deploy-Zustand der DB — die Regression dieses Tickets kann nicht
   wiederkehren.
3. **Drift sichtbar machen:** `scripts/runtime-drift-check.sh` in `task test:changed` einbinden
   (CI-safe: skip ohne Cluster; lokal Exit 1 bei Drift) und dessen Pod-Selektor auf
   `app in (shared-db,shared-db-dev)` korrigieren (identisch zur Fixture-Auflösung; der
   Einzel-Label-Selektor `app=shared-db` verfehlt Varianten).
4. **CI-Registrierung des Drift-Kontrakts:** `tests/unit/purge-fn-gaps.bats` um die Assertion
   erweitern, dass die neueste `purge-fn-v*.sql` die `RUNTIME-CHECK:`-Markierungszeile trägt —
   damit zukünftige Funktions-Bumps den Marker (und damit die Drift-Erkennbarkeit) nicht still
   verlieren. Dieser Guard läuft offline in CI (`test-bats`-Job).

_Ticket: T003285_
