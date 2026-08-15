---
ticket_id: T006298
plan_ref: openspec/changes/stash-drop-renumbering/tasks.md
status: active
date: 2026-08-15
---

# Design: stash-drop-renumbering — nachrichtenverifiziertes Stash-Drop

## Goals

- `scripts/git-stash-net.sh` bietet `drop --by-message <pattern>` als nachrichtenverifizierte
  Destruktion — das Pendant zu `pop --by-message` für das Entfernen ohne Anwendung.
- Ein Drop entfernt genau einen Eintrag, aufgelöst per Message-Match, nie per Index.
- Destruktion ist fail-closed: Mehrdeutigkeit und "nicht gefunden" entfernen nichts.
- Die SSOT-Spec `divergence-guard.md` deckt das neue Kommando samt Szenarien ab.

## Non-Goals

- Kein Schleifen-/Batch-Drop mehrerer Einträge in einem Aufruf — mehrere Drops sind
  separate Aufrufe mit erneuter Auflösung (Lehre aus T006298).
- Kein `--expect <sha>`-Abgleich: Die Ticket-Lehre definiert "verifizierter Ref" explizit
  als Message-Match ("Stash-Drops einzeln per verifiziertem Ref (Message-Match)"). Ein
  zweiter Abgleich-Mechanismus wäre YAGNI.
- Kein Eingriff in `worktree-create.sh` oder `repo-hygiene-cron.sh` — deren Stash-Handling
  ist bereits nachrichtenbasiert (T003070) bzw. nicht betroffen.
- Kein automatisches Aufräumen alter Stashes; das Kommando ist der Baustein, Aufrufer
  entscheiden.

## Root-Cause-Analyse (T002448-M5: Symptom vs. Hypothese)

| | |
|---|---|
| **Symptom (Fakt)** | Zweiter von zwei aufeinanderfolgenden `git stash drop`-Aufrufen löschte `stash@{1}` = T004897-WIP statt des intendierten T005591-Stash. Kein Datenverlust (Restore per `git stash store 8b70a5ec…`). |
| **Hypothese (Ursache)** | Index-basierte Adressierung ist instabil: `refs/stash` liegt im gemeinsamen Git-Verzeichnis und wird von allen Worktrees mutiert; der eigene erste Drop verschiebt den Stack zusätzlich. |
| **Verifikation** | Repo-eigene Evidenz: `git-stash-net.sh`-Header (T003070, Zeilen 4–10) dokumentiert genau diese Index-Instabilität als Begründung für nachrichtenbasiertes Auflösen; SSOT `divergence-guard.md` §416–424 schreibt Message-basiertes Restore/Pop vor. Die Git-Mechanik (Reindexierung nach Drop auf einem Reflog) ist der dokumentierte Hintergrund. |

## Decisions

### D1: Auflösung per Message-Match, nie per Index

Bestehende Entscheidung aus T003070 (SSOT divergence-guard.md §416–424) wird fortgeführt —
das neue `drop`-Kommando folgt derselben Auflösungslogik wie `pop` (`_find_idx`/
`_count_matches`). Kein neuer Mechanismus.

### D2: Mehrdeutigkeit bricht ab (Exit 3)

Zwei Einträge matchen das Muster → nichts wird entfernt, Meldung mit Trefferliste auf
stderr, Exit 3. Ein Drop ist destruktiv und darf nie den "ersten Treffer" raten.

### D3: Ein Eintrag pro Aufruf, Verifikation vor und nach dem Drop

Der Aufruf resolved → zeigt die gefundene Message auf stderr (Operatoren-Sichtbarkeit im
Log) → droppt → zählt Message-Treffer erneut. `after == 0` ⇒ ok (Exit 0); `after > 0` ⇒
BEFUND (Exit 1, Eintrag blieb — z. B. bei Teil-Drop-Effekten wie T003069).

### D4: Exit-Codes kompatibel zur bestehenden Semantik

0 = ok, 1 = BEFUND, 2 = kein Treffer (fail-closed), 3 = mehrdeutig. Damit bleiben
`find`/`pop`-Erwartungen der Aufrufer gültig; 3 ist die einzige neue Code-Bedeutung.

### D5: BATS-Verifikation über echte Kommando-Ausgabe, nicht Source-Grep

Der Test baut ein Temp-Repo-Fixture (mehrere Stashes mit Ticket-Messages), führt das
Kommando aus und prüft `git stash list`-Ausgabe bzw. Exit-Codes (T002448-M4,
Output-Verifikation). Positiv-Anker: der korrekte Eintrag verschwindet; Negativ-Aussagen:
die anderen Einträge bleiben erhalten (nicht per Index adressiert), mehrdeutiges Muster
entfernt nichts.
