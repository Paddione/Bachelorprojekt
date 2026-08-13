---
title: "purge-test-data-bats-T003285 — Implementation Plan"
ticket_id: T003285
domains: [testing, scripts, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# purge-test-data-bats-T003285 — Implementation Plan

_Ticket: T003285_

Root cause and evidence: `openspec/changes/purge-test-data-bats-T003285/design.md` (verifiziert
am 2026-08-13). Kurzfassung: Der Test ist rot, weil die lokale k3d-Dev-DB (und auch Fleet
mentolder) `tickets.fn_purge_test_data()` in **v6** laufen — der gemergte Guard-Fix v8
(T002894) wurde nie auf die DBs gespielt (einzig manueller One-Shot-Installationspfad, kein
reproduzierbarer Bootstrap). Der Laufzeit-Drift-Guard (T003825) erkennt den Befund, ist aber an
kein Taskfile-/CI-Target angebunden; CI führt den Cluster-Test nie wirklich aus (T002922:
`_skip_if_no_db` → `ok`-Skip).

## File Structure

| Datei | Ist | Budget (S1) |
|---|---|---|
| `tests/lib/factory-test-fixtures.sh` | 67 | 733 (Limit .sh 800, nicht-baselined) |
| `scripts/runtime-drift-check.sh` | 159 | 641 (Limit .sh 800, nicht-baselined) |
| `Taskfile.yml` | 5338 | kein S1-Gate (.yml) |
| `tests/unit/purge-fn-gaps.bats` | 72 | kein S1-Gate (.bats) |
| `tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats` | 93 | unverändert (roter Vertrag, auf main) |
| `website/src/data/test-inventory.json` | regeneriert | regeneriert (`task test:inventory`) |

## Tasks

### Task 1: RED reproduzieren, v8 auf die lokale Dev-DB und Fleet einspielen (Sofort-Fix)

**Step 1.1 — Failing-Test-Step (RED, bereits auf main vorhanden, hier reproduziert):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats
# expected: FAIL — Test 2 ("fn_purge_test_data() raeumt die Zeile ab, obwohl
# questionnaire_test_status lokal fehlt") bricht in Zeile 88 (`[ "$status" -eq 0 ]' failed),
# weil die lokale shared-db die Funktion in v6 ohne to_regclass-Guard laeuft. Test 1
# (Positiv-Anker) bleibt gruen — DB erreichbar, Schema traegt den Saet-Teil.
```

**Step 1.2 — v8 auf die lokale k3d-Dev-DB anwenden (idempotent, `CREATE OR REPLACE FUNCTION`):**

```bash
POD=$(kubectl get pod -n workspace --context k3d-mentolder-dev \
  -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$POD" -n workspace --context k3d-mentolder-dev -c postgres -- \
  psql -U postgres -d website < scripts/one-shot/purge-fn-v8.sql
```

**Step 1.3 — Re-Run (GREEN):** Task 1.1 wiederholen → beide Tests grün.

**Step 1.4 — Fleet `workspace` nachziehen (operativ, Prod):** Die in T002894 geplante
post-merge-Anwendung auf Fleet ist nachweislich nie erfolgt (Drift-Guard: v6 dort). Dasselbe
Einspielen gegen den Fleet-Pod:

```bash
POD=$(kubectl get pod -n workspace --context fleet \
  -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$POD" -n workspace --context fleet -c postgres -- \
  psql -U postgres -d website < scripts/one-shot/purge-fn-v8.sql
```

Fleet korczewski braucht keinen separaten Apply: beide Brands teilen die `workspace`-DB
(T002689). Dieser Schritt ist ein manueller DB-Write, kein CI-Schritt — im PR-Body erwähnen.

### Task 2: Selbstheilung des Purge-Pfads in der Fixture (dauerhafter Fix)

`tests/lib/factory-test-fixtures.sh` — neuer Helper + Aufruf in `purge_factory_test_data()`
(nach der Pod-Auflösung, vor dem `SELECT tickets.fn_purge_test_data()`):

1. Neueste Migrationsdatei ermitteln:
   ```bash
   latest="$(ls -1 "$_FIXTURE_REPO_ROOT/scripts/one-shot/"purge-fn-v*.sql | sort -V | tail -1)"
   ```
2. `RUNTIME-CHECK:`-Zeile parsen (Regex identisch zu `scripts/runtime-drift-check.sh`):
   `function=([a-z_]+)\.([a-z_]+)[[:space:]]+marker=([a-z0-9_]+)` — bei fehlender Zeile das
   Einspielen überspringen (Datei ohne Marker ist kein drift-prüfbares Kontrakt-Objekt).
3. Marker-Probe gegen `pg_proc`:
   ```bash
   kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
     psql -U postgres -d website -qtAc \
     "SELECT prosrc LIKE '%${marker}%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace \
      WHERE n.nspname = '${schema}' AND p.proname = '${fn}';"
   ```
   Ausgabe `t` → nichts tun. Sonst:
4. Datei einspielen (Exit ≠ 0 → Helper liefert 1 zurück, Purge schlägt sichtbar fehl):
   ```bash
   kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
     psql -U postgres -d website < "$latest"
   ```

Begründung: Der Teardown-Pfad ist Test-Infrastruktur und soll mit dem Repo-Stand arbeiten, nicht
mit dem zufälligen Deploy-Zustand einer manuell gepflegten DB. Die Fixture läuft nur gegen die
lokale Dev-DB (Prod-Seeds abgelehnt ohne `FACTORY_ALLOW_PROD_SEED`) — kein Prod-Risiko.

**Verifikation (Regressions-Simulation — belegt, dass die Selbstheilung greift und nicht nur der
manuelle Apply aus Task 1):**

```bash
POD=$(kubectl get pod -n workspace --context k3d-mentolder-dev \
  -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$POD" -n workspace --context k3d-mentolder-dev -c postgres -- \
  psql -U postgres -d website < scripts/one-shot/purge-fn-v6.sql   # Regression erzeugen

tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats
# expected: beide Tests gruen — die Fixture hat die neueste Datei (v8) selbst eingespielt
```

### Task 3: Drift-Check sichtbar machen — Selektor korrigieren + in `test:changed` einbinden

**Step 3.1 — `scripts/runtime-drift-check.sh` (`_db_pod`):** Pod-Selektor von
`-l app=shared-db` auf `-l 'app in (shared-db,shared-db-dev)'` ändern — identisch zur
Fixture-Auflösung (`tests/lib/factory-test-fixtures.sh`), damit Label-Varianten nicht verfehlt
werden.

**Step 3.2 — `Taskfile.yml` (`test:changed`):** Vor den BATS-Läufen (Anker: die Zeile
`JOBS=$(nproc 2>/dev/null || echo 2)`) den Drift-Check einfügen:

```bash
echo "→ runtime drift check (skips without cluster)"
bash scripts/runtime-drift-check.sh
```

Kein `|| true`: Drift (Exit 1) soll den lokalen Testlauf hart rot färben. Ohne Cluster skippt
das Skript selbst (exit 0) — CI-safe.

**Verifikation:**

```bash
bash scripts/runtime-drift-check.sh
# expected: exit 0 — nach Task 1 traegt die lokale Funktion den Marker 'to_regclass'
# (Vorher-Zustand am 2026-08-13 belegt: exit 1 mit
# "DRIFT: DB-Funktion tickets.fn_purge_test_data traegt Marker 'to_regclass' nicht")
```

### Task 4: Marker-Kontrakt-Guard in `tests/unit/purge-fn-gaps.bats` (CI-registrierbar)

Neuer `@test`-Block `gap4` (bestehende Datei erweitern, keine neue Datei):

```bats
@test "gap4: latest purge-fn migration carries the RUNTIME-CHECK marker matching its function" {
  local latest
  latest=$(ls -1 "$PROJECT_DIR/scripts/one-shot/"purge-fn-v*.sql 2>/dev/null | sort -V | tail -1)
  [ -n "$latest" ] || fail "no purge-fn-v*.sql found"
  local marker fn_line fn
  marker=$(grep -m1 -- '-- RUNTIME-CHECK:' "$latest") || fail "no RUNTIME-CHECK marker in $latest"
  fn_line=$(grep -m1 'CREATE OR REPLACE FUNCTION' "$latest") || fail "no CREATE OR REPLACE FUNCTION in $latest"
  fn=$(printf '%s' "$fn_line" | sed -E 's/.*FUNCTION ([a-z_]+)\.([a-z_]+).*/\1.\2/')
  grep -q "function=${fn} " <<<"$marker"
}
```

Im Datei-Header den PRUEFMODUS ergänzen: statischer Kontrakt-Grep auf die neueste
`purge-fn-v*.sql` — Querschnittskonvention, deren Ergebnis sich im Quelltext manifestiert
(T002448-M4-Ausnahme; derselbe Modus wie die bestehenden gap1–gap3-Tests dieser Datei).

**Verifikation:**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/purge-fn-gaps.bats
# expected: alle Tests gruen (inkl. gap4) — v8 traegt die Markierung
```

Dieser Guard läuft offline im CI-`test-bats`-Job (kein Cluster nötig) und sichert den
Marker-Mechanismus aus T003825 gegen stillen Verlust bei künftigen Funktions-Bumps.

### Task 5: Test-Inventar regenerieren

```bash
task test:inventory
git status --porcelain website/src/data/test-inventory.json   # expect: geaendert (neuer gap4-Test)
```

`website/src/data/test-inventory.json` mitcommitten — CI-Inventar-Check failt sonst.

### Task 6: Finale Verifikation

```bash
task test:changed            # inkl. neu angebundenem Drift-Check (exit 0) + geaenderte Spec-Tests
task freshness:regenerate    # generierte Artefakte (test-inventory, repo-index, …)
task freshness:check         # CI-Äquivalent: S1–S4-Ratchet + Baseline-Assertion
bash scripts/openspec.sh validate   # OpenSpec-Delta gegen SSOT validieren
```

## Out of Scope

- Schema-Drift-Migration für die `questionnaire_test_*`-Tabellen unter `migrations/` — bleibt
  das dokumentierte Folge-Ticket aus T002894 (nach T002647-Stabilisierung).
- Änderungen an `tickets.fn_purge_test_data()` selbst — v8 ist gemergt und korrekt; der Defekt
  liegt in Deployment/Erkennbarkeit, nicht in der Funktion.
- k3d-Bootstrap-Umbau zur reproduzierbaren Funktionseinspielung (`k3d/shared-db.yaml`) — größerer
  infra-Scope; die Selbstheilung (Task 2) deckt den praktischen Pfad ab.
- CI-Ausführbarkeit des Cluster-Tests selbst — Skip-by-Design (T002182/T002922), kein
  k3d-Setup im CI geplant.
