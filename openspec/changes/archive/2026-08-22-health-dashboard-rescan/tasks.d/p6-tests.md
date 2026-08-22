# p6 — Tests (RED zuerst)

_Ticket: T013306 · Rolle: tests · depends_on: —_

Dieses Partial läuft als erstes. Es schreibt den Vertrag von `scripts/health-goals-scan.sh` als
ausführbaren Test fest, bevor das Skript existiert.

## Zieldateien

- `tests/spec/health-goals/dashboard-rescan.bats` (NEU)
- `components/website/src/data/test-inventory.json` (regeneriert)

## Prüfmodus

Output-Verifikation gemäß `tests/CLAUDE.md`: jeder Test führt den Wrapper aus und prüft dessen
Ausgabe bzw. Exit-Status. Kein Grep auf den Quelltext der Implementierung.

## Aufgaben

- [ ] `tests/spec/health-goals/dashboard-rescan.bats` anlegen mit diesen Fällen:

  1. **Ein messbares Ziel liefert einen Wert.** Wähle eine Ziel-ID, die `health-goals-check.sh`
     ohne Cluster und ohne Netz messen kann (Kandidaten über
     `grep -nE '^\s*row (gate|target) ' scripts/health-goals-check.sh` suchen; ein reiner
     Datei-Zähler wie `G-CQ06` ist geeignet). Erwartet: Exit 0, die Ausgabe ist JSON, enthält
     genau einen Eintrag mit dieser `id`, `measurable` ist `true` und `actual` ist eine Zahl.
     Geparst wird mit `python3 -c` oder `jq`, nicht per Substring-Match — sonst bestätigt der Test
     die Schreibweise statt der Struktur.

  2. **Positiv-Anker.** Derselbe Lauf muss belegen, dass überhaupt etwas gemessen wurde: die
     Anzahl der JSON-Einträge ist genau die Anzahl der angeforderten IDs. Ohne diesen Anker wäre
     Fall 3 bei kaputter Ausgabe trivial erfüllt.

  3. **Ein nicht messbares Ziel meldet `measurable: false`.** Wähle eine ID, deren Messung ohne
     Cluster/Netz den SKIP-Sentinel `-` liefert, oder erzwinge den Fall über eine angeforderte ID,
     die `health-goals-check.sh` nicht abdeckt (sie steht im generierten Artefakt, hat aber keine
     `row`-Zeile). Erwartet: der Eintrag ist vorhanden, `measurable` ist `false`, und es gibt
     **kein** `actual`-Feld mit einem Zahlenwert. Der Test muss ausdrücklich ausschließen, dass
     der dokumentierte Wert an dieser Stelle auftaucht.

  4. **Unbekannte ID wird abgelehnt.** Aufruf mit einer ID, die nicht im generierten Artefakt
     steht (z. B. `G-NICHT-EXISTENT`). Erwartet: Exit ungleich 0 und eine Meldung auf stderr, die
     die abgelehnte ID nennt. Zusätzlich ein Fall mit einer ID, die Shell-Metazeichen enthält —
     erwartet dieselbe Ablehnung.

  5. **Die SSOT bleibt unangetastet.** Vor dem Lauf die Hashes von `.claude/lib/goals.md` und
     `components/website/src/lib/sdlc/goals-data.generated.json` merken, nach dem Lauf
     vergleichen. Erwartet: beide unverändert. Das ist die ausführbare Form von
     REQ-HEALTH-GOALS-011.

- [ ] Laufzeit im Blick behalten: `health-goals-check.sh` kann pro Ziel langsam sein. Nur Ziele
      wählen, die ohne Cluster, ohne Netz und ohne `node_modules` messen; wo nötig `--fast`
      durchreichen. Ein Test, der in CI ins Timeout läuft, misst die Ausstattung des Runners statt
      des Codes.

- [ ] Verfügbarkeits-Guards für externe Abhängigkeiten setzen, falls ein gewähltes Ziel eines
      braucht (`command -v <binary> >/dev/null 2>&1 || skip "<binary> not installed"`). Vorher
      prüfen, ob CI die Abhängigkeit überhaupt einrichtet: `grep -rn '<binary>' .github/workflows/`.

- [ ] Test-Inventar regenerieren: `task test:inventory` (CI vergleicht die committete Datei gegen
      eine frische Generierung).

## Abschluss dieses Partials

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/dashboard-rescan.bats
# expected: FAIL (rot — scripts/health-goals-scan.sh existiert noch nicht)
```

Ein Fehlschlag mit „file not found" ist das erwartete Ergebnis. Ein Fehlschlag aus einem anderen
Grund (kaputte Testdatei, fehlendes `jq`) ist keiner — er muss vor der Übergabe an `p1` behoben
sein, sonst ist später nicht unterscheidbar, ob der Test die Implementierung oder sich selbst misst.
