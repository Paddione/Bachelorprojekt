# Proposal: mishap-rollup-loop

## Why

Der Rollup-Branch `chore/mishap-incident-rollup` sammelt unbegrenzt Commits, die
nichts transportieren. Er ist damit der Flaschenhals fuer den Abbau des gesamten
Mishap-Rueckstands: solange die Einzelticket-Konversion in `mishap.go` besteht,
faellt das nur als Kosten auf; sobald sie entfernt wird (T003120), ist der
Rollup-Container der EINZIGE Extraktionspfad fuer Mishaps — und ein Pfad, dessen
Branch nie vorankommt, ist ein schwarzes Loch.

### Symptom vs. Hypothese (Bug-Triage, T002448-M5)

Das Ticket T002931 nennt Beobachtung und Ursachenvermutung in einem Absatz. Vor dem
Loesungsentwurf getrennt und am Code gemessen (2026-08-10, Worktree dieses Plans):

| Aussage aus T002931 | Art | Messung |
|---|---|---|
| „~128 s pro rebastem Commit durch `post-commit` -> `openspec-embed`" | Symptom, historisch | **Behoben.** Zwei unabhaengige Guards liegen vor, siehe unten. |
| „Der post-commit-Hook darf waehrend eines Rebase nicht feuern (Teilaufgabe T002870)" | Fix-Richtung | **Umgesetzt.** `in_rebase()` in `scripts/openspec-embed-lib.sh:31-35`, aufgerufen in `.githooks/post-commit-embed` (Commit `9f3c6e167`, T002870). Empirisch gegen ein Wegwerf-Repo verifiziert: waehrend `git rebase` meldet der Hook „skipped (rebase in progress)", ausserhalb „ran". |
| „Der Branch wird nicht gepusht" | Hypothese, ueberholt | **Falsch geworden.** `scripts/factory/mishap-rollup.sh` pusht seit jeher und rebased seit T002914 (`c56329e8d`, 2026-08-09 17:26 UTC) gegen `origin/${BRANCH}`. Das Ticket entstand 13:14 UTC, also VOR diesem Fix. |
| „Der Branch kommt nie voran" | Symptom | **Besteht fort, in anderer Form.** `origin/main..origin/chore/mishap-incident-rollup` = **38 Commits** (gemessen). Sie sind KEINE Checkbox-Flips: 21x `[T003067]` + 16x `[T002784]` tragen alle die Generator-Nachricht `chore(plans): update mishap-incident-rollup from container batches`, dazu ein `chore: anchor branch`. Der Gesamt-Diff gegen `main` umfasst genau zwei Dateien (`proposal.md`, `tasks.md`). |

**Belegte Ursache.** Nicht der Hook und nicht ein fehlender Push, sondern die
Commit-Semantik des Generators: `mishap-rollup.sh` erzeugt `tasks.md` bei JEDEM Lauf
idempotent aus ALLEN Container-Kommentaren neu und haengt das Ergebnis als NEUEN
Commit an. Der vorige Commit wird dadurch vollstaendig ueberschrieben — sein Inhalt ist
im Nachfolger enthalten, seine Existenz traegt keine Information. Weil der Branch
zugleich nie gemergt wird, waechst die Kette monoton. Zwei Folgen:

1. Der Rebase pro Tick wird mit jedem Tick teurer und ist die Quelle des halbfertigen
   Rebase-Zustands aus T002766 — abgebrochen bleibt ein `rebase-merge/`-Verzeichnis im
   Worktree stehen.
2. Kein Reviewer kann den Branch lesen: 38 identisch benannte Commits ueber zwei Dateien
   sind als Historie wertlos, und ein PR daraus waere nicht bewertbar.

**Gegenprobe zur naheliegenden Fix-Richtung (a) „den rebasten Stand pushen".** Genau das
ist mit T002914 geschehen. Danach sind 21 weitere Commits entstanden. Push allein loest
die Schleife also messbar nicht — er verschiebt sie nur von „Rebase laeuft ins Leere" zu
„Kette waechst unbegrenzt". Fix-Richtung (c) „tasks.md nicht pro Checkbox committen"
zielt an der gemessenen Lage vorbei: es gibt keine Checkbox-Commits, jeder Commit ist
eine Voll-Regeneration.

## What

**Gewaehlte Richtung: (b) — ein einziger Generator-Commit pro Branch-Zustand.**

Statt anzuhaengen, ersetzt der Generator seinen eigenen letzten Commit
(`git commit --amend`) und pusht mit `--force-with-lease`. Die Kette bleibt bei
Laenge 1 gegenueber ihrer Basis; ein Rebase wird ueberfluessig, weil der lokale Stand
per Lease gegen den Remote-Stand geprueft wird statt ihn zu replayen. Das ist zulaessig,
weil der Commit-Inhalt definitionsgemaess reproduzierbar aus der Datenbank stammt: es
geht keine Information verloren, die nicht im Nachfolger stuende.

**Harte Sicherheitsbedingung — fremde Arbeit ist unantastbar.** Der Rollup-Branch ist der
Arbeitsbranch des Container-Tickets; ein Implementer kann dort committen. Das Amend
greift deshalb NUR, wenn `HEAD` nachweislich ein eigener Generator-Commit ist — Nachricht
UND ausschliesslich Pfade unterhalb `openspec/changes/mishap-incident-rollup/`. Ist `HEAD`
fremd, faellt der Generator auf das heutige Verhalten zurueck (neuer Commit, normaler
Push). Heute liegt kein einziger fremder Commit auf dem Branch (gemessen), aber ein
Generator, der Fremdarbeit verlieren KANN, ist als Dauerlaeufer nicht tragbar.

**Ersetzt eine bestehende Entscheidung (Schritt 0.7).** `T002914` hat die Frage
„Rebase-Ziel" zugunsten `origin/${BRANCH}` entschieden und mit einem Guard in
`tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats:62`
abgesichert. Diese Entscheidung wird hier nicht umgekehrt, sondern **gegenstandslos**:
ohne wachsende Kette gibt es nichts zu rebasen. Der Rebase-Pfad bleibt als
Konfliktbehandlung fuer den Fremd-Commit-Fall erhalten, damit der T002914-Deadlock nicht
zurueckkehrt. Der zugehoerige Guard wird auf Output-Verifikation umgestellt — er greppt
heute den Quelltext und verstiesse damit ohnehin gegen T002448-M4.

**Nicht in diesem Vorgang.** Dass der Rollup-Container nie ausgefuehrt und der Branch nie
gemergt wird, ist ein eigener Befund (der Branch traegt 754 Zeilen unbearbeitete
`tasks.md`). Dieser Plan stellt den Extraktionspfad her; der Abfluss ist Sache von
T003120 und dem Container-Lebenszyklus.

_Ticket: T002931_
