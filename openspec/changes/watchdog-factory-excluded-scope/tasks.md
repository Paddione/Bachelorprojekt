---
title: "watchdog-factory-excluded-scope — Implementation Plan"
ticket_id: T006364
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# watchdog-factory-excluded-scope — Implementation Plan

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `tests/spec/factory-watchdog/factory-excluded-scope.bats` | vorhanden (RED, im Stage-Commit bereits committet) | 2 Tests; muss am Ende grün sein |
| `scripts/factory/watchdog.sh` | ändern | `_stale_query`: factory_excluded-Gate + Erklärungskommentar |
| `.claude/skills/references/factory-resume-contract.md` | ändern | neuer Abschnitt "Manuelle Übernahme" (Workaround als Vertrag) |
| `openspec/changes/watchdog-factory-excluded-scope/specs/software-factory.md` | vorhanden (MODIFIED-Delta) | Requirement "Watchdog-Eskalation und Zombie-Cleanup" um Scope-Regel + Scenario erweitert; wird beim Archivieren in die SSOT gemerged |
| `openspec/changes/watchdog-factory-excluded-scope/tasks.md` | vorhanden (diese Datei) | Plan-Artefakt |
| `website/src/data/test-inventory.json` | regenerieren | CI-Inventory-Gate (task test:inventory) |

**S1-Budgets:** `scripts/factory/watchdog.sh` Ist 336 Zeilen · nicht baselined
(`jq -r '."S1:scripts/factory/watchdog.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json`
→ `nicht-baselined`) · statisches `.sh`-Limit **800** (`docs/code-quality/gates.yaml` →
`s1.limits`) → effektives Budget **464**. Die Erweiterung der Query um eine
WHERE-Bedingung samt Kommentar (geschätzt ~6–8 Zeilen) bleibt mit erwarteten ~344 Zeilen
Gesamtgröße deutlich unter dem Limit und weit unter der 80 %-Schwelle. `.bats` und `.md`
führen keine Einträge in `s1.limits` — die Testdatei, der Kontrakt und das Spec-Delta sind
nicht S1-gegatet.

**S4 (Orphan-Guard):** `scripts/factory/watchdog.sh` bleibt referenziert: von den
Watchdog-Tests (`tests/spec/factory-watchdog/stale-type-coverage.bats`,
`tests/spec/factory-watchdog/factory-excluded-scope.bats`), aus der SSOT
(`openspec/specs/software-factory.md`, `openspec/specs/factory-watchdog.md`) und aus
`scripts/factory/queue.sh` (Referenz im neuen Kommentar). Kein Orphan.

---

## Partials

### p1 — Watchdog-Stale-Scope + Kontrakt-Doku (Implementierung)

**target_files:** `scripts/factory/watchdog.sh`, `.claude/skills/references/factory-resume-contract.md`

1. `scripts/factory/watchdog.sh`: In `_stale_query` die WHERE-Klausel um
   `AND COALESCE((readiness->>'factory_excluded')::boolean, false) = false` erweitern —
   dasselbe Gate, das `queue.sh` in beiden Dispatch-Lanes anwendet. Einen
   Erklärungskommentar darüber setzen, der den Resume-Livelock benennt (T006364/T005560,
   Fortsetzungs-Kontrakt T002327) und warum branch-scoped Claims bewusst NICHT als
   Fortschritt gewertet werden (hängende Pipelines hinterlassen selbst Claims, T003677).
   Die eine WHERE-Bedingung deckt beide Sweep-Pfade ab (Reset **und** Eskalation): Ein
   ausgeschlossenes Ticket wird weder auf `plan_staged`/`backlog`/`triage` zurückgesetzt
   noch unfactored.
2. `.claude/skills/references/factory-resume-contract.md`: Neuen Abschnitt
   "Manuelle Übernahme" (nach "Der Branch ist anderswo ausgecheckt") einfügen: Wer ein
   Factory-gestagtes Ticket manuell übernimmt (dev-flow-execute), setzt unmittelbar nach
   dem Branch-Claim `readiness.factory_excluded=true`:
   ```bash
   bash scripts/ticket.sh plan-meta set --id <external_id> --readiness factory_excluded=true
   ```
   Watchdog und queue.sh respektieren das Flag; ohne es pongt der Watchdog (STALE_MIN=0)
   gegen die Pipeline: Reset auf `plan_staged` → erneuter Dispatch → Defer am fremden
   Claim → Status bleibt `in_progress` → nächster Tick resettet erneut (beobachtet an
   T005560, 22:41–22:54 UTC). Nach Abschluss (Merge → done) wird das Flag beim nächsten
   Dispatch-Bedarf von Hand zurückgesetzt (`--readiness factory_excluded=false`) — es ist
   die "durable half of `ticket.sh unfactory`" und wird bewusst nie automatisch gelöscht.

### p2 — Tests-Rolle (Tests)

**target_files:** `tests/spec/factory-watchdog/factory-excluded-scope.bats`, `website/src/data/test-inventory.json`

1. Rot-Beweis: Der bereits committete Test `watchdog: stale-Query schliesst
   factory_excluded=true aus` läuft mit dem Testrunner bats — **expected: FAIL** (die
   Query trägt den Filter noch nicht):
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/factory-excluded-scope.bats
   ```
   Der Positiv-Anker `watchdog: stale-Query erfasst weiterhin in_progress-Tickets` ist
   dabei bereits grün (T002356-M1: erst belegen, dass die Query kommt, dann die
   Negativ-Aussage).
2. Grün-Nachweis NACH dem p1-Fix: derselbe bats-Lauf endet mit `ok` für beide Tests
   (Status 0).
3. Gegenprobe (Regression der Test-Aussagekraft): `git stash` auf der
   `watchdog.sh`-Änderung → bats-Lauf ist wieder rot → `git stash pop`. Das belegt, dass
   der Test die Scope-Regel misst und nicht zufällig grün ist.
4. `bash scripts/plan-lint.sh openspec/changes/watchdog-factory-excluded-scope/tasks.md`
   → PASS.
5. `bash scripts/openspec.sh validate` → PASS.
6. `task test:inventory` → regeneriert `website/src/data/test-inventory.json`; die Datei
   wird im selben Commit mitgeführt (CI re-checkt das Inventar).

---

## Task 5 — Abschliessende Verifikation

Nach p1 und p2 (Implementierung abgeschlossen, alle Teil-Guards grün):

1. `task test:changed` → alle von diesem Branch berührten Guards grün (enthält die
   Watchdog-BATS-Dateien und den plan-lint).
2. `task freshness:regenerate` && `task freshness:check` → Freshness-Artefakte konsistent.
3. `git status --porcelain` → keine uncommitteten Produktions-Dateien außer den
   Plan-/Test-Artefakten.
4. Finaler bats-Lauf als Bestätigung:
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/
   ```
   → alle `ok`, Exit 0.
