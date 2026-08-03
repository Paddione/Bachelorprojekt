---
title: "p6 tests — BATS-Abdeckung für Schema-Gate, Erfassung und Injektion"
ticket_id: T002592
domains: [test]
status: active
---

# p6 tests — BATS

**Besitzt ausschließlich:** `tests/spec/toolset-registry/*.bats`, `Taskfile.agents.yml`

**Kontrakt:** CONTRACT.md §3 (Exit-Codes, Ausgabeformat), §4 (Befund-Tabelle).

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `tests/spec/toolset-registry/schema-gate.bats` | neu | — (`.bats` hat kein S1-Limit) |
| `tests/spec/toolset-registry/collect-kinds.bats` | neu | — |
| `tests/spec/toolset-registry/context-injection.bats` | neu | — |
| `Taskfile.agents.yml` | 399 | — (`.yml` hat kein S1-Limit) |

Verzeichnis statt Sammeldatei gemäß der BATS-Konvention aus `CLAUDE.md` [T002416]: ein
Verzeichnis je OpenSpec-SSOT-Spec (`toolset-registry`), eine Datei je Vorgang. Die Sammeldatei
`tests/spec/toolset-registry.bats` existiert nicht und wird auch nicht angelegt.

## Prüfmodus (Header-Konvention)

Alle drei Dateien tragen im Kopfkommentar den Prüfmodus **command output verification**: sie
führen die Befehle aus und prüfen `$status` und `$output`, sie greppen **nicht** den Quelltext der
Generatoren. Der SSOT-Spec fordert das ausdrücklich („Grepping the generator source for a flag
name or message string is not acceptable evidence of behaviour").

## Aufgaben

- [ ] **Failing-Test-Step (RED).** Die drei BATS-Dateien anlegen, bevor p1–p5 implementiert sind.
      Sie müssen auf dem aktuellen Branch **fehlschlagen** — `scripts/toolset-context.sh`
      existiert noch nicht, `check.mjs` kennt die Schema-Prüfung nicht, `collect.mjs` liefert
      keine `plugin:`-Instanzen.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/toolset-registry/
# expected: FAIL (rot — Skript und Prüfungen existieren noch nicht)
```

- [ ] **`schema-gate.bats` — check.mjs.** Gegen Fixture-Registries in `$BATS_TEST_TMPDIR` mit
      `TOOLSET_REGISTRY` und `TOOLSET_OUT_DIR` (beide Overrides sind bereits Spec-Anforderung und
      im Bestand implementiert; ohne sie überschriebe der Test die echte Konfiguration).
      Abgedeckte Fälle, je einer pro `@test`:

      - `canonical` ohne `use_when` → Status ≠ 0, Ausgabe nennt Capability und Instanz-Id
      - `canonical` ohne `roles` → Status ≠ 0
      - `roles: [db]` (Kurzform) → Status ≠ 0, Ausgabe nennt `db`
      - `tier: gefaehrlich` (ungültiges Enum) → Status ≠ 0, Ausgabe nennt den Wert
      - `suppressed` ohne `use_when`/`roles`, mit `reason` → Status 0
      - vollständige Registry → Status 0

- [ ] **Positiv-Anker in jedem Negativtest.** Jeder Test der Form „X darf nicht vorkommen" prüft
      **zuerst** im selben `@test`, dass der gültige Fall durchläuft. Sonst besteht der Test
      vakuos: fehlt die Prüfung ganz, ist die Befundmenge leer und „der Fehler ist nicht
      enthalten" gilt trivial [T002356-M1].

      Konkret für den Suppressed-Test: erst belegen, dass die *gleiche* Fixture mit
      `state: canonical` und ohne `use_when` **rot** wird, dann dass sie mit `state: suppressed`
      grün wird. Ein alleinstehendes „suppressed ist grün" bestünde auch gegen einen `check.mjs`,
      der überhaupt nichts prüft.

- [ ] **`collect-kinds.bats` — collect.mjs.** Prüft die tatsächliche Ausgabe, nicht die Quelle:

      - Ausgabe ist wohlgeformtes JSON (durch `node -e "JSON.parse(...)"` geleitet)
      - die Menge der Kind-Präfixe enthält `plugin`, `skill`, `cli`, `agent` und `mcp`
      - ein in `.claude/settings.json` aktives, in der Registry fehlendes Plugin trägt
        `curation: "unreviewed"`
      - `cli:gh-axi` (in der Registry gelistet) trägt **nicht** `unreviewed` — Positiv-Anker
        gegen die Trivialimplementierung, die alles als `unreviewed` markiert
      - `--unreviewed` liefert eine echte Teilmenge: Anzahl kleiner als ohne Filter und größer
        als 0 gegen eine Fixture, die beides enthält

- [ ] **`context-injection.bats` — toolset-context.sh.** Gegen eine Fixture-Registry mit je einer
      Instanz für `bachelorprojekt-db`, `bachelorprojekt-website`, `all` und einer `suppressed`
      mit `roles: [all]`:

      - Aufruf mit `bachelorprojekt-db` → Status 0, Ausgabe enthält die DB-Instanz-Id und
        **nicht** die Website-Instanz-Id (mit der DB-Zusicherung als Positiv-Anker davor)
      - die `all`-Instanz erscheint in **beiden** Rollen-Aufrufen
      - die `suppressed`-Instanz erscheint in **keinem** — Positiv-Anker: derselbe Aufruf enthält
        mindestens eine kanonische Id
      - Kurzform `db` → Status ≠ 0, und die Ausgabe enthält **keine** Instanz-Id (der eigentliche
        Regressionsschutz: ein Rückfall auf „alle Instanzen" bei unbekannter Rolle wäre der
        T002322-Fehler, und ein reiner Exit-Code-Test würde ihn nicht fangen, wenn das Skript vor
        dem Abbruch noch ausgäbe)
      - `--json` → Ausgabe ist parsebares JSON

- [ ] **`$output`-Assertions auf die relevante Zeile verengen.** Nicht unqualifiziert gegen den
      gesamten stdout+stderr prüfen: das Skript gibt bei Fehlbedienung eine Usage-Zeile mit `$0`
      aus, und der Worktree-Pfad enthält den Slug `toolset-usage-injection` — ein Test auf
      `*"toolset"*` bestünde damit unabhängig von der Implementierung. Erst auf die
      Ergebniszeilen filtern (`grep '^### '`), dann prüfen.

- [ ] **`Taskfile.agents.yml`: Task `toolset:context` ergänzen.** Analog zu den vier bestehenden
      `toolset:*`-Tasks, damit das Orakel (`bash scripts/vda.sh oracle`) den Injektionspfad
      findet. Nimmt die Rolle als Variable entgegen.

- [ ] **Test-Inventar regenerieren.** CI vergleicht `website/src/data/test-inventory.json` gegen
      eine Neugenerierung und schlägt bei Abweichung fehl. Nach dem Anlegen der drei Dateien
      `task test:inventory` laufen lassen und das Ergebnis mitcommitten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
