# Proposal: stash-drop-renumbering

## Why

Am 2026-08-15 löschten zwei aufeinanderfolgende `git stash drop`-Aufrufe den falschen
Stash-Eintrag: Nach dem ersten Drop rutschten die Stash-Indizes (`refs/stash` ist im
gemeinsamen Git-Verzeichnis über alle Worktrees geteilt), sodass der zweite Aufruf mit
`stash@{1}` den T004897-WIP-Stash statt des intendierten T005591-Stash traf. Der Eintrag
wurde per `git stash store 8b70a5ec…` vollständig wiederhergestellt — kein Datenverlust.

Die Repo-Konvention (T003070, SSOT `openspec/specs/divergence-guard.md` §416–424) schreibt
bereits nachrichtenbasiertes Auflösen für Restore und Pop vor. Für das **Droppen** eines
Stash-Eintrags existiert aber noch kein nachrichtenverifiziertes Kommando —
`scripts/git-stash-net.sh` bietet nur `find --by-ticket` und `pop --by-message`. Jede
Destruktion läuft damit weiterhin über rohe Indizes — genau die Fehlerquelle des Mishaps.

## What

`scripts/git-stash-net.sh` erhält ein neues Kommando `drop --by-message <pattern>`:

- Der zu droppende Eintrag wird **ausschließlich per Nachrichten-Match** aufgelöst — nie
  per Index `stash@{N}`.
- **Vor** dem Drop wird die Eindeutigkeit verifiziert: Treffen mehrere Einträge auf das
  Muster, bricht der Drop ab (fail-closed) und entfernt nichts.
- Der Drop entfernt genau **einen** Eintrag pro Aufruf. Mehrere Drops sind separate
  Aufrufe, die jeweils neu auflösen — nie zwei Indizes hintereinander.
- **Nach** dem Drop wird das Verschwinden positiv verifiziert (Message-Match zählt 0
  Treffer); bleibt ein Eintrag, ist das ein BEFUND, kein Erfolg.
- Exit-Codes konsistent zur bestehenden Kommando-Semantik: 0 = ok, 1 = BEFUND (Eintrag
  noch da), 2 = kein Treffer, 3 = mehrdeutig (nichts entfernt).

Die SSOT-Spec `divergence-guard.md` wird per MODIFIED-Delta um das Drop-Requirement und
seine Szenarien erweitert. Ein BATS-Test in `tests/spec/divergence-guard/` belegt die
Semantik rot-grün (Positiv-Anker + Negativ-Aussagen mit Anker).

_Ticket: T006298_
