---
ticket_id: T003078
plan_ref: openspec/changes/no-unasked-stash-T003078/tasks.md
status: active
date: 2026-08-10
---

# Design: no-unasked-stash-T003078

_Ticket: T003078, T003097_

## Goals

- `git stash` auf dem Haupt-Checkout darf nicht ausgeführt werden, solange ein fremder
  Agent-Prozess dort mit uncommitteten Änderungen arbeitet — an BEIDEN betroffenen Stellen
  (`dev-flow-chore/SKILL.md` Schritt 0, `scripts/worktree-create.sh` Divergence-Guard).
- Ein Kriterium für "fremder Prozess arbeitet hier", das in einem Wegwerf-Repo/Test
  reproduzierbar und ohne DB/Netzwerk auswertbar ist.
- Bestehende Absicherungen (T002673 gegen den eigenen fehlgeschlagenen `stash pop`) bleiben
  unangetastet.

## Non-Goals

- Kein neuer globaler Locking-Mechanismus — der bestehende `main-checkout`-Lock
  (`active-sessions-hub.md`) wird nicht erweitert, nur als unzureichend für DIESEN Zweck
  dokumentiert (er greift erst ab dem ersten Commit einer Session, T003098).
- Kein Eingriff in den "wirklich divergiert"-Fehlerfall des Divergence-Guards.
- Keine Änderung am Verhalten, wenn der Arbeitsbaum sauber ist oder kein fremder Prozess
  läuft — beide Fälle bleiben exakt wie vorher (Regressionsschutz-Szenarien in den
  Delta-Specs).

## Decisions

### Erkennungskriterium: `ps`-Prozessliste (cwd-Zuordnung) + dirty-Check — nicht Datei-mtimes, nicht agent-lock allein

**Optionen geprüft:**

1. `agent-lock.sh list` — **verworfen.** T003098 belegt am selben Vorfall: eine Session ist
   bis zu ihrem ersten Commit unsichtbar (`_self_claim_main_checkout` läuft im
   Pre-Commit-Hook). Der Guard müsste genau in dem Fenster greifen, in dem eine fremde
   Session aktiv, aber noch uncommittet ist — exakt das Fenster, das `agent-lock.sh list`
   nicht sieht.
2. Datei-mtimes allein — **verworfen.** Mehrdeutig: ein `git pull`/`checkout` der EIGENEN
   Session ändert ebenfalls mtimes. Ohne Prozess-Zuordnung lässt sich "fremd" nicht von
   "gerade selbst gemacht" unterscheiden.
3. `ps`-Prozessliste mit `cwd`-Zuordnung (`/proc/<pid>/cwd`) auf `claude`/`opencode`-Prozesse
   außerhalb der eigenen PID/Parent-Kette, kombiniert mit `git status --porcelain`
   (dirty-Check) — **gewählt.** Beide Signale sind in der Beobachtung (T003055) tatsächlich
   vorhanden gewesen (drei fremde PIDs mit passendem `cwd`, sieben uncommittete Dateien) und
   sind ohne DB/Netzwerk, rein aus `/proc`, deterministisch auswertbar — genau das macht sie
   in einem BATS-Wegwerf-Repo simulierbar (ein Hintergrundprozess mit `cwd` im Test-Repo).
   `agent-lock.sh` selbst nutzt bereits `/proc/<pid>/cwd`-Lookups für den `reap`-Befehl
   (`scripts/agent-lock.sh` Zeile ~555) — dasselbe Muster wird hier wiederverwendet statt neu
   erfunden.

**Warum beide Signale UND, nicht ODER:** Ein dirty Arbeitsbaum allein ist der Normalfall
eigener WIP-Arbeit — würde er allein genügen, würde der Guard ständig unnötig überspringen.
Ein fremder `claude`/`opencode`-Prozess mit `cwd` im Haupt-Checkout allein kann eine reine
Lese-Session sein (z.B. `agent-lock.sh list`, `git log`) ohne echte Kollisionsgefahr. Erst
die Kombination — fremder Prozess UND uncommittete Änderungen — begründet die Annahme, dass
ein Stash reale fremde Arbeit gefährdet.

### Geteilte Implementierung statt Duplikation

Beide Stellen (`worktree-create.sh`, `dev-flow-chore/SKILL.md` Schritt 0) rufen dieselbe
Bibliotheksfunktion `scripts/lib/main-checkout-foreign-guard.sh:mc_foreign_activity_detected`
auf, statt die Logik zweimal zu implementieren. `worktree-create.sh` sourct sie direkt;
`dev-flow-chore/SKILL.md` Schritt 0 ruft sie über den in der Skill-Datei dokumentierten
Bash-Block auf (die Skill-Datei ist Prosa/Dokumentation, kein ausführbares Skript — der
Guard-Aufruf steht als Kommando im Codeblock, den der ausführende Agent befolgt).

## Trade-offs

- Der `ps`-basierte Check erkennt nur `claude`/`opencode`-Prozessnamen — ein Agent unter
  anderem Namen (z.B. ein zukünftiges drittes Harness) würde nicht erkannt. Akzeptiert: die
  beiden Namen decken alle in diesem Repo aktiven Harnesses ab (siehe CLAUDE.md
  Agent-Routing); eine Erweiterung der Namensliste ist ein späterer, unabhängiger Vorgang.
- Der Guard kann ein False Negative liefern, wenn der fremde Prozess in einer anderen
  PID-Namespace läuft (z.B. Container) — `/proc/<pid>/cwd` wäre dann nicht sichtbar. Für
  dieses Repo (alle Agent-Sessions laufen als native WSL-Prozesse) ist das kein praktisches
  Risiko.
