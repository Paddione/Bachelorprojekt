---
title: "agent-lock-sid-detection-T003110 — Implementation Plan"
ticket_id: T003110
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-sid-detection-T003110 — Implementation Plan

_Tickets: T003110 (führend), T002826, T003098_

Ursachen, Reproducer und die Begründung jeder Entscheidung stehen in
`openspec/changes/agent-lock-sid-detection-T003110/design.md`. Die Hypothese aus T003110
(`_my_sid()` löse in Worktrees anders auf) ist dort **widerlegt** — wer sie erneut verfolgt,
verliert Zeit an der falschen Stelle.

## File Structure

```
scripts/agent-lock.sh                  (geändert: _lock_is_mine, claim-Verifikation, activity-Dispatch)
scripts/agent-lock-activity.sh         (NEU: cmd_activity als ge-source-tes Fragment)
scripts/agent-lock-identity.sh         (unverändert — hier liegt NICHT die Ursache)
scripts/vda/ticket/_ticket-core.sh     (geändert: _ticket_lock_guard fragt agent-lock.sh mine)
.claude/skills/references/session-coordination.md  (geändert: Sichtbarkeitslücke + activity)
.claude/skills/dev-flow-chore/SKILL.md (geändert: Vorab-Check Schritt 1)
tests/spec/active-sessions-hub/claim-persistence-verified-T002826.bats      (liegt vor, RED)
tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats  (liegt vor, RED)
tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats     (liegt vor, RED)
```

S1-Budget (`.sh`-Limit 800, keine Baseline-Einträge für diese Dateien):
`scripts/agent-lock.sh` 633 → erwartet ~670; `scripts/vda/ticket/_ticket-core.sh` 209 →
erwartet ~215; `scripts/agent-lock-activity.sh` neu, ~60. `cmd_activity` liegt als eigenes
Fragment neben `agent-lock-guards.sh`/`-merged.sh`/`-identity.sh`, weil `agent-lock.sh` genau
aus diesem Grund schon dreimal geteilt wurde.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die drei BATS-Dateien liegen bereits im Branch und
      reproduzieren die Befunde. Vor jeder Codeänderung ausführen und den roten Stand
      bestätigen — er ist die Messlatte für alles Folgende. Erwartet sind genau **fünf**
      Fehlschläge; `check still reports a foreign worktree's lock as held` ist bereits grün
      und MUSS grün bleiben (es sichert ab, dass Task 2 das Prädikat nicht zu weit lockert).

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/active-sessions-hub/
# expected: FAIL (rot — 5 Fehlschläge, der Fix ist noch nicht implementiert)
```

- [ ] **Task 1 — `claim` verifiziert seine Persistenz (T002826).**
      In `cmd_claim` (`scripts/agent-lock.sh`) das abschließende
      `CREATED="$(_now)"; _write_lock "$f"; return 0` ersetzen: nach `_write_lock` prüfen,
      dass `$f` existiert und `_lock_field "$f" owner_sid` gleich `$(_my_sid)` ist. Schlägt
      das fehl, eine Meldung auf stderr (Pfad + Grund) und `return 4`. Denselben Nachweis für
      den Refresh-Zweig weiter oben führen (`CREATED=…; _write_lock "$f"; return 0` beim
      SID-Match). In `_lock_dir()` beide `/tmp/agent-locks`-Rückfälle um eine stderr-Zeile
      ergänzen, die den Fallback-Pfad nennt. Der Fallback selbst bleibt erlaubt.
      Exit 4 ist neu und kollidiert mit keinem bestehenden Code (0/1/2/3 sind vergeben);
      bestehende Aufrufer prüfen auf „ungleich 0" und bleiben korrekt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/claim-persistence-verified-T002826.bats
```

- [ ] **Task 2 — Ein cwd-unabhängiges Ownership-Prädikat (T003110).**
      `_lock_is_mine() { # <lock-file>` in `scripts/agent-lock.sh` einführen: 0, wenn
      `owner_sid` == `$(_my_sid)`; sonst 0, wenn das Feld `worktree` gesetzt (und nicht `-`)
      ist **und** der aufrufende Arbeitsbaum derselbe ist. Letzteres über den Git-Toplevel des
      cwd (`git rev-parse --show-toplevel`) und zusätzlich über Pfad-Containment
      (`$PWD` == `worktree` oder `$PWD` beginnt mit `worktree/`), damit auch ein cwd ohne
      Git-Auflösung korrekt entschieden wird. Sonst 1.
      Danach `cmd_check` auf das Prädikat umstellen (die bisherige `my_wt`/`lock_wt`-Passage
      entfällt) und ebenso die SID-Vergleiche in `cmd_release`, `cmd_refresh` und der
      Vorprüfung in `cmd_check_and_claim`. `cmd_release`s Zusatzregel (fremder **toter** Owner
      darf freigegeben werden) und `_reapable()` bleiben unverändert — die Reap-Logik ist
      nicht Gegenstand dieses Vorgangs.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats
```

- [ ] **Task 3 — `_ticket_lock_guard` fragt statt nachzubauen (T003110).**
      In `scripts/vda/ticket/_ticket-core.sh` die Zeile
      `my_sid="${CLAUDE_CODE_SESSION_ID:-${CLAUDE_SESSION_ID:-}}"` durch
      `my_sid="$(bash "$lock_sh" mine 2>/dev/null)"` ersetzen. Die vorhandene
      Env-Durchreichung an den `check`-Aufruf bleibt bestehen. Den Kommentarblock darüber um
      den Grund ergänzen: die private Namensliste kannte `AGENT_LOCK_SID` und
      `OPENCODE_SESSION_ID` nicht, obwohl `openspec/specs/active-sessions-hub.md`
      („Harness-Stable Session Identity") sie verbindlich führt — dieselbe Duplikations-Falle,
      vor der der T002424-Kommentar direkt darüber bereits warnt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats
```

- [ ] **Task 4 — `agent-lock.sh activity` (T003098).**
      Neues Fragment `scripts/agent-lock-activity.sh` mit `cmd_activity`, eingebunden über die
      bestehende Loader-Schleife am Dateiende von `agent-lock.sh` (Liste
      `agent-lock-identity.sh agent-lock-guards.sh agent-lock-merged.sh` erweitern) und in
      `main()` als `activity) cmd_activity "$@";;` dispatcht. Verhalten: erst die Claims wie
      `cmd_list`, danach ein Abschnitt mit den laufenden Prozessen, deren `cwd`
      (`readlink /proc/<pid>/cwd`) unterhalb des Haupt-Checkouts oder eines verknüpften
      Worktrees liegt — Wurzelmenge aus `git worktree list --porcelain` plus dem Elternpfad
      des `git-common-dir`. Der eigene Prozess und dessen Elternprozess werden ausgeschlossen,
      sonst meldete der Befehl immer sich selbst und könnte nie „niemand arbeitet hier"
      antworten. Pro Zeile pid, cwd und – falls vorhanden – der Prozessname. Immer Exit 0;
      `/proc`-Leseabbrüche (Prozess endet während des Laufs) werden übersprungen, nicht
      gemeldet. `cmd_list` und dessen Ausgabeformat bleiben unangetastet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats
```

- [ ] **Task 5 — Die Lücke dort dokumentieren, wo sie zuschlägt.**
      In `.claude/skills/references/session-coordination.md` einen Absatz ergänzen: der
      `main-checkout`-Claim entsteht im pre-commit-Hook, also erst ab dem ersten Commit einer
      Session; eine leere Claim-Liste beweist deshalb **nicht**, dass niemand arbeitet — für
      diese Frage `agent-lock.sh activity` verwenden. In `.claude/skills/dev-flow-chore/SKILL.md`
      den Vorab-Check in Schritt 1 (Zeile mit `agent-lock.sh list`) auf `activity` umstellen
      und den Hinweis danebenstellen. Keine Verhaltensänderung an den Skills darüber hinaus.

- [ ] **Final Verification.** Die drei Pflicht-Gates plus der vollständige Spec-Lauf über
      **beide** Formen (Sammeldatei und Verzeichnis, T002696), weil `active-sessions-hub`
      beides besitzt:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/active-sessions-hub*
task test:changed
task freshness:regenerate
task freshness:check
```
