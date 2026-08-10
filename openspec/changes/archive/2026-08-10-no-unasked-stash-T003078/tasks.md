---
title: "no-unasked-stash-T003078 — Implementation Plan"
ticket_id: T003078
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# no-unasked-stash-T003078 — Implementation Plan

_Ticket: T003078 (führend), T003097 (gleiche Fehlerklasse, im selben Plan mitgelöst)_

Gemeinsamer Fix für zwei Vorkommen derselben Fehlerklasse: `git stash` mutiert den
Haupt-Checkout, ohne zu prüfen, ob ein fremder Agent-Prozess dort mit uncommitteten
Änderungen arbeitet. Details, Root-Cause und die geprüften/verworfenen Erkennungskriterien
stehen in `design.md` dieses Change. Kurzfassung des gewählten Kriteriums: `ps`-basierte
Zuordnung von `claude`/`opencode`-Prozessen über `/proc/<pid>/cwd` auf den Haupt-Checkout,
kombiniert (UND, nicht ODER) mit einem `git status --porcelain`-Dirty-Check.

## File Structure

```
scripts/lib/main-checkout-foreign-guard.sh        (NEU — geteilte Erkennungsfunktion)
scripts/worktree-create.sh                        (GEÄNDERT — Zeilen ~166-214)
.claude/skills/dev-flow-chore/SKILL.md             (GEÄNDERT — Schritt 0)
tests/spec/divergence-guard/main-checkout-foreign-guard.bats   (NEU — bereits committed, RED)
tests/spec/agent-skills/dev-flow-chore-step0-foreign-guard.bats (NEU — bereits committed, RED)
openspec/specs/divergence-guard.md                (GEÄNDERT bei Archivierung — Delta bereits in specs/divergence-guard.md dieses Change)
openspec/specs/agent-skills.md                    (GEÄNDERT bei Archivierung — Delta bereits in specs/agent-skills.md dieses Change)
```

**S1-Budgets (wirksame Schwelle, siehe plan-quality-gates):**
- `scripts/worktree-create.sh`: Ist 534 Zeilen, nicht gebaselined → statisches `.sh`-Limit
  800 → Budget ≈ 266 Zeilen. Die geplante Änderung fügt ~10-15 Zeilen hinzu (Guard-Aufruf +
  Warnmeldung) — deutlich innerhalb des Budgets.
- `scripts/lib/main-checkout-foreign-guard.sh`: neue Datei, ~45-55 Zeilen geplant →
  weit unter dem `.sh`-Limit von 800.
- `.claude/skills/dev-flow-chore/SKILL.md`: kein `.md`-Limit in `gates.yaml` → S1 nicht
  anwendbar auf diese Datei.

## Tasks

### Task 1 — Geteilte Erkennungsfunktion `mc_foreign_activity_detected` (GREEN für Unit-Tests)

Lege `scripts/lib/main-checkout-foreign-guard.sh` an. Die Datei wird sowohl von
`scripts/worktree-create.sh` (Task 2) als auch — als dokumentierter Kommandoaufruf im
Codeblock — von `.claude/skills/dev-flow-chore/SKILL.md` Schritt 0 (Task 3) verwendet.

Funktion `mc_foreign_activity_detected <checkout-path>`:
1. `git -C "<checkout-path>" status --porcelain` — leer → return 1 (kein Foreign-Fall,
   nichts zu schützen).
2. Ansonsten: eigene Ancestor-PID-Kette ermitteln (`$$` aufwärts bis PID 1 via
   `ps -o ppid= -p <pid>`), damit die eigene Session nicht fälschlich als "fremd" zählt.
3. Alle laufenden PIDs durchgehen (`ps -eo pid=`), eigene Ancestor-PIDs überspringen,
   `/proc/<pid>/cwd` gegen `<checkout-path>` vergleichen (exakter Pfadabgleich,
   `readlink`).
4. Bei Match: `ps -o args= -p <pid>` prüfen, ob die Kommandozeile mit `claude` oder
   `opencode` beginnt (Wortgrenze, kein Teilstring-Match auf z.B. `claude-code-mcp`
   o.ä. — `case`-Pattern `claude|claude\ *|opencode|opencode\ *`).
5. Erster Treffer → return 0 (Foreign-Aktivität erkannt). Kein Treffer nach vollständigem
   Scan → return 1.

Kommentar-Header referenziert T003078/T003097 und die drei geprüften/verworfenen
Alternativen aus `design.md` (agent-lock.sh list, Datei-mtimes) kurz, damit die Begründung
nicht nur im Change-Ordner, sondern auch am Code selbst nachvollziehbar bleibt.

**Failing-Test-Step (RED).** Die drei Unit-Tests in
`tests/spec/divergence-guard/main-checkout-foreign-guard.bats` (bereits im Repo, committed
mit diesem Plan) müssen nach Anlage dieser Datei von FAIL (fehlende Datei) auf PASS wechseln:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/main-checkout-foreign-guard.bats
# VOR Task 1: alle 4 Tests FAIL (source: No such file or directory / dirty checkout mutiert)
# expected: FAIL (red — scripts/lib/main-checkout-foreign-guard.sh existiert noch nicht)
```

Nach Task 1 müssen mindestens die drei Unit-Tests (1-3) grün sein; Test 4 (Integration)
bleibt bis Task 2 rot.

### Task 2 — `scripts/worktree-create.sh`: Foreign-Guard vor dem Auto-Stash

Ändere den Divergence-Guard-Block (aktuell Zeilen ~166-214, Kommentar "T001302/T001332:
Divergence guard"). Direkt nach der Zeile `echo "worktree-create: local main is behind
origin/main — fast-forwarding..." >&2` und VOR dem bestehenden `CURRENT_BRANCH`-Check /
Stash-Block:

1. Source `scripts/lib/main-checkout-foreign-guard.sh` (relativ zu
   `${BASH_SOURCE[0]}`, wie die bestehende `branch-allowlist.sh`-Einbindung weiter oben im
   Skript).
2. Ruft `mc_foreign_activity_detected "$(pwd)"` auf.
3. **Bei Treffer:** Warnung ausgeben (`worktree-create: main checkout ist dirty UND ein
   fremder Agent-Prozess ist dort aktiv — lokaler main-Sync wird übersprungen, Worktree
   wird direkt von origin/main erstellt.`), den gesamten Sync-Block (Branch-Check,
   Stash/Pull/Pop) überspringen und zum Rest des Skripts weiterspringen (BASE bleibt
   `${3:-origin/main}`, unverändert von diesem Codepfad betroffen).
4. **Kein Treffer:** bestehende Logik unverändert (Branch-Check, Stash, Pull, Pop via
   `_wc_stash_pop_or_warn` — T002673-Absicherung bleibt exakt wie sie ist).

Der "wirklich divergiert"-Fehlerfall (aktuell die `else`-Verzweigung nach dem
Fast-Forward-Block) bleibt vollständig unverändert — er stasht ohnehin nicht.

**Failing-Test-Step (RED, bereits vorhanden — jetzt GREEN erwartet).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/main-checkout-foreign-guard.bats
# VOR dieser Änderung: Test 4 FAIL (Haupt-Checkout wird trotz fremdem Prozess gestasht/gepullt)
# expected: FAIL (red — vor Task 2 mutiert worktree-create.sh den dirty Checkout weiterhin)
```

Nach Task 2 müssen alle 4 Tests in dieser Datei grün sein.

### Task 3 — `dev-flow-chore/SKILL.md` Schritt 0: Foreign-Guard vor `git stash`

Ändere den Bash-Codeblock in Schritt 0 (aktuell: `bash scripts/agent-lock.sh reap` /
`git fetch origin main` / `if git diff --quiet HEAD; then git pull --rebase origin main;
else git stash && git pull --rebase origin main && git stash pop; fi`) auf:

```bash
bash scripts/agent-lock.sh reap   # Session-Koordination [T000510]: Zombies/stale Worktrees/tote Locks räumen
bash scripts/agent-msg.sh read --unread   # offene Nachrichten paralleler Sessions sichten [T000882]
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  . scripts/lib/main-checkout-foreign-guard.sh
  if mc_foreign_activity_detected "$(pwd)"; then
    echo "dev-flow-chore: main checkout ist dirty UND ein fremder Agent-Prozess ist dort aktiv — lokaler main-Sync wird übersprungen. scripts/worktree-create.sh (Schritt 1) erstellt den Worktree direkt von origin/main." >&2
  else
    git stash && git pull --rebase origin main && git stash pop
  fi
fi
```

(Die `agent-msg.sh read --unread`-Zeile stand bereits im überliegenden dev-flow-plan-Ablauf
für Schritt −1 dokumentiert und wird hier nicht neu eingeführt — falls sie in der aktuellen
Chore-SKILL.md-Fassung an dieser Stelle bereits fehlt, NICHT ergänzen; nur die Stash-Zeile
ändern, um den Diff minimal zu halten.)

Referenziere im Prosa-Text darüber kurz: "Bei fremder Aktivität im Haupt-Checkout wird der
Sync übersprungen (siehe `scripts/lib/main-checkout-foreign-guard.sh`, T003078/T003097) —
der lokale `main`-Sync ist Hygiene, keine Korrektheitsvoraussetzung für den nachfolgenden
`worktree-create.sh`-Aufruf, der ohnehin von `origin/main` aus anlegt."

**Failing-Test-Step (RED, bereits vorhanden — jetzt GREEN erwartet).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/dev-flow-chore-step0-foreign-guard.bats
# VOR dieser Änderung: Test 2 und Test 3 FAIL (Referenz auf mc_foreign_activity_detected
# fehlt; die alte unbedingte Stash-Kette steht noch unqualifiziert in Schritt 0)
# expected: FAIL (red — SKILL.md Schritt 0 ist noch nicht geändert)
```

Nach Task 3 müssen alle 3 Tests in dieser Datei grün sein.

### Task 4 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich gezielt beide neuen Testdateien (beide Formen, T002696-Konvention):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/divergence-guard/main-checkout-foreign-guard.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills/dev-flow-chore-step0-foreign-guard.bats
```
