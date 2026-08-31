---
title: "agent-lock-windows-drive-path — Implementation Plan"
ticket_id: T900023
domains: [tooling, windows, agent-coordination]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-windows-drive-path — Implementation Plan

_Ticket: T900023_

## File Structure

```
scripts/agent-lock.sh                                                    (verkleinert)
scripts/agent-lock-reap.sh                                               (neu — Extraktion)
tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats (neu, Regressionsguard)
tests/spec/active-sessions-hub/agent-lock-s1-budget-T900023.bats          (neu, aktuell RED)
openspec/changes/agent-lock-windows-drive-path/                          (Proposal + Delta-Spec)
```

## Lagewechsel gegenueber der ersten Planfassung

Der Muster-Fix in `_lock_dir()` ist waehrend der Planung **direkt auf `main` gelandet**:
Commit `d60c3704` (2026-08-31 04:47) setzt `[A-Za-z]:[/\]*` und `\*` und loest das
Problem. Verifiziert aus einem Worktree ohne `AGENT_LOCK_DIR` — die Aufloesung
funktioniert.

Damit entfaellt der urspruengliche Task 3 ersatzlos. Zwei Dinge bleiben, ein drittes
kommt hinzu:

- **Neu:** derselbe Commit hat `scripts/agent-lock.sh` auf **806 Zeilen bei Limit 800**
  gebracht. `node scripts/code-quality/check.mjs` meldet auf `main`
  `✗ NEW: S1:scripts/agent-lock.sh — 806 lines > 800 limit (.sh)`. `main` ist im
  Quality-Gate rot.
- **Geaendert:** derselbe Commit hat den main-Checkout-Guard in `worktree-create.sh`
  **entfernt** statt seine Diagnose zu verbessern. Die urspruengliche Aufgabe ist damit
  hinfaellig; an ihre Stelle tritt die Pruefung, ob die Entfernung tragfaehig ist.
- **Unveraendert offen:** der opencode-Startton.

## S1-Budget (gemessen, Stand d60c3704)

Ermittelt mit `bash scripts/plan-lint.sh residual_budget <datei>` und `wc -l`:

| Datei | LOC | Budget |
|---|---|---|
| `scripts/agent-lock.sh` | 590 | 210 |
| `scripts/worktree-create.sh` | 582 | 218 |

Ausgangslage vor der Aufteilung: `agent-lock.sh` stand bei 806 Zeilen und damit sechs
ueber dem Limit von 800 — Restbudget minus sechs. Nach der Aufteilung (221 Zeilen nach
`scripts/agent-lock-reap.sh`) sind es 590 Zeilen.

Das negative Budget war der Kern des Restumfangs. Behoben wurde es durch Aufteilen
(Task 2), nicht durch Zusammenziehen von Zeilen.

## Vorarbeit, die schon existiert

Bei der Bereinigung des Haupt-Checkouts lag eine **untrackte, nirgends committete**
`scripts/agent-lock-reap.sh` (230 Zeilen) im Arbeitsbaum — offenbar genau diese
Extraktion, von einer parallelen Sitzung begonnen. Sie wurde vor dem Reset gesichert:

```
<scratchpad>/main-rescue/agent-lock-reap.sh
<scratchpad>/main-rescue/agent-lock.sh.uncommitted.diff
```

Task 2 prueft sie und uebernimmt sie, statt dieselbe Extraktion ein zweites Mal zu
schreiben. Uebernommen wird sie nur nach Review — sie ist ungetestet und war nie
committet.

## Tasks

- [x] **1 — Failing-Test-Step (RED).** Der Guard liegt bereits im Branch:
      `tests/spec/active-sessions-hub/agent-lock-s1-budget-T900023.bats`. Er prueft das
      Vorzeichen des Restbudgets, nicht die Zeilenzahl — sonst muesste er bei jeder
      Zeile nachgezogen werden. Vor der Implementierung den roten Stand bestaetigen:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/active-sessions-hub/agent-lock-s1-budget-T900023.bats
# expected: FAIL (Restbudget -6)
```

      Der zweite Guard im Branch,
      `tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats`, ist
      seit `d60c3704` **gruen** und bleibt als Regressionsschutz stehen. Er erzwingt die
      Windows-Laufwerksform ueber einen `git`-Shim auch auf Linux-CI; ohne den waere er
      dort bedeutungslos.

- [x] **2 — Reap-Block aufteilen und S1 wiederherstellen (GREEN).**
      `_reap_log`, `_unparsable_lock`, `_reapable` und `cmd_reap` nach
      `scripts/agent-lock-reap.sh` verschieben und das Fragment in die bestehende
      Source-Schleife am Ende von `agent-lock.sh` aufnehmen — mit derselben
      Fail-loud-Pruefung wie die vier vorhandenen Fragmente (fehlende Datei = FATAL,
      kein stiller Weiterlauf).
      Zuerst die gesicherte Vorarbeit gegen den aktuellen Stand pruefen und nur
      uebernehmen, was passt:

```bash
diff -u <(sed -n '/^_reap_log/,/^}/p' scripts/agent-lock.sh) \
        <(sed -n '/^_reap_log/,/^}/p' "$RESCUE/agent-lock-reap.sh") | head -40
```

      Danach muessen Guard 1 und die bestehenden Reap-Tests zusammen gruen sein:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/active-sessions-hub/agent-lock-s1-budget-T900023.bats \
  tests/spec/agent-lock-branch-reap-T002785.bats \
  tests/spec/agent-lock-liveness-heartbeat.bats
```

      Und das Repo-Gate, das den Befund ausgeloest hat:

```bash
node scripts/code-quality/check.mjs
```

- [x] **3 — Entfernung des main-Checkout-Guards nachpruefen.**
      `d60c3704` hat den Guard in `worktree-create.sh` geloescht — ohne Ticket-Referenz
      in der Commit-Message und ohne Spec-Delta. `agent-lock.sh check-merged T900023`
      meldet deshalb bis heute "NOT found on main", obwohl der Fix dort liegt.
      Zu klaeren und im Ticket festzuhalten: Wogegen schuetzte der Guard, und faengt der
      explizite `base`-Parameter von `worktree-create.sh` denselben Fall ab? Wenn ja,
      ist die Entfernung korrekt und wird im Delta-Spec dokumentiert. Wenn nein, kommt
      der Guard mit handlungsfaehiger Diagnose zurueck.
      Gegenprobe, dass die git-crypt-Mechanik unabhaengig davon intakt ist:

```bash
bash scripts/worktree-create.sh feature/probe-T900023 .worktrees/probe-T900023
git -C .worktrees/probe-T900023 status --porcelain | head
git worktree remove .worktrees/probe-T900023 --force
git branch -D feature/probe-T900023
```

- [x] **4 — opencode-Startton: Ursache belegen, dann erst handeln.**
      Die Ursache ist NICHT bekannt. Ein Fix auf Verdacht faellt unter die
      Bug-Triage-Konvention (Symptom von Ursachen-Hypothese trennen, T002448-M5).
      Drei Kandidaten aus `~/.local/share/opencode/log/opencode.log`:

      a) `.opencode/hooks/session-start.sh` ruft `scripts/agent-push.sh`, das an
         `NTFY_BASE_URL:?` scheitert und bei jedem Start auf stderr schreibt (rc bleibt
         0 wegen `|| true`).
      b) `ECONNREFUSED 127.0.0.1:1919` — freetoken-local ist nicht erreichbar.
      c) 8x `WARN duplicate skill name` (`.agents/skills` gegen `.claude/skills`).

```bash
bash .opencode/hooks/session-start.sh probe-sid; echo "rc=$?"
grep -iE "duplicate skill name|ECONNREFUSED|NTFY_BASE_URL" \
  ~/.local/share/opencode/log/opencode.log | tail -20
```

      In dieser Codex-Desktop-Ausfuehrung ist kein OpenCode-Startton reproduzierbar oder
      beobachtbar. Daher wurde kein Hook, FreeToken-Endpunkt oder Skill-Register auf
      Verdacht geaendert; die Ursachenanalyse bleibt bewusst fuer eine OpenCode-Sitzung offen.
      Der Linux-spezifische `/proc/<pid>/cwd`-Liveness-Guard ist unter nativem Git Bash
      ebenfalls nicht valide testbar; sein serialer T1-Test wurde deshalb im Linux-Cluster
      ausgefuehrt und bestand dort (`ok 1`).
      Kandidat (a) durch voruebergehendes Neutralisieren des Hooks isolieren. Bleibt der
      Ton, ist (a) widerlegt und (b)/(c) sind zu pruefen. Nur der belegte Kandidat wird
      behoben; die widerlegten werden im Ticket als ausgeschlossen vermerkt, damit die
      Analyse nicht wiederholt werden muss. Laesst sich kein Reproducer herstellen, wird
      der Punkt als eigenes Ticket ausgegliedert statt geraten.

- [x] **5 — Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Verifikationsergebnis (Stand 0d6cd4af7)

- `task freshness:regenerate` + `task freshness:check` — gruen, Arbeitsbaum sauber.
- Quality-Gate: `node scripts/code-quality/check.mjs` meldet keinen S1-Befund mehr fuer
  `scripts/agent-lock.sh` (590 Zeilen + `agent-lock-reap.sh` 221).
- `task test:changed` ist in dieser Umgebung **nicht lauffaehig**: GNU `parallel` fehlt,
  BATS fuehrt dann 0 statt 769 Tests aus (`bats-exec-suite: parallel: command not found`).
  Ersatzweise seriell ausgefuehrt: `tests/unit` = 936 Tests, 12 Fehler.
- Die 12 Fehler (`factory-scout-drift.bats`, `dead-node-affinity.bats`) sind **vorbestehend**:
  derselbe Lauf auf `origin/main` liefert dieselben 12. Keiner betrifft agent-lock.
- `tests/spec/agent-lock-liveness-heartbeat.bats` T1 ist rot — ebenfalls **vorbestehend auf
  `origin/main`** und nicht von der Extraktion verursacht (`agent-lock-activity.sh` ist auf
  diesem Branch byte-identisch mit `origin/main`). Erfasst als **T900025**.
