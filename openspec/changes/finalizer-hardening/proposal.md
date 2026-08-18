# Proposal: finalizer-hardening

## Why

Drei Befunde aus dem T012240/T012243-Lauf am 2026-08-18, alle in
`scripts/devflow-post-merge-finalize.sh`. Sie werden gemeinsam behandelt, weil sie denselben
Codepfad und dieselbe Datei betreffen — getrennte Changes kollidierten am selben File.

**B1 — Die Archiv-Sektion serialisiert nicht.** Schritt 8 wechselt per
`git checkout -B "$ARCHIVE_BRANCH" origin/main` den Branch des *geteilten* Arbeitsbaums. Am
2026-08-18 liefen zwei Finalizer gleichzeitig im selben Haupt-Checkout (T012240 `--pr 4738` und
T012239 `--pr 4737`, per `pgrep` belegt): die gestagte Archivierung des fremden Changes lag im
Index auf dem eigenen Archiv-Branch, und der Push scheiterte an
`cannot lock ref … reference already exists`. Der T006791-Restore griff am Ende, aber
zwischenzeitlich stand der Haupt-Checkout auf einem fremden Archiv-Branch. `agent-lock` deckt das
nicht ab — die Locks sind branch- und ticket-scoped.

**B2 — Fehlschläge erscheinen als `[skip]`, der Exit bleibt 0.** Das Skript unterscheidet nicht
zwischen „Schritt war bereits erledigt" (legitimer Idempotenz-Skip) und „Schritt konnte seine
Eingabe nicht auflösen" (Fehlschlag). Beide zählen als *übersprungen*, der Lauf endet mit Exit 0
und der Meldung *abgeschlossen*. Beobachtet vor dem T012243-Fix: `6 erledigt, 6 uebersprungen`
bei stehengebliebenem Worktree und Branch; nach dem Fix `12 erledigt, 0 uebersprungen`. Die
Formulierungen benennen die Unsicherheit selbst („vermutlich", „bereits archiviert?"), führen sie
aber nicht in Exit-Code oder Warnung über. Genau das hat T012243 verdeckt.

**B3 — Die Schritt-8-Idempotenz hängt an der Branch-Existenz statt am Zielzustand.** Der Check
ist `git ls-remote --exit-code --heads origin "$ARCHIVE_BRANCH"`. Er erkennt „Archiv-PR noch
offen", nicht „Archiv-PR gemergt und Remote-Branch gelöscht" — einen Zustand, den Schritt 8
per `gh pr merge --auto --squash --delete-branch` regelmäßig selbst herstellt. Belegt: PR #4740
ist `MERGED`, `git ls-remote --exit-code --heads origin <branch>` liefert 2. Ein
Wiederholungslauf mit noch vorhandenem lokalem Change-Ordner hält den Schritt für unerledigt und
archiviert erneut. Der Finalizer ist als idempotente Einheit spezifiziert; der Wiederholungslauf
nach Abbruch ist sein Zweck.

## What

- `_archive_lock()` serialisiert Schritt 8 per `flock` auf eine Datei im gemeinsamen
  Git-Verzeichnis — die Reichweite entspricht genau dem geteilten Index. Fehlt `flock`, läuft der
  Schritt unserialisiert weiter und sagt es (fail-open: Archivieren ist wichtiger als der Schutz
  vor einem seltenen Timing).
- `mark_warn()` trennt „nicht auflösbar" von „bereits erledigt". Warnungen ändern den Exit-Code
  nicht — der Lauf soll nachholbar bleiben —, erscheinen aber in der Schlusszeile. Schritt 10
  erkennt zusätzlich den Widerspruch „Pfad fehlt, aber ein Worktree hält den Branch".
- `_archive_already_done()` prüft den Zielzustand über drei Signale: Archiv-Branch liegt remote,
  Archiv-Verzeichnis liegt auf `origin/main`, oder ein Archiv-PR auf diesen Branch ist gemergt.

_Ticket: T012256_
