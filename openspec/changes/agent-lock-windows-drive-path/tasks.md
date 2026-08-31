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
scripts/agent-lock.sh                                                    (geaendert, verkleinert)
scripts/agent-lock-reap.sh                                               (neu — Extraktion)
scripts/worktree-create.sh                                               (geaendert)
tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats (neu, bereits RED)
openspec/changes/agent-lock-windows-drive-path/                          (Proposal + Delta-Spec)
```

## S1-Budget (gemessen, Stand 8e54c8695)

Ermittelt mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh _ext_limit <datei>`
und `wc -l`:

| Datei | LOC | Budget |
|---|---|---|
| `scripts/agent-lock.sh` | 800 | 0 |
| `scripts/worktree-create.sh` | 593 | 207 |

Limit ist in beiden Faellen 800, eine S1-Baseline existiert fuer keine der Dateien.
Die Testdatei traegt kein S1-Limit.

`scripts/agent-lock.sh` sitzt exakt auf dem Limit. Jede hinzugefuegte Zeile bricht S1.
Deshalb ist Task 2 ein echter Extraktionsschritt, kein Zusammenziehen von Zeilen —
Vorbild ist die bereits bestehende Fragment-Aufteilung (`agent-lock-identity.sh` 88,
`agent-lock-guards.sh` 70, `agent-lock-merged.sh` 54, `agent-lock-activity.sh` 188).

## Tasks

- [ ] **1 — Failing-Test-Step (RED).** Der Guard existiert bereits im Branch:
      `tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats`.
      Er erzwingt ueber einen `git`-Shim die Windows-Laufwerksform auch auf Linux-CI;
      ohne den Shim waere er dort dauerhaft gruen und wuerde nichts schuetzen.
      Vor der Implementierung erneut ausfuehren und den roten Stand bestaetigen:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats
# expected: FAIL (2 von 2 — der Fix ist noch nicht implementiert)
```

- [ ] **2 — S1-Luft schaffen durch Extraktion.** `scripts/agent-lock.sh` hat Budget 0.
      Den Reap-Block in ein neues Fragment `scripts/agent-lock-reap.sh` verschieben:
      `_reap_log` (Zeile 142), `_unparsable_lock` (159), `_reapable` (169) und
      `cmd_reap` (694). Das Fragment in die bestehende Source-Schleife am Ende von
      `agent-lock.sh` aufnehmen — dieselbe Fail-loud-Pruefung wie die vier vorhandenen
      Fragmente (fehlende Datei = FATAL, kein stiller Weiterlauf).
      Danach messen, dass Luft entstanden ist:

```bash
wc -l scripts/agent-lock.sh scripts/agent-lock-reap.sh
PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh _ext_limit scripts/agent-lock.sh
```

      Verhalten darf sich nicht aendern — die bestehenden Reap-Tests belegen das:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-branch-reap-T002785.bats \
  tests/spec/agent-lock-liveness-heartbeat.bats
```

- [ ] **3 — Fix-Step (GREEN): Laufwerkspfade als absolut erkennen.**
      In `_lock_dir()` (scripts/agent-lock.sh:126) das Muster so erweitern, dass neben
      `/*` auch `[A-Za-z]:/*` und `[A-Za-z]:\*` als absolut gelten. Nur ein wirklich
      relativer Pfad wird weiterhin gegen `$toplevel` aufgeloest.

      Nicht verwenden: `git rev-parse --path-format=absolute --git-common-dir`. Gemessen
      mit git 2.55.0.windows.5 liefert auch das `C:/…` ohne fuehrenden Slash — das
      Muster-Problem bleibt bestehen.

      Der Guard aus Task 1 muss jetzt gruen sein:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats
```

      Und der reale Fall, der das Ticket ausgeloest hat, ohne Workaround:

```bash
cd "$(git rev-parse --show-toplevel)/.worktrees/agent-lock-win-T900023"
env -u AGENT_LOCK_DIR bash ../../scripts/agent-lock.sh list
```

- [ ] **4 — worktree-create.sh: Ausweg benennen statt nur blockieren.**
      Die main-Guard-Meldung (scripts/worktree-create.sh:68 und :210) nennt `--unattended`
      und dessen Bedingung (Allowlist ueber `branch_is_ticketless`). Der Guard selbst
      bleibt unveraendert — nur die Diagnose wird handlungsfaehig.
      Gegenprobe, dass die Verweigerung bestehen bleibt und die Meldung den Ausweg nennt:

```bash
git -C . switch -c tmp/guard-probe-T900023
bash scripts/worktree-create.sh feature/probe-T900023 .worktrees/probe-T900023 2>&1 \
  | grep -- --unattended
git -C . switch - && git -C . branch -D tmp/guard-probe-T900023
```

- [ ] **5 — opencode-Startton: Ursache belegen, dann erst handeln.**
      Die Ursache ist NICHT bekannt. Zuerst reproduzieren, dann entscheiden — ein Fix auf
      Verdacht faellt unter die Bug-Triage-Konvention (Symptom von Ursachen-Hypothese
      trennen, T002448-M5). Drei Kandidaten aus `~/.local/share/opencode/log/opencode.log`:

      a) `.opencode/hooks/session-start.sh` ruft `scripts/agent-push.sh`, das an
         `NTFY_BASE_URL:?` scheitert und bei jedem Start auf stderr schreibt (rc bleibt 0
         wegen `|| true`).
      b) `ECONNREFUSED 127.0.0.1:1919` — freetoken-local ist nicht erreichbar.
      c) 8x `WARN duplicate skill name` (`.agents/skills` gegen `.claude/skills`).

      Kandidat (a) isolieren, indem der Hook voruebergehend neutralisiert und opencode
      neu gestartet wird:

```bash
bash .opencode/hooks/session-start.sh probe-sid; echo "rc=$?"
grep -iE "duplicate skill name|ECONNREFUSED|NTFY_BASE_URL" \
  ~/.local/share/opencode/log/opencode.log | tail -20
```

      Bleibt der Ton nach Neutralisieren von (a) bestehen, ist (a) widerlegt und (b)/(c)
      sind zu pruefen. Nur der belegte Kandidat wird behoben; die widerlegten werden im
      Ticket als ausgeschlossen vermerkt, damit die Analyse nicht wiederholt wird.
      Laesst sich in dieser Umgebung kein Reproducer herstellen, wird der Punkt als
      eigenes Ticket ausgegliedert statt geraten.

- [ ] **6 — Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
