---
title: "freshness-regen-reaper — Implementation Plan"
ticket_id: T005958
domains: [ci-cd]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freshness-regen-reaper — Implementation Plan

_Ticket: T005958_

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Branch-Reaper räumt `chore/freshness-regen-*`-Branches ab, deren PR gemergt oder geschlossen ist, sobald ihre Blob-Abweichung zu `origin/main` vollständig in der ALLOWLIST liegt.

**Architecture:** Im Sweep-Modus (`--sweep`/`--dry-run`) ersetzt für Branches mit dem Muster `chore/freshness-regen-*` eine PR-Status-Entscheidung (`gh pr list --head <branch> --state all`) die Ticket-Status-Prüfung (Kriterium 3). Der Blob-Check gegen die bestehende `ALLOWLIST` (Kriterium 4) bleibt unverändert; die Lösch-Mechanik (Archiv-Tag, `_reap_local_ref`) bleibt unangetastet. Alle anderen Branches ohne Ticket-ID behalten die bestehende KEEP-Regel (T003074).

**Tech Stack:** Bash (`scripts/branch-reaper.sh`), BATS (vendored `tests/unit/lib/bats-core/bin/bats`), GitHub CLI (`gh`) — im Test als PATH-Stub.

**Spec:** `openspec/changes/freshness-regen-reaper/proposal.md` (Delta: `openspec/changes/freshness-regen-reaper/specs/ci-cd.md`), Design: `openspec/changes/freshness-regen-reaper/design.md`

## Global Constraints

- **S1-Budget `scripts/branch-reaper.sh`:** Ist 288 Zeilen · Limit 800 (`.sh`) · nicht baselined → Budget 512. Die Regel ergänzt ~30 Zeilen — kein Split nötig.
- **S1 für die Testdatei:** `tests/**/*.bats` ist in `docs/code-quality/gates.yaml` von S1 ausgenommen.
- **Ausgabevertrag:** Die Zeilenpräfixe `REAP <branch>` / `KEEP <branch> — <grund>` / `DELETED <branch>` sind der Vertrag für `tests/spec/ci-cd/branch-reaper*.bats` und bleiben unverändert.
- **ASCII-Output im Skript:** Neue KEEP-Begründungen transliterieren (`ae`/`oe`/`ue`) wie die bestehenden Meldungen.
- **BATS-Fixture-Regeln:** Nur Wegwerf-Repos (`git init` in `BATS_TEST_TMPDIR`, bare Remote), alle Pfade ABSOLUT, alle git-Aufrufe mit `-C` — kein `cd`, keine relativen Verzeichnisse (`bats -j 6`, T003180-Fixture-Konvention). Niemals gegen das echte Repo (Löschlauf ist unumkehrbar).
- **`bash -n` ist KEIN Syntax-Check für `.bats`** — stattdessen `tests/unit/lib/bats-core/bin/bats --count <datei>` (T002351-M2).
- **Kein `gh`-Real-Aufruf im Test:** Der Test stubbt `gh` über `PATH`; `TICKET_SH` wird auf einen Stub gesetzt.

## File Structure

| Datei | Ist | Budget | Rolle |
|---|---|---|---|
| `scripts/branch-reaper.sh` | 288 | 512 (Limit 800) | Implementierung der Freshness-Regel (Task 2) |
| `tests/spec/ci-cd/branch-reaper-freshness-regen.bats` | ~200 | — (S1-ausgenommen) | RED-Test, bereits im Plan-Stage-Commit (Task 1 verifiziert ihn) |
| `website/src/data/test-inventory.json` | regeneriert | — | Test-Inventar (Task 3) |

---

### Task 1: RED-Test verifizieren (committed, keine Änderungen)

Der failing Test wurde im Plan-Stage-Commit bereits angelegt
(`tests/spec/ci-cd/branch-reaper-freshness-regen.bats`). Diese Task verifiziert, dass er gegen
den unveränderten `scripts/branch-reaper.sh` rot ist — das ist die Rot-Phase des Fix-Pfads.

**Files:**
- Test: `tests/spec/ci-cd/branch-reaper-freshness-regen.bats` (existiert, unverändert)
- Modify: keine

- [x] **Step 1: Testlauf gegen den aktuellen Stand**

Run:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-freshness-regen.bats
```

- [x] **Step 2: Rotes Ergebnis bestätigen**

Expected: FAIL. Mindestens die Tests 1 und 2 („Positiv-Anker: gemergter freshness-regen-Branch
wird REAP-Kandidat", „geschlossener (unmergter) freshness-regen-Branch wird REAP-Kandidat")
scheitern; die Tests 3–6 scheitern an ihrem eingebetteten Positiv-Anker (T002356-M1). Der
Fehlermodus ist die heutige Zeile `KEEP <branch> — keine Ticket-ID im Branch-Namen erkennbar`.
Test 7 („OHNE --dry-run loescht nicht versehentlich") bleibt grün.

Hinweis: Ist der Lauf bereits grün, wurde der Test nicht gegen den Implementierungsstand
gemessen (T003548 — ein RED-Lauf, der grün ist, ist ein Befund am Test). Dann stoppen und den
Test prüfen, NICHT weiter implementieren.

### Task 2: Freshness-Regel in `scripts/branch-reaper.sh` implementieren

**Files:**
- Modify: `scripts/branch-reaper.sh` (Ticket-ID-Extraktion ~Zeile 181-190, Ticket-Status-Block ~Zeile 203-212)

**Interfaces:**
- Konsumiert: bestehende Helfer `_diverging_files` und `_allowed` (unverändert), bestehende Variablen `branch`, `REMOTE`, `ALLOWLIST`.
- Produziert: das Flag `freshness_decided` (0/1), nur innerhalb der Branch-Schleife verwendet; neue KEEP-Meldungen mit den Präfixen des bestehenden Output-Vertrags.

- [x] **Step 1: Ticket-ID-Extraktion um den Freshness-Zweig erweitern**

Ersetze den Block „Im Sweep-Modus die Ticket-ID je Branch …" (ab `branch_ticket_id="$TICKET_ID"` bis zum schließenden `fi` der `[ -z "$branch_ticket_id" ]`-Abfrage) durch:

```bash
  branch_ticket_id="$TICKET_ID"
  freshness_decided=0
  if [ -z "$branch_ticket_id" ]; then
    branch_ticket_id="$(printf '%s' "$branch" | grep -o 'T[0-9]\{6\}' | head -1 || true)"
    if [ -z "$branch_ticket_id" ]; then
      # [T005958] chore/freshness-regen-* traegt nie eine Ticket-ID. Fuer diese Klasse
      # entscheidet der PR-Status (MERGED/CLOSED) statt des Ticket-Status. Exit-Code
      # auswerten, nicht die leere Ausgabe (dasselbe Muster wie beim offenen-PR-Check).
      if [[ "$branch" == chore/freshness-regen-* ]]; then
        if ! pr_all="$(gh pr list --head "$branch" --state all --json state 2>&1)"; then
          echo "KEEP $branch — gh-Abfrage fehlgeschlagen: $(printf '%s' "$pr_all" | head -1)"
          continue
        fi
        if printf '%s' "$pr_all" | grep -q '"state"[[:space:]]*:[[:space:]]*"OPEN"'; then
          echo "KEEP $branch — offener Freshness-PR (Auto-Merge ausstehend)"
          continue
        fi
        if ! printf '%s' "$pr_all" | grep -qE '"state"[[:space:]]*:[[:space:]]*"(MERGED|CLOSED)"'; then
          echo "KEEP $branch — kein Freshness-PR auffindbar"
          continue
        fi
        freshness_decided=1
      else
        echo "KEEP $branch — keine Ticket-ID im Branch-Namen erkennbar"
        continue
      fi
    fi
  fi
```

- [x] **Step 2: Ticket-Status-Block hinter das Freshness-Flag hängen**

Umschließe den bestehenden Block „(3) Ticket-Status" (von `# (3) Ticket-Status` bis zum
schließenden `esac`) mit:

```bash
  # (3) Ticket-Status — fuer freshness_decided=1 bereits durch den PR-Status entschieden
  if [ "$freshness_decided" -eq 0 ]; then
    <bestehender Ticket-Status-Block unverändert>
  fi
```

Der offene-PR-Check (2) und der Blob-Check (4) bleiben unverändert: Für einen
MERGED/CLOSED-Freshness-PR liefert `gh pr list --state open` `[]`, und der Blob-Check gegen
`origin/main` + `ALLOWLIST` entscheidet über die Abweichung. Der KEEP-Fall „abweichende Datei
ausserhalb der Allowlist" bleibt damit für Freshness-Branches aktiv.

- [x] **Step 3: Syntax-Check**

Run: `bash -n scripts/branch-reaper.sh`
Expected: Exit 0.

- [x] **Step 4: Testlauf — neuer Test grün**

Run:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-freshness-regen.bats
```
Expected: PASS, 7/7 (vorher: 1/7, siehe Task 1). Zusätzlich die bestehenden Suiten gegen den
unveränderten Output-Vertrag prüfen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper.bats tests/spec/ci-cd/branch-reaper-sweep.bats tests/spec/ci-cd/branch-reaper-local-ref.bats
```
Expected: PASS — insbesondere `branch-reaper-sweep.bats` Test „ein Branch ohne Ticket-ID im
Namen wird im Sweep nicht geloescht" (chore/ohne-ticket bleibt KEEP).

- [x] **Step 5: Realitäts-Check gegen origin (lesend, Dry-Run)**

Run (im Hauptcheckout oder Worktree mit `--repo` auf dem Hauptcheckout, ausschliesslich
lesend):
```bash
git fetch origin
bash scripts/branch-reaper.sh --sweep --dry-run | grep '^KEEP chore/freshness-regen'
```
Expected: KEINE `KEEP chore/freshness-regen`-Zeilen mehr (alle 15 Branches sind MERGED und
divergieren nur unter `docs/code-quality/*` — Messung im design.md). Trifft das nicht zu,
Differenz prüfen: offener PR, kein PR, oder Abweichung ausserhalb der ALLOWLIST sind legitime
KEEP-Gründe; eine davon muss in der Ausgabe stehen.

- [x] **Step 6: Commit**

```bash
git add scripts/branch-reaper.sh
git commit -m "fix: reaper reaps merged chore/freshness-regen branches [T005958]"
```

### Task 3: Test-Inventar regenerieren

Die neue BATS-Datei muss in `website/src/data/test-inventory.json` erscheinen — der
CI-Inventar-Check (`task test:inventory` in `ci.yml`) failt sonst (T002416).

**Files:**
- Modify: `website/src/data/test-inventory.json` (regeneriert)

- [x] **Step 1: Inventar regenerieren**

Run: `task test:inventory`
Expected: Exit 0; `website/src/data/test-inventory.json` enthält einen Eintrag für
`tests/spec/ci-cd/branch-reaper-freshness-regen.bats`.

- [x] **Step 2: Diff prüfen**

Run: `git diff -- website/src/data/test-inventory.json`
Expected: genau ein neuer Eintrag (die freshness-regen-Testdatei). Weitere Diff-Zeilen bedeuten
einen lokalen Drift — nicht committen, erst klären.

Hinweis Implementierung: Der Eintrag war bereits im Plan-Stage-Commit `e7f1c1ce9`
registriert; `task test:inventory` (833 Einträge, Exit 0) erzeugte keinerlei Diff —
kein Drift, kein separater Commit nötig.

- [x] **Step 3: Commit** (bereits durch Plan-Stage-Commit abgedeckt — kein zusätzlicher Commit nötig)

```bash
git add website/src/data/test-inventory.json
git commit -m "chore: register branch-reaper-freshness-regen test in inventory [T005958]"
```

### Task 4: Finale Verifikation

**Files:**
- Modify: keine

- [x] **Step 1: Geänderte Tests + Gates**

Run:
```bash
task test:changed
```
Expected: PASS.

Hinweis Implementierung: `task test:changed` endet lokal strukturell rot — ausschliesslich am
`runtime-drift-check` (stale mcp-task-runner-Binary, Dev-DB-Migrationsdrift `purge-fn-v8`;
bekanntes lokales Umgebungsproblem T005561, kein Fehler aus diesem Change). CI-äquivalente
Läufe sind gruen: `task test:spec:changed` (253 Tests, Exit 0) sowie gezielt
`bats tests/spec/ci-cd/branch-reaper*.bats tests/spec/ci-cd/branch-reaper-freshness-regen.bats`
(21 Tests, Exit 0).

- [x] **Step 2: Freshness-Artefakte + OpenSpec-Gate**

Run:
```bash
task freshness:regenerate
task openspec:validate
```
Expected: beide PASS. `openspec:validate` prüft das Delta `openspec/changes/freshness-regen-reaper/specs/ci-cd.md` gegen `openspec/specs/ci-cd.md` (fail-closed CI-Gate).

- [x] **Step 3: Drift-Gate**

Run:
```bash
task freshness:check
```
Expected: PASS (das Gate schlägt nur an, wenn nach der Regenerierung noch Drift besteht).

- [x] **Step 4: PR eröffnen**

```bash
git push -u origin fix/freshness-regen-reaper-T005958
gh pr create --base main --head fix/freshness-regen-reaper-T005958 \
  --title "fix: branch-reaper reaps merged freshness-regen branches [T005958]" \
  --body "Implementiert die Freshness-Reaper-Regel aus dem Plan (T005958). Roter Test war im Plan-Stage-Commit: tests/spec/ci-cd/branch-reaper-freshness-regen.bats."
```
Expected: CI grün (offline tests + openspec:validate + inventar-check), Merge per squash.

Hinweis Implementierung: PR #4531 erstellt (Titel mit Scope-Konvention `fix(scripts): … [T005958]`,
Body `Closes T005958`), Auto-Merge per Squash angefordert (`gh pr merge --auto --squash`,
ohne `--delete-branch`). CI-Checks laufen; Merge-Wait beim Orchestrator.
