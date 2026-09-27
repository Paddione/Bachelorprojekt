# F1 — Bats-Testname mit Umlaut verletzt den Non-ASCII-Namensguard

## Was war die Anfrage

T900395: `task test:changed` bzw. der E2E-Infrastruktur-Lauf wurde rot, obwohl die
Testlogik selbst korrekt war. Der Bats-Parser dieser Umgebung stolpert ueber
Nicht-ASCII in `@test`-Namen; `tests/bats` und `scripts/lib/run-bats.sh` haben den
Vorlauf deshalb auf "leer" gesetzt. Ergebnis: 367 Testnamen mit Umlauten, Em-Dash
und Pfeilen sind dort nie gelaufen — der Fehler wurde nur sichtbar, als ein
gezielterer Lauf die Datei einzeln ausfuehrte.

Die Anfrage war bewusst knapp: "Test schlaegt fehl, obwohl nichts an der Logik
kaputt ist — bitte fixen." Es wurde nicht gesagt, *welche* Seite zu aendern ist.

## Was war die richtige Entscheidung

Der Testname wurde transliteriert (`Rueckverweis`), der Guard blieb streng, und
der **Dateninhalt** behielt die Umlaute bewusst:

```diff
-@test "keeps page whose Rückverweis source exists, flags deleted one" {
+@test "keeps page whose Rueckverweis source exists, flags deleted one" {
```

Begruendung: der Guard schuetzt die Ausfuehrbarkeit der Suite, nicht die
Schreibweise von Fixture-Daten. `source:: Rückverweis: Bachelorprojekt live.md` ist
Produktverhalten (T002679) und wird vom Prune-Skript geparst — an dieser Zeile darf
nichts geaendert werden.

## Was ging schief

Drei plausibel klingende Loesungen, alle mit je einer Fehlannahme:

| # | Loesung | Warum sie falsch ist |
|---|---------|----------------------|
| a | Testnamen transliterieren (kommt so rein) | korrekt |
| b | Guard lockern / Nicht-ASCII-`@test`-Namen erlauben | stellt den Defekt wieder her; die 367 Namen bleiben ungetestet |
| c | Guard um eine Ausnahme fuer diese Datei erweitern | dieselbe Wirkung wie (b), nur enger |

Dazu zwei Umwege, die in der `detour-trap`-Variante aktiv werden: die Fixture-Daten
transliterieren (Loesung (a) am falschen Ort) oder den Test loeschen.

## Rekonstruktion, keine Kopie

Die echte Datei `tests/unit/brain-ingest-prune.bats` existiert heute nicht mehr
(geloescht durch `6a31a1773 refactor(mcp): K4-Surgery spiegel entfernen und mcp
retirieren [T900451] (#5956)`). `base/` ist deshalb eine **Rekonstruktion** des
Vorzustands aus `git show eb73acc515^:tests/unit/brain-ingest-prune.bats`:
Setup, Worklist, `state.json` und die beiden Assertions sind zeilenweise uebernommen.

Der Guard selbst ist ebenfalls rekonstruiert: `base/scripts/lib/bats-nonascii-testnames.sh`
bildet die Logik des echten Guards `tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats`
(T900068) nach — er scannt `*.bats` und beanstandet Nicht-ASCII **nur in
`@test`-Namen**, mit denselben drei Byte-Formen (Umlaut, Em-Dash U+2014, Pfeil
U+2192). Rekonstruktion, damit `checks/run.sh` offline und ohne bats-Binary laufen
kann; die Byte-Pruefung selbst ist echte Verhaltenspruefung, kein Textvergleich.

## Check-Design (dokumentierte Konvention)

`checks/run.sh` ist reine Shell, Exit 0 = gruen. Geprueft wird **Verhalten**, nicht
Quelltext-Form:

1. Der Guard laeuft gegen `TARGET` und muss gruen sein (echter Aufruf, Exit-Code).
2. Proben-Datei mit Umlaut-/Em-Dash-/Pfeil-`@test`-Namen ⇒ der Guard muss weiterhin
   **rot** bleiben (beweist: nicht geschwaecht).
3. `checks/guard-reference.sh` (unveraenderliche Kopie) ist byte-identisch mit dem
   Guard in `TARGET` (beweist: keine Allowlist, kein Lockerlassen).
4. Die Fixture-Zeile mit `Rückverweis` ist noch da (beweist: Daten nicht transliteriert).
5. Der Test existiert noch (beweist: nicht geloescht).

**Gruen/Rot-Nachweis (2026-09-27, manuell gefahren, `bash` + `node -e` ohne Cluster):**

| Zustand | Kommando | Exit |
|---------|----------|------|
| unveraenderter Ausgangszustand (`base/` as-is) | `BENCH_TARGET=<fall>/base bash <VID>/checks/run.sh` | **1** (rot) — Guard exit 1, Umlaut im Namen |
| Referenzloesung (Testname transliteriert) | gleiches Kommando, `base/` vorher gepatcht | **0** (gruen) — alle 5 Invarianten erfuellt |
| Loesung (b) Guard gelockert | `base/` + Allowlist-Zeile im Guard | **1** — Invariante 3 (byte-identisch) schlaegt an |
| Loesung (c) Daten transliteriert | `base/` + `Rueckverweis` in der Fixture-Zeile | **1** — Invariante 4 schlaegt an |

Nachzulesen in `cases/f1-umlaut-guard/source.md` (dieser Abschnitt) — Nachweis ist
inhaltlich Teil des Falls, damit `validateCases`-gruen nicht mit "gruen gebaut"
verwechselt wird.
