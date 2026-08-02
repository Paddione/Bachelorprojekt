---
title: "gate-agentic01-unresolved-tools — Implementation Plan"
ticket_id: T002494
domains: [test, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gate-agentic01-unresolved-tools — Implementation Plan

_Ticket: T002494_

Gate `G-AGENTIC01` misst heute die Anwesenheit eines `tools:`-Keys bei drei Agenten und widerspricht damit Test `T002221`, der genau dort keinen Key fordert. Dieser Plan stellt die Messung auf den realen Schaden um: `tools:`-Eintraege, die ins Leere zeigen. Die Messung wird dafuer aus dem Inline-Ausdruck in `health-goals-check.sh` in ein eigenes Skript gezogen, damit Gate und Test dieselbe Stelle aufrufen.

## File Structure

```
tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats  (bereits angelegt, RED 8/8)
scripts/lib/count-unresolved-agent-tools.sh                                 (neu, ~70 Zeilen)
scripts/health-goals-check.sh                                               (Zeilen 395-398 ersetzen)
.claude/lib/goals.md                                                        (Zeile 462 ersetzen)
.claude/agents/bachelorprojekt-db.md                                        (Frontmatter-Kommentar)
.claude/agents/bachelorprojekt-infra.md                                     (Frontmatter-Kommentar)
.claude/agents/bachelorprojekt-security.md                                  (Frontmatter-Kommentar)
website/src/lib/goals-data.generated.json                                   (generiert via freshness:regenerate)
```

S1-Budgets (Limit `.sh` = 800, `.md` und `.bats` ohne Limit):
`health-goals-check.sh` 490 → ~488 Zeilen, Reserve ~312 (die Datei schrumpft durch die Auslagerung).
`count-unresolved-agent-tools.sh` neu ~70 Zeilen, Reserve ~730.

Nicht angefasst: `tests/spec/agent-library.bats`. Test `T002221` bleibt woertlich unveraendert und muss gruen bleiben.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Test liegt bereits vor. Sein roter Zustand wird vor jeder Implementierung belegt.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats
# expected: FAIL — 8 von 8 rot, jeder mit exit 127 (Zaehler-Skript existiert noch nicht)
```

Test 8 prueft bewusst auf den definierten Code `2`, nicht auf `!= 0`: solange das Skript fehlt, liefert bash `127`, und ein `-ne 0` waere auch ohne Implementierung gruen — vakuos im Sinne von `T002356-M1`.

- [ ] **Task 2 — Zaehler-Skript anlegen.** `scripts/lib/count-unresolved-agent-tools.sh` mit der Signatur `[agents_dir] [registry_yaml]` (Vorgaben `.claude/agents` und `docs/agent-guide/registry/mcp.yaml`). Gibt genau eine Zahl auf stdout aus. Zwei Zustaende zaehlen:

  1. Datei hat einen `tools:`-Key (`grep -qE '^tools:( *$| *\[)'`), aber `tests/spec/helpers/agent-tools.py` liefert null Zeilen → `+1`, danach weiter zur naechsten Datei.
  2. Fuer jeden gelieferten Eintrag der Form `mcp__<server>__<tool>`: `<server>` herausloesen und gegen die Keys unter `clients:` in der Registry pruefen. Jeder unbekannte Eintrag → `+1`.

  Eintraege ohne `mcp__`-Praefix (Built-ins wie `Bash`, `Read`) werden nicht geprueft. Eine Datei **ohne** `tools:`-Key wird uebersprungen und zaehlt nie — das ist der von `T002221` gewollte Zustand.

  Fail-closed: ist die Registry nicht lesbar oder nicht parsebar, `exit 2` **ohne** Ausgabe einer Zahl. Ein Zaehler, der hier `0` meldet, wuerde ein gruenes Ziel auf einer nicht stattgefundenen Messung gruenden. Die Registry-Keys werden per `python3` und `yaml.safe_load` gelesen — dieselbe Abhaengigkeit, die `agent-tools.py` bereits voraussetzt.

- [ ] **Task 3 — Gate-Messung umstellen.** `scripts/health-goals-check.sh` Zeilen 395-398: der `awk`-Block ueber die drei fest benannten Agenten entfaellt vollstaendig und wird ersetzt durch

```bash
row target G-AGENTIC01 "$(bash scripts/lib/count-unresolved-agent-tools.sh)" le 0 \
  "tools:-Eintraege, die ins Leere zeigen (leere Aufloesung oder unbekannter MCP-Server)"
```

- [ ] **Task 4 — Gate-Zeile in `.claude/lib/goals.md` ersetzen.** Zeile 462 tauscht Titel, Ist-Wert und Messvorschrift. Der bisherige Text markiert das Ziel als blockiert und verweist auf die zu treffende Entscheidung; beides entfaellt, weil die Entscheidung mit diesem Vorgang getroffen ist. Der neue Text haelt drei Dinge fest: die beiden gezaehlten Zustaende; dass ein fehlender `tools:`-Key **kein** Verstoss ist (mit Verweis auf `T002221`); und dass der Wert auf dem heutigen Bestand `0` ist, weil nur ein Agent ueberhaupt einen `tools:`-Key traegt und repo-weit kein `mcp__*`-Eintrag existiert. Das Ziel wirkt als **Regressionsbremse**, nicht als Aufdeckung eines Missstands. Der dritte Punkt ist verbindlich: ohne ihn liest sich ein dauerhaft gruenes Ziel als Pruftiefe, die es nicht hat.

- [ ] **Task 5 — Frontmatter-Kommentare ergaenzen.** In `.claude/agents/bachelorprojekt-{db,infra,security}.md` steht je ein Kommentar, der begruendet, warum kein `tools:`-Key gesetzt ist. Ergaenzt wird ein Satz, dass `G-AGENTIC01` seit `T002494` nicht mehr die Anwesenheit des Keys misst und dieser Zustand das Ziel folglich nicht mehr ausloest. Inhaltlich wird an den Dateien nichts geaendert — kein `tools:`-Key, keine Aenderung an `description`, `model` oder Body. Der Kommentar verhindert, dass jemand den Key in gutem Glauben wieder einfuegt.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-library.bats
bash scripts/health-goals-check.sh --only=G-AGENTIC01
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartet: die neue `.bats`-Datei 8/8 gruen; `agent-library.bats` unveraendert gruen, insbesondere beide `T002221`-Tests — sie sind die Gegenprobe, dass der Widerspruch einseitig aufgeloest wurde; `health-goals-check.sh --only=G-AGENTIC01` meldet `0` gegen Ziel `le 0`; `freshness:regenerate` zieht `website/src/lib/goals-data.generated.json` auf den neuen Titel und Ist-Wert nach, `freshness:check` ist danach gruen. Faellt `freshness:check` mit einer Diff in `goals-data.generated.json`, ist die Ursache eine nicht gelaufene Regeneration, nicht ein Fehler im Gate.
