# Proposal: runtime-drift-auto-kill

## Why

**Symptom (Fakt, reproduzierbar):** `scripts/runtime-drift-check.sh` (T003825) meldet seit
2026-08-14 wiederholt Drift-Befunde für `/usr/local/bin/mcp-task-runner`: Prozesse laufen mit
ersetzter (deleted)-Binary — `/proc/<pid>/exe` zeigt auf eine gelöschte Inode. Gemeldete PIDs:
2201282 und 3857812 (ursprünglicher Befund), nach Neustart weiterhin aktuell (PID 2029929).
Der Zustand ist reproduzierbar: der Bestandstest
`tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats` erzeugt den (deleted)-Zustand
echt (Wegwerf-Binary starten, Datei löschen, `readlink /proc/<pid>/exe` prüfen).

**Root-Cause (belegt, keine Hypothese):** Ein laufender Prozess hält sein Executable über den
offenen Inode-Handle. Wird die Datei auf der Platte ersetzt (Update/Deploy von
`/usr/local/bin/mcp-task-runner`), läuft der Prozess mit der alten Inode weiter — ein gemergter
Fix/Deploy wirkt nicht, solange der alte Prozess lebt. Der Guard erkennt diesen Zustand korrekt
(Prüfer 1) und nennt die Abhilfe (`kill $pid; der Server startet beim naechsten Tool-Aufruf neu`),
aber die Heilung ist **manuell** — sie bleibt Operator-Entscheidung. Das ist keine Fehlfunktion
des Guards (er meldet richtig), sondern eine Produktlücke: der dokumentierte Abhilfe-Befehl wird
nicht automatisiert.

**User-Entscheidung (Klärungsrunde 2026-08-14):** Auto-Heilung bauen —
`scripts/runtime-drift-check.sh` erhält einen opt-in Auto-Kill-Modus (`--auto-kill`), statt
manueller Operator-Kills.

## What

Der Guard erweitert sich um ein `--auto-kill`-Flag. Ohne Flag bleibt alles unverändert
(meldend, read-only, Exit 1 bei Drift). Mit `--auto-kill` beendet er driftende Prozesse, die
gegen eine **registrierte stdio-Binary der eigenen MCP-Registry** matchen (SIGTERM), verifiziert
das Beenden, und meldet geheilt/ungeheilt. DB-Drift wird bewusst NICHT auto-geheilt (Migrationen
anwenden bliebe Operator-Entscheidung).

### Prior-Art (Skill Schritt 0.7 — zitiert statt umgangen)

Bestehende SSOT-Entscheidungen in `openspec/specs/batch-repo-hygiene-ops-fixes.md`:

1. **"Runtime drift detection for replaced MCP server binaries"** (Z. 92-129): „The system SHALL
   detect MCP server processes that execute a binary which has since been replaced on disk, and
   SHALL report each such process **without terminating it**. … Terminating the process is an
   operator decision, so the check reports and names the remedy instead of acting."
   → Wird MODIFIZIERT: der Report-and-name-Modus bleibt der Default; `--auto-kill` automatisiert
   genau die im Report genannte Abhilfe für Prozesse der eigenen Registry.
2. **"Drift check never modifies system state"** (Z. 174-190): „The drift check SHALL be
   read-only. It SHALL NOT terminate processes, apply migrations, write to the database, or
   modify files."
   → Wird MODIFIZIERT: gilt unverändert für den Default; mit explizitem `--auto-kill` ist das
   Beenden registrierter Drift-Prozesse die dokumentierte Ausnahme. Das geht über ein
   **MODIFIED-Delta** auf den SSOT-Spec (siehe `specs/batch-repo-hygiene-ops-fixes.md`), nicht
   durch stilles Danebenschreiben.
3. Bestandstest `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats` — Test
   „Guard beendet den driftenden Prozess NICHT" bleibt gültig und grün: ohne `--auto-kill` greift
   der Guard weiterhin nicht ein (Positiv-Anker-Vorsatz bleibt erhalten).

### Design-Entscheidungen (Brainstorming, schriftlich — kein Lavish-Board)

1. **Flag statt Default-Verhaltensänderung:** `--auto-kill` ist opt-in. Ohne Flag bleibt der
   Guard meldend und read-only — kein Test, kein Aufrufer (repo-hygiene, task test:changed)
   ändert sein Verhalten.
2. **Sicherheitsgrenze — nur eigene Registry-Prozesse:** Kill-Kandidaten sind ausschließlich
   Prozesse, deren `/proc/<pid>/exe` gegen eine registrierte stdio-Binary der eigenen
   MCP-Registry matcht (`docs/agent-guide/registry/mcp.yaml`, Override
   `RUNTIME_DRIFT_REGISTRY`). Das ist strukturell gegeben: `_check_binary` iteriert nur über
   registrierte Binaries — ein Fremdprozess ist per Konstruktion nie Kandidat, es gibt keinen
   „kill alle mit deleted-exe"-Pfad.
3. **Beide Drift-Signale werden geheilt:** deleted-Inode und sha256-Mismatch sind beides „läuft
   mit ersetzter Binary"; der Auto-Kill führt exakt die dokumentierte Operator-Aktion aus
   (`kill $pid; der Server startet beim naechsten Tool-Aufruf neu`).
4. **SIGTERM + Verifikation:** sanfter SIGTERM (wie der dokumentierte Operator-Befehl), danach
   Poll, ob der Prozess weg ist (`kill -0`). Überlebt er: Befund „nicht beendet" → residualer
   Drift.
5. **Exit-Semantik:** Mit `--auto-kill` zählen erfolgreich beendete Prozesse nicht mehr als
   residualer Drift (Exit 0, wenn alles geheilt); unheilbare Befunde (DB-Funktionen,
   fehlgeschlagener Kill) → Exit 1. Begründung: der Guard läuft im lokalen Testloop
   (`task test:changed`, `openspec/specs/e2e-test-infrastructure.md` Z. 565); nach erfolgreicher
   Heilung soll der Lauf grün sein. Ohne Flag: unverändert.
6. **DB-Drift bleibt meldend:** Migrationen anwenden wäre ein Eingriff in die Datenbank —
   außerhalb des Auftrags („Auto-Kill-Modus"), bleibt Operator-Entscheidung.
7. **Unbekannte Argumente → Exit 2:** Heute ignoriert das Skript `$@` still. Mit Arg-Parsing
   wird ein unbekanntes Flag ein Fehler (Usage + Exit 2) — kein stilles Ignorieren.
8. **Neustart-Semantik (dokumentiert):** Beendete stdio-Server starten beim nächsten
   Tool-Aufruf neu (bestehende dokumentierte Semantik; der Guard startet nichts selbst).

### Failing Test (Rot-Grün, Fix-Pfad)

Neue Datei `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats` (eine Datei
pro Vorgang, T002416 — Bestandsdatei bleibt unangetastet). Kern-Test: Wegwerf-Binary mit echtem
(deleted)-Zustand in einer Test-Registry + Fremdprozess mit (deleted)-Binary außerhalb der
Registry; `--auto-kill` beendet den registrierten Prozess (Positiv-Anker zuerst, T002356-M1),
der Fremdprozess überlebt, Exit 0. Heute rot (das Flag existiert nicht — das Skript ignoriert
`$@` still, der Prozess überlebt, Exit 1).

_Ticket: T004897_
