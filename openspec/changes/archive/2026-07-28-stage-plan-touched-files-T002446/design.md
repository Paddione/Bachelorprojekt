---
ticket_id: T002446
plan_ref: openspec/changes/stage-plan-touched-files-T002446/tasks.md
status: active
date: 2026-07-28
---

# Design: touched_files beim stage-plan ableiten (T002446)

## Root-Cause

`touched_files` wird heute an zwei Stellen gesetzt: in der Factory-Scout-Phase
(`scripts/factory/pipeline-runner.js:88`) und in `dev-flow-execute` Schritt 1.5
(`.claude/skills/references/dev-flow-execute-phases.md:228`). Der zweite Pfad ist konditional
formuliert — „Falls der Plan die berührten Dateien kennt" — und damit ein Prosa-Schritt in einer
Anleitung, kein Code.

Der Plan kennt die Dateien immer: `## File Structure` direkt nach der H1 ist plan-lint Hard Rule
STRUCT1. Die Information existiert also zwingend zum Zeitpunkt des `stage-plan`, wird aber erst
später und abhängig von der Sorgfalt eines Agenten übertragen.

Live-Beleg: T002439 wurde am 2026-07-28 gestaged, `## File Structure` steht im Plan,
`touched_files` ist `NULL`.

## Was NICHT das Problem ist

Die ursprüngliche Ticket-Prämisse „nur 181 von 1806 Tickets haben `touched_files`" ist
irreführend und wurde verworfen. `conflict-check.sh` betrachtet ausschließlich
`status IN ('in_progress','in_review')`; dort ist die Abdeckung derzeit 5 von 5. Der Nullstand
bei `plan_staged` (0 von 8) ist ebenfalls kein Defekt — dieser Status ist bewusst aus dem
Statusfilter ausgenommen (FA-SF-45: ein Ticket kann dort tagelang liegen, es aufzunehmen würde
falsch-positiv blockieren).

Der Mangel ist die Fragilität des Mechanismus, nicht die aktuelle Zahl. Ein übersehener Fall
genügt für eine unentdeckte Kollision.

## Fix-Ansatz

**Extraktion in `scripts/plan-touched-files.sh`.** Ein eigenständiges Skript, das einen Planpfad
nimmt und die Dateiliste auf stdout schreibt. Zwei Gründe für die Trennung: der Parser wird gegen
Fixtures testbar, und ein Test, der `stage-plan` als Ganzes ausführt, bräuchte eine
DB-Verbindung — er liefe in CI nie.

**Parser in zwei Stufen.**

1. *Kandidaten sammeln* aus der Sektion. Die Sektionsgrenze ist derselbe awk-Ausdruck, den
   `plan-lint.sh:341` bereits benutzt (H2-Beginn bis zum nächsten H2, damit H3-Untergliederungen
   drinbleiben). Innerhalb der Sektion: Backtick-Spans decken Bullet- und Tabellenform ab, im
   Code-Fence das erste Token pro Zeile vor dem Gedankenstrich.
2. *Filtern*: ein Kandidat zählt, wenn er in `git ls-files` steht **oder** eine bekannte
   Datei-Extension trägt. Neue Dateien sind noch nicht getrackt, tragen aber eine Extension;
   `deployment/arena-server` hat beides nicht und fällt heraus.

Die Sektionsgrenze wird bewusst als Kopie des awk-Ausdrucks geführt und nicht aus `plan-lint.sh`
importiert: `plan-lint.sh` ist ein fail-closed CI-Gate ohne Bibliotheks-Charakter, und eine
geteilte Funktion würde `stage-plan` an dessen Lebenszyklus koppeln. Die Kopie ist ein Einzeiler;
die Kopplung wäre dauerhaft.

**Einbau in `stage-plan.sh`.** Ein weiterer `_exec_sql`-Block nach dem bestehenden Status-Update.
Die Plan-Datei wird ohnehin schon aufgelöst — der Preflight prüft sie über `git cat-file -e`
gegen Branch, `HEAD` und Disk (Zeilen 36–42); derselbe Auflösungspfad liefert den Inhalt.

## Zwei Entscheidungen

**Ergänzen, nicht ersetzen.** Der Implementer berührt regelmäßig Dateien, die im Plan nicht
standen; `dev-flow-execute` Schritt 1.5 darf die Baseline erweitern. Ein `UPDATE … SET
touched_files = <plan>` würde diese Ergänzungen bei jedem erneuten `stage-plan` verwerfen.
Die Zusammenführung passiert in SQL, damit sie atomar bleibt.

**Leeres Ergebnis warnt, blockiert nicht.** `stage-plan` bei nicht parsbarem Block abbrechen zu
lassen träfe den Workflow härter, als der Nutzen rechtfertigt — und `plan-lint` STRUCT1 ist
bereits das Gate für Plan-Struktur. Das Skript meldet auf stderr und liefert leeren stdout;
`stage-plan` läuft weiter.

## Fixtures zur Laufzeit

Die Testfixtures sind Pläne. Eingecheckt würden sie von `plan-lint`, den Plan-Watchdogs und
`plan-context.sh` als echte Pläne behandelt. Sie entstehen deshalb in `$BATS_TEST_TMPDIR`.

## Verhältnis zu dev-flow-execute Schritt 1.5

Der Schritt bleibt bestehen und wird nicht entfernt. `stage-plan` liefert die Baseline aus dem
Plan, Schritt 1.5 ergänzt, was während der Umsetzung dazukommt. Die Formulierung dort wird
angepasst, damit sie das Ergänzen beschreibt statt eines konditionalen Erstschreibens.

_Ticket: T002446_
