---
title: "factory-merged-dispatch-gate — Implementation Plan"
ticket_id: T006297
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-merged-dispatch-gate — Implementation Plan

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `tests/spec/factory-watchdog/merged-ticket-close.bats` | vorhanden (RED, im Stage-Commit committet) | 1 Test; muss am Ende grün sein |
| `tests/spec/software-factory/merged-dispatch-gate.bats` | vorhanden (RED, im Stage-Commit committet) | 1 Test; muss am Ende grün sein |
| `scripts/factory/watchdog.sh` | ändern | Stale-Sweep: Merged-PR-Gate (check-merged rc=1 → close done statt Reset, kein Attempt-Zähler) |
| `scripts/factory/schedule.sh` | ändern | Kandidaten-Schleife: Merged-PR-Gate (check-merged rc=1 → close done statt Claim) |
| `openspec/changes/factory-merged-dispatch-gate/specs/software-factory.md` | vorhanden (ADDED-Delta) | Requirement "Merged-PR-Dispatch-Gate" + 4 Szenarien; wird beim Archivieren in die SSOT gemerged |
| `openspec/changes/factory-merged-dispatch-gate/tasks.md` | vorhanden (diese Datei) | Plan-Artefakt |
| `website/src/data/test-inventory.json` | regenerieren | CI-Inventory-Gate (task test:inventory) |

**S1-Budgets:** `scripts/factory/watchdog.sh` Ist 336 Zeilen · nicht baselined
(`jq -r '."S1:scripts/factory/watchdog.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json`
→ `nicht-baselined`) · statisches `.sh`-Limit **800** (`docs/code-quality/gates.yaml` →
`s1.limits`) → effektives Budget **464**. Der Merged-Gate (check-merged-Aufruf + Close-Zweig
mit update-status/Kommentar/release-slot/Cleanup, geschätzt ~14–18 Zeilen) bleibt mit
erwarteten ~354 Zeilen Gesamtgröße deutlich unter dem Limit und der 80-%-Schwelle.
`scripts/factory/schedule.sh` Ist 162 Zeilen · nicht baselined → Budget **638**; der Gate
(~10–14 Zeilen) bleibt mit erwarteten ~176 Zeilen weit darunter. `.bats` und `.md` führen
keine Einträge in `s1.limits` — die Testdateien und das Spec-Delta sind nicht S1-gegatet.

**S4 (Orphan-Guard):** `scripts/factory/watchdog.sh` bleibt referenziert: von den
Watchdog-Tests (`tests/spec/factory-watchdog/stale-type-coverage.bats`,
`tests/spec/factory-watchdog/merged-ticket-close.bats`), aus der SSOT
(`openspec/specs/software-factory.md`, `openspec/specs/factory-watchdog.md`) und aus dem
T006364-Plan (dieselbe Datei, disjointes Delta). `scripts/factory/schedule.sh` bleibt
referenziert von `tests/spec/software-factory/scheduling.bats`,
`tests/spec/software-factory/merged-dispatch-gate.bats` und der SSOT. Kein Orphan.

**Paralleler Plan T006364 (watchdog-factory-excluded-scope):** derselbe Worktree-Familien-
Pfad `scripts/factory/watchdog.sh`, aber disjunkt: T006364 ändert `_stale_query`
(factory_excluded-Gate in der WHERE-Klausel), T006297 fügt den Merged-Check in der
Kandidaten-Schleife ein (vor dem Attempt-Zähler). Keine Zeilen überlappen; der
Konflikt-Risikobereich ist der Einfüge-Kommentar in der Nähe des Schleifenkopfs — beim
Rebase die Reihenfolge Merge-Ticket zuerst (T006297 baut auf dem Zustand ohne
factory_excluded-Gate auf). Beide Plan-REDs sind unabhängig lauffähig.

---

## Partials

### p1 — Merged-PR-Gate in Watchdog + Schedule (Implementierung)

**target_files:** `scripts/factory/watchdog.sh`, `scripts/factory/schedule.sh`

1. `scripts/factory/watchdog.sh`: In der Stale-Kandidaten-Schleife DIREKT nach der
   `plan_ref`-Extraktion (Zeile 95) und VOR dem Attempt-Zähler-Block (T002361/T002389)
   den Merged-Gate einfügen:

   ```bash
   # ── Merged-PR-Gate (T006297) ─────────────────────────────────────────────
   # Gemergte Tickets (PR auf origin/main mit "[<id>]" im Betreff, M2/T002506)
   # sind fertig — sie duerfen vom Stale-Sweep NICHT in die Queue zurueckgesetzt
   # werden (der Reset re-dispatcht gemergte Arbeit in ein frisches Worktree;
   # beobachtet als "Watchdog-Sturm" auf T004896/T005565/T005591). Stattdessen:
   # close done, Resolution nach Typ (T002329), Kommentar mit "gemergt"-Vermerk.
   # rc=2 (kein origin/main) = fail-open: sichtbare WARN, Ticket unveraendert —
   # ein nicht erreichbarer Remote darf den Sweep nicht anhalten.
   set +e
   BRAND="$BRAND" bash "$HERE/../agent-lock.sh" check-merged "$ext_id" >/dev/null 2>&1
   merged_rc=$?
   set -e
   if [[ "$merged_rc" -eq 1 ]]; then
     local resolution="shipped"; [[ "$ticket_type" == "fix" || "$ticket_type" == "bug" ]] && resolution="fixed"
     BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status done --resolution "$resolution" >/dev/null
     BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" comment --id "$ext_id" --body "Watchdog: PR bereits auf main gemergt — Ticket geschlossen statt zurueckgesetzt (T006297)" >/dev/null 2>&1 || true
     BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
     _wd_cleanup_worktree "$ext_id"
     escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
     continue
   elif [[ "$merged_rc" -eq 2 ]]; then
     echo "watchdog: WARN check-merged rc 2 fuer ${ext_id} (kein origin/main) — Stale-Behandlung ungeprueft [T006297]" >&2
   fi
   ```

   Wichtig: der `continue` verzweigt VOR dem Attempt-Zähler — ein gemergtes Ticket
   konsumiert keinen MODELL-/INFRA-Versuch (keine `factory_control`-Zeile), und der
   Close ist idempotent (beim nächsten Tick ist das Ticket nicht mehr `in_progress`).
   Der `escalated`-Eintrag hält die Output-Verträge der Watchdog-Tests ein (letzte
   Ausgabezeile = JSON-Array der behandelten IDs).
2. `scripts/factory/schedule.sh`: In der Kandidaten-Schleife DIREKT nach
   `ext_id=$(echo "$c" | jq -r '.external_id')` (Zeile 46) und VOR dem Dependency-Blocker-
   Gate denselben Gate einfügen:

   ```bash
   # ── Merged-PR-Gate (T006297) ─────────────────────────────────────────────
   # Gemergte plan_staged-Tickets duerfen nicht dispatched werden (Duplikat-
   # Arbeit; beobachtet als "Watchdog-Sturm" auf T004896/T005565/T005591 —
   # PRs #4512/#4514/#4515 gemergt, Tickets blieben offen und wurden
   # re-dispatcht). Close done statt Claim; rc=2 (kein origin/main) = fail-open
   # mit sichtbarer WARN, Ticket bleibt Kandidat.
   set +e
   BRAND="$BRAND" bash "$HERE/../agent-lock.sh" check-merged "$ext_id" >/dev/null 2>&1
   merged_rc=$?
   set -e
   if [[ "$merged_rc" -eq 1 ]]; then
     local resolution="shipped"; case "$(echo "$c" | jq -r '.type')" in fix|bug) resolution="fixed";; esac
     BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status done --resolution "$resolution" >/dev/null
     BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" comment --id "$ext_id" --body "Schedule: PR bereits auf main gemergt — Ticket geschlossen statt dispatched (T006297)" >/dev/null 2>&1 || true
     continue
   elif [[ "$merged_rc" -eq 2 ]]; then
     echo "schedule: WARN check-merged rc 2 fuer ${ext_id} (kein origin/main) — Dispatch ungeprueft [T006297]" >&2
   fi
   ```

   Wichtig: der Close-Zweig `continue`t VOR Dependency-Gate, Konflikt-Gate und
   `slots.sh claim-gang` — kein Slot wird belegt, kein Worktree angelegt, der
   Kandidat taucht nicht im Launch-Plan auf. Der `type` kommt aus dem Queue-JSON
   (Feld `type` ist in queue.sh enthalten).
3. Kommentar-Texte enthalten das Substring `gemergt` — die RED-Tests prüfen den
   Close-Kommentar semantisch per `body LIKE '%gemergt%'` (T002716: Ergebnis, nicht
   Darstellung — die konkrete Formulierung darf variieren, der Vermerk muss bleiben).

### p2 — Tests-Rolle (Tests)

**target_files:** `tests/spec/factory-watchdog/merged-ticket-close.bats`, `tests/spec/software-factory/merged-dispatch-gate.bats`, `website/src/data/test-inventory.json`

1. Rot-Beweis (bereits erbracht, am 2026-08-15 gegen die Dev-k3d live dokumentiert):
   beide Tests laufen mit dem Testrunner bats auf unverändertem Code — **expected: FAIL**, beides bestätigt:
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/merged-ticket-close.bats
   # → not ok: Zeile 114 `[ "$st" = "done" ]' failed — gemergtes Ticket wurde
   #   nach triage zurückgesetzt statt geschlossen (Positiv-Anker grün: die
   #   Stale-Sweep erreichte die Fixtures, T099999 → triage)
   ./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/merged-dispatch-gate.bats
   # → not ok: Zeile 119 `all(.[]; .external_id != $e)' failed — das gemergte
   #   Ticket T001108 IST im Launch-Plan (Positiv-Anker grün: Anker mit Slot
   #   geclaimt und in_progress)
   ```
   Fixture-Mechanik (im Test-Header dokumentiert): SQL-INSERT mit zurückdatiertem
   `updated_at` (fn_lifecycle_ts überschreibt bei UPDATE, INSERT umgeht es — T002620),
   STALE_MIN=30 statt 0 (Isolation, T005561), gemergte IDs = auf main vorhandene,
   in der Dev-DB gelöschte Tickets (T001105 = PR #2081, T001108 = PR #2083,
   external_id UNIQUE global), T099999 als nie-gemergter Anker, Titel SF-REAL-* für
   den purge_real_feature-Guard, Registrierung in sf-seeded-ids für _sf_teardown,
   factory_control-Aufräumen im teardown (keine FK-Kaskade).
2. Grün-Nachweis NACH dem p1-Fix: dieselben bats-Läufe enden mit `ok` für beide Tests
   (Exit 0) — Fixtures werden von _sf_teardown gepurged (Residue-Check:
   `SELECT count(*) FROM tickets.tickets WHERE title LIKE 'SF-REAL-%' AND brand='mentolder';`
   → 0).
3. Gegenprobe (Regression der Test-Aussagekraft): `git stash` auf den beiden
   Skript-Änderungen → bats-Läufe sind wieder rot → `git stash pop`. Belegt, dass die
   Tests das Gate messen und nicht zufällig grün sind.
4. `bash scripts/plan-lint.sh openspec/changes/factory-merged-dispatch-gate/tasks.md`
   → PASS.
5. `bash scripts/openspec.sh validate` → PASS.
6. `task test:inventory` → regeneriert `website/src/data/test-inventory.json`; die Datei
   wird im selben Commit mitgeführt (CI re-checkt das Inventar).

---

## Task 5 — Abschliessende Verifikation

Nach p1 und p2 (Implementierung abgeschlossen, alle Teil-Guards grün):

1. `task test:changed` → alle von diesem Branch berührten Guards grün (enthält die
   beiden T006297-BATS-Dateien und den plan-lint).
2. `task freshness:regenerate` && `task freshness:check` → Freshness-Artefakte konsistent.
3. `git status --porcelain` → keine uncommitteten Produktions-Dateien außer den
   Plan-/Test-Artefakten.
4. Finaler bats-Lauf als Bestätigung:
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/merged-ticket-close.bats \
     tests/spec/software-factory/merged-dispatch-gate.bats
   ```
   → beide `ok`, Exit 0.

## Taskliste

- [ ] **Task 1: watchdog.sh Merged-PR-Gate (p1.1)** — check-merged nach plan_ref-Extraktion, Close-Zweig mit Resolution-Mapping/`gemergt`-Kommentar/release-slot/Cleanup, `continue` vor Attempt-Zähler, rc=2-WARN fail-open
- [ ] **Task 2: schedule.sh Merged-PR-Gate (p1.2)** — check-merged nach ext_id-Extraktion, Close-Zweig vor Dependency-/Konflikt-Gate und Claim, rc=2-WARN fail-open
- [ ] **Task 3: Grün-Nachweis + Gegenprobe (p2.2, p2.3)** — beide bats-Läufe `ok`; Gegenprobe mit `git stash` ist wieder rot; Residue-Check 0
- [ ] **Task 4: Gates (p2.4–p2.6)** — plan-lint PASS, openspec validate PASS, `task test:inventory` regeneriert und mitcommittet
- [ ] **Task 5: Abschliessende Verifikation** — `task test:changed`, `task freshness:regenerate` && `task freshness:check`, finaler bats-Lauf beider Dateien `ok`
