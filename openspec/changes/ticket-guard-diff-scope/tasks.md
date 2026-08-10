---
title: "ticket-guard-diff-scope — Implementation Plan"
ticket_id: T002934
domains: [ci-cd, openspec-workflow, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-guard-diff-scope — Implementation Plan

_Ticket: T002934_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/openspec-ticket-guard.sh` | neu | 800 (`.sh`-Limit, nicht baselined) |
| `tests/spec/openspec-workflow/ticket-file-required.bats` | 66 | nicht baselined |
| `tests/spec/openspec-workflow/ticket-guard-diff-scope.bats` | 95 | nicht baselined (bereits in dieser PR angelegt) |
| `.github/workflows/ci.yml` | Ergänzung um zwei Steps | keine S1-Abdeckung für `.yml` |
| `Taskfile.yml` bzw. passendes `taskfiles/`-Include | Ergänzung um einen Task | keine S1-Abdeckung für `.yml` |

Keine Datei mit Budget ≤ 0 betroffen; kein Split nötig. Nur Bash, YAML und BATS
— kein `website/src`, daher keine CQ02- und keine Vitest-Pflicht.
<!-- vitest: kein neuer Test nötig, weil keine .ts/.svelte-Datei berührt wird -->

## Entscheidung: Diff-Scope im PR-Gate, Vollbestand terminiert

Eine reine Allowlist scheidet aus. Sie existiert bereits
(`t002573-backlog-slugs.txt`, 42 Einträge) und ist ein eingefrorenes Register
des T002573-Bewertungslaufs. Sie pro Vorfall zu erweitern hieße: jede neue Lücke
braucht einen Commit auf eine Datei, die alle offenen PRs teilen — also genau
dieselbe Auffächerung über die Zahl der offenen Branches, nur mit einem
zusätzlichen Merge-Konfliktpunkt an einem gemeinsamen Dateiende.

Ein reiner Diff-Scope scheidet ebenso aus: eine Lücke in einem Change, den nie
wieder jemand anfasst, fiele dann in keinem Lauf mehr auf. Der Bestand verrottet
unbemerkt — die Messung unten zeigt, dass er heute sauber ist, und genau dieser
Zustand soll überprüfbar bleiben.

Getragen wird daher beides: Diff-Scope entscheidet, ob ein **PR** rot wird;
`--all` auf push-to-`main` und im nächtlichen Cron entscheidet, ob der
**Bestand** rot wird. Ein Bestandsfehler blockiert damit den Verursacher und den
nächtlichen Lauf, aber keinen unbeteiligten PR.

## MESSUNG (2026-08-10)

Ist-Zustand des Bestands, gegen den entschieden wurde — nachstellbar gegen den
Commit, an dem gemessen wurde:

```bash
PRE=f6f7e7f1996ab6beb33501d78c0de48f417d6a9c
git -C . stash list >/dev/null   # nur zur Erinnerung: im Haupt-Checkout nichts anfassen
BACKLOG=tests/spec/openspec-workflow/t002573-backlog-slugs.txt
chk=0; miss=0
for d in openspec/changes/*/; do
  s=$(basename "$d")
  [ "$s" = archive ] && continue
  [ "$s" = openspec-ticket-links-evaluation ] && continue
  grep -qxF "$s" "$BACKLOG" && continue
  chk=$((chk+1))
  { [ -f "$d/.ticket" ] && [ -s "$d/.ticket" ]; } || { echo "MISSING: $s"; miss=$((miss+1)); }
done
echo "checked=$chk missing=$miss backlog=$(grep -c . "$BACKLOG")"
```

Ergebnis bei `f6f7e7f`: `checked=30 missing=0 backlog=42`. Bei 57 Verzeichnissen
unter `openspec/changes/` (ohne `archive`) sind also 30 guard-pflichtig und
aktuell alle sauber. Die Allowlist deckt 42 eingefrorene Altbestands-Slugs ab.

Konsequenz für die Entscheidung: der Bestand ist heute grün, es gibt also nichts
zu allowlisten — eine Allowlist-Erweiterung wäre reines Verwaltungsgewicht ohne
gegenwärtigen Nutzen, während der Diff-Scope sofort wirkt.

## Task 1 — RED: Guard-Verhalten festnageln

Die Testdatei `tests/spec/openspec-workflow/ticket-guard-diff-scope.bats` liegt
mit dieser PR bereits vor und ist rot. Sie prüft gegen ein präpariertes
Fixture-Verzeichnis unter `$BATS_TEST_TMPDIR`, nicht gegen den echten Bestand —
sonst hinge das Testergebnis am Zufallszustand von `openspec/changes/`.

- [ ] Testlauf reproduzieren und die Ausgabe lesen, nicht nur den Exit-Code
      (T003278: `bats` auf eine nicht existierende Datei endet mit Exit 0).

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/openspec-workflow/ticket-guard-diff-scope.bats
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/ticket-guard-diff-scope.bats
# expected: FAIL — 6 von 6 rot, jeweils Exit 127 "openspec-ticket-guard.sh: No such file or directory"
```

## Task 2 — Guard-Skript `scripts/openspec-ticket-guard.sh`

- [ ] Neues Bash-Skript mit `set -euo pipefail` und dieser Schnittstelle:
      `--root <dir>` (Default `openspec/changes`), `--backlog <file>` (Default
      `tests/spec/openspec-workflow/t002573-backlog-slugs.txt`),
      `--scope "<slug> <slug> …"` (leerer String = kein Change im Scope),
      `--base <ref>` (Default `origin/main`), `--all`.
- [ ] Ohne `--scope` und ohne `--all` den Scope aus dem Diff ableiten:
      `git diff --name-only "$base" HEAD` — **Zwei-Punkt-Form**, weil der
      CI-Checkout `fetch-depth: 1` nutzt und `origin/main...HEAD` dort mangels
      Merge-Base fehlschlagen kann. Aus den Pfaden das zweite Segment nach
      `openspec/changes/` als Slug ziehen, `archive` verwerfen, deduplizieren.
- [ ] Lässt sich `--base` nicht auflösen (`git rev-parse --verify "$base^{commit}"`),
      mit Exit 2 und einer Meldung abbrechen, die den Ref nennt und ausdrücklich
      keine fehlende `.ticket`-Datei behauptet. Ein stilles Ausweichen auf
      Voll- oder Leerscope würde den Fehler genau dort verstecken, wo er
      entstanden ist.
- [ ] Die bisher in der BATS-Datei stehenden Ausnahmen übernehmen: Verzeichnis
      `archive` überspringen, `openspec-ticket-links-evaluation` überspringen,
      Allowlist-Slugs überspringen.
- [ ] Pro Lücke eine Zeile `FEHLT: Change '<slug>' ohne .ticket-Datei` ausgeben
      und mit Exit 1 enden. Immer eine Zusammenfassungszeile
      (`geprueft=<n> mit_ticket=<n> fehlend=<n>` bzw. bei leerem Scope
      `kein Change-Verzeichnis im Scope`) ausgeben — auch im Erfolgsfall, damit
      ein leerer Lauf sichtbar bleibt und nicht als stille Null durchgeht.
- [ ] `chmod +x` setzen.
- [ ] S4-Orphan-Regel bedienen: das neue Skript aus einem Taskfile-Task
      erreichbar machen (Task `openspec:ticket-guard`, der `--all` ausführt).
      Ohne diesen Eintrag meldet `quality:check` eine Orphan-Violation.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/ticket-guard-diff-scope.bats
# erwartet: 6 von 6 grün
```

## Task 3 — Bestandsguard auf das Skript umstellen

- [ ] In `tests/spec/openspec-workflow/ticket-file-required.bats` den
      `for`-Schleifen-Test durch einen Aufruf des Skripts ersetzen. Der Modus
      kommt aus der Umgebung: `OPENSPEC_TICKET_GUARD_ALL=1` ⇒ `--all`, sonst
      Default (diff-gescoped). So bleibt der Test lokal wie in CI derselbe
      Einstiegspunkt.
- [ ] Den zweiten Test („die Altbestands-Sluglist ist nicht leer …") unverändert
      lassen — er prüft die Allowlist selbst, nicht den Bestand.
- [ ] Positiv-Anker erhalten: der Test muss weiterhin belegen, dass überhaupt
      etwas geprüft wurde. Dafür die Zusammenfassungszeile des Skripts auswerten
      statt eigener Zähler; im `--all`-Lauf `geprueft > 0` zusichern.
- [ ] Prüfen, dass beide Testformen laufen (T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow*
# erwartet: grün, inklusive Sammeldatei und Verzeichnis
OPENSPEC_TICKET_GUARD_ALL=1 tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/ticket-file-required.bats
# erwartet: grün gegen den echten Bestand (Messung oben: 30 geprueft, 0 fehlend)
```

## Task 4 — CI: Modus am Event festmachen

- [ ] In `.github/workflows/ci.yml`, Job `test-factory-openspec`, einen Step
      „OpenSpec .ticket guard" ergänzen, der `scripts/openspec-ticket-guard.sh`
      aufruft. Der Job holt `origin/main` bereits flach nach — der Diff-Base ist
      also vorhanden, ein zusätzlicher Fetch entfällt.
- [ ] Den Modus über das Event wählen, nicht raten lassen:
      `github.event_name == 'pull_request'` ⇒ Default (diff-gescoped);
      `push` auf `main` und `schedule` ⇒ `--all`. Der nächtliche Cron
      (`17 3 * * *`) existiert bereits und trägt laut Kommentar in `ci.yml` seit
      T002780 ohnehin die Vollabdeckung — der Vollbestandslauf braucht also
      keinen neuen Zeitplan, nur diesen Modus.
- [ ] Im Job `test-factory-shard` sicherstellen, dass der über
      `ticket-file-required.bats` laufende Guard denselben Modus sieht:
      `OPENSPEC_TICKET_GUARD_ALL` in der Job-`env` aus derselben Event-Bedingung
      setzen.

## Task 5 — Doku und Inventar

- [ ] Den neuen Task in der OpenSpec-Sektion von `AGENTS.md` bzw. der passenden
      Referenz erwähnen, damit der Vollbestandslauf auch manuell auffindbar ist
      (`task openspec:ticket-guard`).
- [ ] Test-Inventar regenerieren, weil eine BATS-Datei hinzukommt:

```bash
task test:inventory
# website/src/data/test-inventory.json mitcommitten — CI ist hier fail-closed
```

## Task 6 — Finale Verifikation

- [ ] Die drei Pflicht-Gates ausführen und die Ausgaben lesen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Gegenprobe zum eigentlichen Ticketzweck: in einem Wegwerf-Change eine
      `.ticket`-Datei entfernen, den Guard im Default-Modus auf einem Branch
      laufen lassen, der diesen Change **nicht** anfasst, und belegen, dass er
      grün bleibt. Danach den Wegwerf-Change zurücknehmen.
