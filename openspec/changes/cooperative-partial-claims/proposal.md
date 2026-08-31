# Proposal: cooperative-partial-claims

## Why

Ein Claim deckt heute den **ganzen Worktree**. `scripts/hooks/worktree-write-guard.sh`
lehnt jeden Schreibzugriff ab, sobald ein fremder lebender Claim den Pfad deckt. Folge:
eine zweite Session kann in einem Worktree nichts tun — auch dann nicht, wenn sie ein
voellig anderes Partial bearbeiten wuerde, das die erste Session gar nicht angefasst hat.

Das ist strenger als noetig. `scripts/plan-lint.sh` erzwingt bereits (Regel D1), dass
keine Datei in zwei Partials liegt; das `## Partials`-Manifest fuehrt `target_files` pro
Partial (plan-lint.sh:245-287). Die Nicht-Ueberschneidung ist also schon maschinell
garantiert — die Sperrflaeche ist trotzdem der ganze Baum.

**Bestehende Entscheidung, die verfeinert und NICHT ersetzt wird.**
`worktree-write-guard.sh:5-24` begruendet "blockierend statt warnend" mit zwei realen
Vorfaellen:

- T002355-M3: eine zweite Session schrieb ohne Claim im selben Worktree dieselben
  Dateien; `tasks.md` wuchs zwischen Read und Write von 45 auf 260 Zeilen. Es ging
  nichts verloren, weil die fremde Session die Artefakte zufaellig aufgriff statt sie
  zu ersetzen — Glueck, keine Absicherung.
- T002357-M1: `cd` wirkt nur auf Bash, nicht auf Write/Edit. Ein zu Sessionbeginn
  korrekter absoluter Pfad bleibt syntaktisch gueltig und trifft still die falsche
  Arbeitskopie.

Der Ueberschreib-Schutz bleibt deshalb bestehen. Was schrumpft, ist allein die
Sperrflaeche: von "ganzer Worktree" auf "die Dateien meines Partials".

**Zweiter Befund — der Guard gilt nicht ueberall.** `worktree-write-guard.sh` ist in
`.claude/settings.json` und `.codex/hooks.json` registriert, aber weder in opencode
noch in agy (`.agy/hooks.json` kennt `agent-lock`, nicht den Guard). Und die
Git-Workflow-SSOT existiert zweimal unabhaengig — `.claude/skills/git-workflow/SKILL.md`
(321 Zeilen) gegen `.opencode/skills/opencode-git-workflow/SKILL.md` (319 Zeilen) — mit
inhaltlicher Drift; die Claude-Code-Kopie zitiert `T069/T070`, wo die opencode-Kopie
`T003069/T003070` nennt. Gleicher Workflow, zwei Wahrheiten.

## What

1. Claim-Scope `partial`: ein Claim traegt die `target_files` seines Partials.
   Scopes sind freie Strings (`cmd_claim`, agent-lock.sh:408) — kein Enum zu erweitern.
2. `worktree-write-guard.sh` entscheidet gegen die Dateiliste des fremden Claims statt
   gegen dessen Worktree-Pfad. Ohne Dateiliste bleibt das heutige Worktree-Verhalten.
3. Der Guard wird in allen vier Harnesses registriert (Claude Code, Codex, opencode, agy).
4. Die Git-Workflow-SSOT wird entdoppelt: eine Quelle, die opencode-Variante als
   Verweis statt als Kopie — Vorbild ist die bereits bestehende Directory-Symlink-Loesung
   der `dev-flow-*`-Skills (T014086).
5. Audit der Schritt-REIHENFOLGE (pull-first, freshness-Guard, Commit-Verifikation,
   PR-Scope-Preflight, CI-Fix-Loop, Auto-Merge, Cleanup) je Harness; Abweichungen
   werden behoben.

Blockiert von T900023: ohne den Windows-Pfad-Fix in `_lock_dir()` findet das
Claim-System unter Windows sein Verzeichnis nicht, und jede Partial-Claim-Logik
liefe ins Leere.

_Ticket: T900024_
