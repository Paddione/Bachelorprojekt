---
title: "post-merge-batch-closure — Implementation Plan"
ticket_id: T003797
domains: [factory, tickets]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# post-merge-batch-closure — Implementation Plan

_Ticket: T003797_

## File Structure

```
scripts/factory/auto-close-merged.sh                          (p1 — Titel-Extraktion + Guard-Ausbau; Ist 172 - Baseline 0 -> Budget 628)
tests/spec/software-factory/batch-closure-title-children.bats (p1 — neue Datei, Tabellentest; Ist 0 - Baseline 0 -> Budget 800)
```

Beide Dateien haben keinen Eintrag in `docs/code-quality/baseline.json`, die wirksame Schwelle ist
also jeweils das `.sh`-Limit von 800 Zeilen. `auto-close-merged.sh` waechst um rund 12 Zeilen
netto (+18/-6) auf etwa 184 — reichlich Abstand, kein Verkleinerungsschritt noetig.
`scripts/factory/merge-hooks.sh` wird **nicht** angefasst (nur sein Aufruf entfaellt) und bleibt
bei 71 Zeilen.

## Partials

1. `p1-closure` — Titel-Extraktion, Guard-Ausbau und die zugehoerigen Tests. Einteilig: der
   Testfall haengt unmittelbar an der geaenderten Extraktionsfunktion, eine Trennung erzeugte nur
   einen kuenstlichen Schnitt.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Lege
      `tests/spec/software-factory/batch-closure-title-children.bats` an. Der Test ruft die
      Extraktion aus `scripts/factory/auto-close-merged.sh` auf und prueft **command output**,
      nicht den Quelltext (Konvention T002448-M4). Faelle als Tabellentest ueber die vier realen
      PR-Titel plus zwei Anker:

      | Titel (gekuerzt) | erwartete IDs |
      |---|---|
      | `… Fixes (T003109,T002815,T002922) [T003540]` | T003540 T003109 T002815 T002922 |
      | `… P1 worktree-health (T002994,T002995,T002998) [T003539]` | T003539 T002994 T002995 T002998 |
      | `… Meta-Fixes (T002937,T003134,T003174,T003176,T003229,T003284,T003546) [T003541]` | T003541 und die sieben genannten |
      | `fix(ci): preflight-pr-scope matcht ALLE Ticket-IDs im PR-Titel [T003103]` | nur T003103 |
      | `fix(ci): repariere (endlich) den Watcher [T001234]` | nur T001234 |
      | `chore: kein Ticket im Titel` | leer |

      Die vorletzte Zeile ist der **Falsch-Positiv-Anker**: runde Klammern ohne Ticket-IDs kommen
      in Commit-Titeln staendig vor. Ein Ausdruck, der schlicht jedes `T[0-9]{6}` im Titel greift,
      waere gegen die ersten vier Zeilen gruen und generalisierte trotzdem falsch — der Regex muss
      an die Klammerstruktur gebunden sein, nicht bloss an das ID-Muster.

      Die vierte Zeile ist der **Regressionsanker**: Einzel-PRs duerfen sich nicht aendern. Sie
      muss bereits vor dem Fix gruen sein; wird sie rot, wurde die Extraktion kaputtgemacht statt
      erweitert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/batch-closure-title-children.bats
# expected: FAIL (rot — die Kinder in runden Klammern werden noch nicht extrahiert)
```

- [ ] **Fix-Step 1 (GREEN): Titel-Extraktion erweitern.** In
      `scripts/factory/auto-close-merged.sh` die Extraktion in Zeile 90 zu einer Funktion
      ausbauen, die beide Rollen liefert:

      - Parent: `[T……]` — unveraendert, weiterhin `head -1`.
      - Gelieferte Kinder: IDs innerhalb **runder** Klammern. Erst den Klammerinhalt isolieren,
        dann darin nach `T[0-9]\{6\}` suchen — nicht umgekehrt, sonst faellt der
        Falsch-Positiv-Anker durch.
      - Reihenfolge: Parent zuerst, dann die Kinder in Titel-Reihenfolge, dedupliziert.
      - Kein Treffer in runden Klammern ergibt ein Ergebnis identisch zu heute.

      Die Schleife, die heute ueber das eine `$ticket` laeuft, iteriert danach ueber die
      Ergebnisliste. Die bestehende Ableitung der `resolution` aus dem Ticket-Typ und die
      Statuspruefung pro Ticket bleiben unveraendert und gelten fuer Kinder wie fuer den Parent.

- [ ] **Fix-Step 2 (GREEN): Vollstaendigkeitsguard ausbauen.** Den Aufruf von
      `check_partial_plan_completeness` (derzeit `auto-close-merged.sh:116`, samt zugehoeriger
      `continue`-Meldung) entfernen. Im Code einen Kommentar hinterlassen, der die Messung nennt,
      auf der die Entfernung beruht: vier Batches, drei Fehlalarme (T003540 mit 93 unchecked Boxes
      bei vollstaendiger Lieferung, T003541 und T003490 mit je drei), ein Durchlasser (T003539 mit
      null unchecked bei nicht gelieferten Phasen P2 bis P4). Zusaetzlich vermerken, dass der
      Guard ohnehin nie griff, weil er das Change-Verzeichnis per Glob
      `openspec/changes/*<ticket-id>*` sucht, die Slugs aber sprechend benannt sind und die
      Zuordnung in `.ticket` steht.

      `scripts/factory/merge-hooks.sh` NICHT loeschen — nur die Verdrahtung entfaellt.

- [ ] **Gegenprobe am realen Merge (Trockenlauf).** `auto-close-merged.sh` kennt `--dry-run`.
      Gegen die bereits gemergten Batch-PRs laufen lassen und pruefen, dass die Ausgabe genau die
      Ticketmengen aus der Tabelle oben nennt — insbesondere bei `T003539` **nur** die drei
      gelieferten Kinder. Die betroffenen Tickets sind inzwischen alle `done`, der Lauf darf also
      nichts mehr veraendern; erwartet wird die Trockenlauf-Meldung ohne Statusaenderung.

```bash
BRAND=mentolder bash scripts/factory/auto-close-merged.sh --dry-run 2>&1 | grep -E 'T003(53|54)[0-9]'
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
