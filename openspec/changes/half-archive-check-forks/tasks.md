---
title: half-archive-check forkt pro Archiveintrag
ticket_id: T013673
domains: [ci-cd, openspec-workflow]
status: plan_staged
---

# half-archive-check forkt pro Archiveintrag — Implementation Plan

## File Structure

| Datei | Art | Zeilen jetzt | Zeilen danach | Wirksame S1-Schwelle | Budget |
|---|---|---|---|---|---|
| `scripts/openspec-half-archive-check.sh` | geändert | 82 | 82 | 500 (Limit, keine Baseline) | 418 |
| `tests/spec/openspec-workflow/half-archive-fork-scaling.bats` | neu, bereits committed | 121 | 121 | 500 (Limit, keine Baseline) | 379 |
| `openspec/changes/half-archive-check-forks/specs/openspec-workflow.md` | neu, bereits committed | 45 | 45 | — | — |

Die Änderung ist zeilenneutral: drei Zeilen werden durch drei Zeilen ersetzt, eine weitere
durch eine. Kein Verkleinerungs- oder Split-Schritt nötig.

## Kontext

`scripts/openspec-half-archive-check.sh` startet in seinen beiden Verzeichnisschleifen pro
Eintrag externe Prozesse: `basename` in der `offen`-Schleife (Zeile 34) und `basename`
plus eine `printf | sed`-Pipeline in der Archiv-Schleife (Zeile 50-52). Bei 763
archivierten Changes sind das rund 1526 Prozessstarts.

Der Check hängt an vier Aufrufpunkten — `scripts/agent-lock.sh:740` (`cmd_reap`,
advisory), `.githooks/pre-commit` (fail-closed), `scripts/openspec.sh:267` und
`Taskfile.yml:972`. Jeder `reap` zahlt davon 3,3 s von 6-7 s Gesamtlaufzeit.

Die Ursache ist verifiziert und liegt nicht in der Verzeichnissuche: die beiden `find`
kosten zusammen 8 ms, die Schleife mit `basename`+`sed` 3,304 s, dieselbe Schleife mit
bash-Builtins 0,045 s.

Der RED-Test liegt bereits im Branch und ist rot (42 gegen 402 gezählte Prozessaufrufe).
Die Lösung wurde gegen eine Kopie gegengeprüft: 3,090 s → 0,093 s bei zeichengleicher
Ausgabe, RED-Test grün, Bestandsguard `half-archive-uncommitted.bats` (4 Tests) grün.

## Nicht im Scope

- Die Kopplung des Checks an `cmd_reap`. Sie ist Requirement
  `openspec/specs/openspec-workflow.md:783-822` (T002824) und bleibt unverändert.
- Ein TTL-Marker analog zu `.last-fetch` in `scripts/agent-lock.sh`. Er würde die
  Symptomdauer senken, ohne die Ursache zu beheben, und die Meldung eines frisch
  entstandenen Halbzustands um die TTL verzögern.
- Die neun Archiveinträge ohne Datumspräfix (`brain-ingest-pruefen`,
  `factory-provider-baseurl-routing`, `health-goals-erden`, `k1-vektorspeicher`,
  `mishap-categorize-erden`, `mishap-ci-test-agentlock`, `mishap-t002407`,
  `release-notes-erden`, `t001537`). Sie werden vom Check korrekt übersprungen; ob sie
  legitim sind, klärt ein eigenes Ticket.

## Aufgaben

### 1. Rotphase bestätigen

Der Test ist bereits committed. Vor der Änderung belegen, dass er den Defekt misst:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-fork-scaling.bats
```

expected: FAIL — Test 1 bricht an `[ "$klein" -eq "$gross" ]` ab und meldet auf stderr
`Forks bei 20 Eintraegen: 42 — bei 200: 402`. Beide Positiv-Anker im Test müssen davor
durchlaufen sein; scheitert stattdessen einer von ihnen, ist der Testaufbau defekt und
nicht der Code.

Test 2 ist bereits grün. Er ist Regressionsschutz für die Ersetzung selbst — die neun
präfixlosen Archiveinträge dürfen durch die neue Musterprüfung nicht plötzlich als halb
archiviert gelten. Eine Zusicherung, die heute gilt und morgen brechen könnte, gehört vor
den Eingriff, nicht danach.

### 2. Die beiden Schleifen auf bash-Builtins umstellen

In `scripts/openspec-half-archive-check.sh`:

Zeile 34, `offen`-Schleife:

```bash
-  name="$(basename "$d")"
+  name="${d##*/}"
```

Zeile 50-52, Archiv-Schleife:

```bash
-  base="$(basename "$d")"
-  slug="$(printf '%s' "$base" | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')"
-  [ "$slug" = "$base" ] && continue   # kein Datumspraefix — kein regulaerer Archiveintrag
+  base="${d##*/}"
+  [[ $base =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-(.+)$ ]] || continue   # kein Datumspraefix — kein regulaerer Archiveintrag
+  slug="${BASH_REMATCH[1]}"
```

Die `offen`-Schleife läuft über wenige Einträge und trägt nichts zur Laufzeit bei. Sie
wird trotzdem umgestellt, weil dieselbe Regression sonst über sie zurückkommt, sobald
`openspec/changes/` einmal viele offene Changes hält.

Zwei Fallstricke, die die Ersetzung nicht machen darf:

- `${base#????-??-??-}` ist **keine** gültige Abkürzung für die `sed`-Regex. In
  Pfadmustern matcht `?` jedes Zeichen, nicht nur Ziffern — ein Verzeichnis wie
  `abcd-ef-gh-slug` würde fälschlich als datierter Archiveintrag gelten. Der
  `[[ =~ ]]`-Match mit `[0-9]{4}` ist die korrekte Form.
- Die Reihenfolge kehrt sich um: bisher wurde erst der Slug gebildet und danach über
  `[ "$slug" = "$base" ]` erkannt, dass kein Präfix vorlag. Jetzt entscheidet der Match
  vorher, und `slug` wird nur im Trefferfall gesetzt.

`find` liefert bei `-mindepth 1 -maxdepth 1` Pfade ohne abschließenden Schrägstrich,
`${d##*/}` ergibt daher denselben Wert wie `basename`.

### 3. Grünphase und unveränderte Erkennung nachweisen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-fork-scaling.bats
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-uncommitted.bats
```

Beide Dateien müssen vollständig grün sein — zusammen 6 Tests. Der Bestandsguard
`half-archive-uncommitted.bats` ist der eigentliche Nachweis, dass sich am
Erkennungsverhalten nichts geändert hat: er deckt den Doppel-Slug, das Nicht-Reparieren,
das reap-Advisory und die Aufrufreihenfolge im pre-commit-Hook ab.

Zusätzlich die Ausgabe gegen das echte Archiv vergleichen — sie muss zeichengleich
bleiben, nicht nur exit-gleich:

```bash
bash scripts/openspec-half-archive-check.sh
# erwartet: "✓ kein halb archivierter Change (N offen, M archiviert)" mit denselben
# Zahlen wie vor der Änderung
```

### 4. Wirkung auf den reap-Pfad belegen

Die Änderung rechtfertigt sich über die Laufzeit an den Aufrufpunkten. Ohne Messung ist
das eine Behauptung (Mess-Konvention T002717):

```bash
export AGENT_LOCK_DIR=$(mktemp -d)
time bash scripts/openspec-half-archive-check.sh
time bash scripts/agent-lock.sh reap
rm -rf "$AGENT_LOCK_DIR"
```

Referenzwerte auf `main @ cd50476db`: Check 3,09 s, `reap` 6-7 s. Erwartet nach der
Änderung: Check unter 0,2 s, `reap` entsprechend rund 3 s kürzer. Die Zahlen gehören als
Kommentar ans Ticket, zusammen mit dem Befehl, der sie erzeugt hat — sie sind
maschinenabhängig und taugen deshalb nicht als Testassertion, wohl aber als Beleg.

### 5. Folgeticket für die präfixlosen Archiveinträge

```bash
bash scripts/ticket.sh create --type chore \
  --title "Neun Archiveintraege ohne Datumspraefix in openspec/changes/archive/" \
  --description "..."
```

Die Beschreibung nennt die neun Verzeichnisse, hält fest, dass
`openspec-half-archive-check.sh` sie stillschweigend überspringt, und stellt die zu
klärende Frage: sind sie legitime Altlasten oder Rückstände abgebrochener
`openspec.sh archive`-Läufe — und soll der Check sie künftig melden statt überspringen.
Ermittlung der aktuellen Liste:

```bash
ls openspec/changes/archive | grep -vE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-'
```

### 6. Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Alle drei müssen grün sein. `freshness:regenerate` vor `freshness:check`, weil der neue
Delta-Spec und die neue Testdatei generierte Artefakte berühren
(`components/website/src/data/openspec-status.json`,
`components/website/src/data/test-inventory.json`); regenerierte Dateien gehören in den
Commit.
