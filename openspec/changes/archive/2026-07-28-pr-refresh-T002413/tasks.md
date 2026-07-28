---
title: "pr-refresh-T002413 — Implementation Plan"
ticket_id: T002413
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pr-refresh-T002413 — Implementation Plan

_Ticket: T002413_

## File Structure

```
scripts/pr-refresh.sh          NEU   Ziel ≤ 300 Zeilen (.sh-Limit 500, nicht gebaselined)
Taskfile.yml                   ÄND   +8 Zeilen (pr:refresh-Task) · .yml ist nicht S1-gegated
tests/spec/pr-refresh.bats     DA    7 Tests, aktuell 7/7 rot — im Stage-Commit enthalten
```

**S1-Budgets** (wirksame Schwelle = Baseline falls vorhanden, sonst Extension-Limit):

| Datei | Ist | Baseline | Wirksame Schwelle | Budget |
|---|---|---|---|---|
| `scripts/pr-refresh.sh` | 0 (neu) | nicht-baselined | 500 (`.sh`) | 500, Ziel ≤ 300 mit Wachstumsreserve |
| `Taskfile.yml` | 4888 | nicht-baselined | — (`.yml` nicht in `s1.limits`) | kein S1-Gate |

**S4 (Orphan-Guard):** `scripts/pr-refresh.sh` wird über den `pr:refresh`-Task im Taskfile
erreichbar — das ist zugleich Test 7 in der BATS-Datei.

**S3:** keine Brand-Domain-Literale. Das Skript spricht ausschließlich `origin`/`gh-axi` an
und kennt keine Hostnamen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die BATS-Datei `tests/spec/pr-refresh.bats` liegt bereits
      im Stage-Commit und ist vollständig rot. Vor jeder Implementierung erneut ausführen und
      den roten Zustand bestätigen — er ist die Messlatte für alles Folgende.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pr-refresh.bats
# expected: FAIL (7/7 rot — scripts/pr-refresh.sh existiert noch nicht)
```

- [ ] **Task 1 — Grundgerüst und PR-Abfrage.** `scripts/pr-refresh.sh` anlegen (`set -euo
      pipefail`, ausführbar). Argument-Parsing für `--dry-run`, `--help` und eine oder mehrere
      PR-Nummern. Die GitHub-Abfrage läuft über eine Funktion `_gh()`, die auf
      `${PR_REFRESH_GH_CMD:-gh-axi}` auflöst — dieser Indirektionspunkt ist es, der die BATS-Tests
      ohne Netz möglich macht (dieselbe Technik wie `AGENT_LOCK_FAKE_ALIVE` in `agent-lock.sh`).
      Abgefragt werden `number`, `mergeable`, `headRefName` und `author.login`.
      Die `--help`-Ausgabe braucht eine mit `Guards:` beginnende Sektion, die
      `force-with-lease`, `agent-lock` und `generiert` nennt (Test 2 prüft genau diese Sektion,
      nicht die Gesamtausgabe — siehe $0-Falle im Dateikopf der BATS-Datei).
      Danach grün: Tests 1, 2, 7 (Test 7 erst nach Task 4).

- [ ] **Task 2 — Guards vor jeder Mutation.** In dieser Reihenfolge, jeder mit eigener
      Fehlermeldung und Exit ≠ 0:
      1. `mergeable != CONFLICTING` → Meldung mit dem Ist-Zustand, Exit 0 (kein Fehler, nur
         nichts zu tun).
      2. `author.login` ≠ authentifizierter Account → Ablehnung, die den fremden Login
         wörtlich nennt (Test 4 grept darauf).
      3. `headRefName` erscheint in `bash scripts/agent-lock.sh list` als `live` → Ablehnung,
         die die besitzende Session nennt.
      Danach grün: Tests 3, 4.

- [ ] **Task 3 — Rebase im temporären Worktree.** Über `scripts/worktree-create.sh` einen
      Worktree auf dem PR-Branch anlegen (nie im Hauptcheckout arbeiten — CLAUDE.local.md).
      Dort `git rebase origin/main`. Bei Konflikt: die betroffenen Pfade über
      `git diff --name-only --diff-filter=U` sammeln und durch `scripts/filter-generated.sh`
      schicken. Bleibt die Liste danach **leer**, waren alle Konflikte generiert und der Rebase
      wird fortgesetzt; bleibt etwas übrig, `git rebase --abort`, Worktree entfernen und mit
      Exit ≠ 0 den ersten verbleibenden Pfad melden. Die Zuordnung „generiert" kommt
      ausschließlich aus `.gitattributes` — keine zweite Pfadliste im Skript (Test 6 prüft,
      dass `openspec-status.json` NICHT im Skript steht).
      Danach grün: Test 6.

- [ ] **Task 4 — Regenerieren, pushen, Taskfile-Einsprung.** Nach erfolgreichem Rebase im
      Worktree `task freshness:regenerate` ausführen, die 16 Artefakte stagen und amenden.
      Push mit `--force-with-lease`, niemals `--force`. Ist `PR_REFRESH_DRY_PUSH` gesetzt, wird
      der Push stattdessen nach `$PR_REFRESH_PUSH_LOG` protokolliert — die Tests prüfen über
      diese Datei, dass kein Push stattgefunden hat. Im `--dry-run`-Modus gibt jede geplante
      Aktion eine mit `[dry-run]` beginnende Zeile aus, die die PR-Nummer enthält (Test 5).
      Zum Schluss den Task `pr:refresh` in `Taskfile.yml` ergänzen, der das Skript mit
      `{{.CLI_ARGS}}` aufruft.
      Danach grün: Tests 5, 7 — und damit 7/7.

- [ ] **Task 5 — Grün nachweisen.** Die BATS-Datei erneut ausführen; alle sieben Tests müssen
      bestehen. Ein bestandener Lauf ohne vorherigen roten Lauf zählt nicht als Nachweis.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pr-refresh.bats
# expected: 7/7 ok
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Anwendung nach dem Merge

Sobald der PR gemergt ist, heilt das Werkzeug den bestehenden Stapel:

```bash
task pr:refresh -- --dry-run 3448 3446 3442   # erst ansehen
task pr:refresh -- 3448 3446 3442             # dann anwenden
```

Erwartung: Die drei PRs wechseln von `CONFLICTING` nach `MERGEABLE`, sofern ihre Konflikte
auf generierte Artefakte beschränkt sind. `#3448` hat laut Vorabprüfung zusätzlich einen
Konflikt in `tests/spec/agent-lock-session-identity.bats` — dort greift der Guard aus Task 3,
und der Konflikt bleibt korrekt zur Handauflösung stehen.
