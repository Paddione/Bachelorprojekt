---
title: "zielfamilie-llm-stack — Implementation Plan"
ticket_id: T002442
domains: [agentic-tooling, testing, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# zielfamilie-llm-stack — Implementation Plan

_Ticket: T002442_

## File Structure

```
scripts/lib/llm-stack-measure.sh                (neu)        Messquelle für G-LLM01..G-LLM05
tests/spec/health-goals/llm-stack-goals.bats    (neu)        Output-Verifikation je Ziel
.claude/lib/goals.md                            (geändert)   nur Block "## G-LLM01" bis vor "## G-WT01"
scripts/health-goals-check.sh                   (geändert)   nur Sektion LLM-TARGETS
Taskfile.yml                                    (geändert)   health:llm + HG_LOCAL_ONLY_GOALS
website/src/lib/goals-data.generated.json       (generiert)  via task freshness:regenerate
website/src/data/test-inventory.json            (generiert)  via task test:inventory
```

**Zeilenbudget (S1).** Nur `scripts/health-goals-check.sh` und die neue
`scripts/lib/llm-stack-measure.sh` fallen unter ein S1-Extension-Limit (`.sh: 800` in
`docs/code-quality/gates.yaml`). Für `scripts/health-goals-check.sh` existiert **kein**
Baseline-Eintrag in `docs/code-quality/baseline.json`, die wirksame Schwelle ist also das Limit
selbst. `.claude/lib/goals.md` (`.md`) und `Taskfile.yml` (`.yml`) haben kein Limit.

Die wirksame Schwelle ist in beiden Fällen das Extension-Limit 800, weil für keine der beiden
Dateien ein Baseline-Eintrag existiert.

| Datei | Ist | Budget |
|---|---|---|
| `scripts/health-goals-check.sh` | 615 | 185 |
| `scripts/lib/llm-stack-measure.sh` | 0 | 800 |

Der Umbau in `health-goals-check.sh` ist **netto zeilenreduzierend**: die zwei mehrzeiligen
Python-Blöcke der Sektion `LLM-TARGETS` (rund 30 Zeilen) werden durch fünf einzeilige
Skriptaufrufe ersetzt. `scripts/lib/llm-stack-measure.sh` wird auf Zielgröße unter 350 Zeilen
geschnitten, damit Wachstumsreserve bleibt.

## Entscheidungen, die dieser Plan voraussetzt

Vollständige Begründung in `proposal.md`. Kurzfassung, damit der Implementer nicht dagegenläuft:

1. **Lokal, nicht CI.** Ein CI-Runner hat keine LLM-Endpunkte; dort wären alle fünf Ziele
   strukturell grün. Messort ist `task freshness:check` auf der Entwicklermaschine.
2. **`n/a` statt `0`.** Fehlt die Messgrundlage, lautet die Ausgabe `n/a`. `health-goals-check.sh`
   zählt das als übersprungen, nicht als erreicht.
3. **Eine Messquelle.** Die Logik lebt in `scripts/lib/llm-stack-measure.sh`; `goals.md` und
   `health-goals-check.sh` rufen sie nur auf.
4. **Kein Fail im Merge-Gate.** Der Block in `freshness:check` warnt und ändert den Exit-Status
   nicht.
5. **Abgrenzung zu `G-WT*` (T002443).** Nur der Block ab `## G-LLM01` in `goals.md` und nur die
   Sektion `LLM-TARGETS` in `health-goals-check.sh` werden angefasst. `HG_LOCAL_ONLY_GOALS` wird
   **erweitert**, nicht neu angelegt, falls T002443 zuerst merged.
6. **Abgrenzung zu `G-IF*`.** Das deklarierende Artefakt entscheidet die Familie: MCP-Registry
   gehört `G-IF`, `loadouts.json` / Proxy-Backend-Registry / LLM-Units gehören `G-LLM`.

## Task 1 — RED: Verhaltenstests für die fünf Messungen

Neue Datei `tests/spec/health-goals/llm-stack-goals.bats` nach der Verzeichniskonvention aus
T002416 (Verzeichnis nach dem SSOT-Spec-Slug `health-goals`, eine Datei pro Vorgang). Nicht an
`tests/spec/health-goals.bats` anhängen.

Prüfmodus im Dateikopf dokumentieren: **command output verification** (T002448-M4). Jeder Test
ruft `scripts/lib/llm-stack-measure.sh <subcommand>` gegen eine Fixture auf und prüft `$output`
und `$status`; kein `grep` auf den Skriptquelltext.

Fixture-Aufbau, alles ohne Netz und ohne Datenbank:

- **Loadout-Registry:** JSON-Datei in `mktemp -d`, referenziert über `LLM_MEASURE_LOADOUTS`.
- **HTTP-Fixtures:** ein `python3 -m http.server`-Prozess pro Test auf einem freien Port, der aus
  einem Verzeichnis statische Dateien `health`, `livez` und `v1/models` ausliefert. Port in
  `setup()` per `python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])'`
  ermitteln, PID in `teardown()` beenden. Ein „toter Port" ist ein Port, auf dem nichts gestartet
  wurde.
- **Backend-Registry:** Kommando-Override `LLM_MEASURE_BACKENDS_CMD`, das Zeilen der Form
  `name<TAB>base_url` ausgibt (in Produktion die `factory_psql`-Abfrage, im Test ein `printf`).
- **MCP-Registry:** Pfad-Override `LLM_MEASURE_MCP_REGISTRY` auf eine Fixture-Datei.
- **Units:** Verzeichnis-Override `LLM_MEASURE_UNIT_DIRS` und Kommando-Override
  `LLM_MEASURE_UNIT_STATE_CMD`, das für einen Unit-Namen `enabled` oder `disabled` ausgibt.

Pro Ziel **zwei** Tests, in dieser Reihenfolge (Positiv-Anker zuerst, T002356-M1):

- **Anker-Test:** ohne Messgrundlage muss die Ausgabe `n/a` sein und darf nicht `0` sein.
- **Verletzungs-Test:** mit präparierter Verletzung muss die Ausgabe die Verletzung zählen, und
  ein gültiger Nachbarfall in derselben Fixture darf nicht mitgezählt werden.

Zusätzlich diese Tests aus den am 2026-08-02 belegten Befunden:

- `server-availability`, Objekt-statt-Liste: Fixture in der realen Form
  `{"version":1,"loadouts":[…]}`. Erwartung: eine Zahl. Dieser Test wäre gegen den Bestandsbefehl
  rot, weil der über das Objekt iteriert und mit `AttributeError` in `n/a` fällt.
- `server-availability`, exclusiveGroup: drei Einträge einer Gruppe, genau einer lebendig, plus
  eine zweite Gruppe komplett tot. Erwartung: `1`.
- `proxy-readiness`, Feldname: Fixture-Antwort mit `degraded` als Liste und `checked`, ohne
  Schlüssel `providers`. Erwartung: die Länge von `degraded`. Gegen den Bestandsbefehl wäre das
  `0` und damit falsch grün.
- `proxy-readiness`, Form-Anker: Antwort ohne `degraded` und ohne `checked`. Erwartung: `n/a`.
- `proxy-readiness`, nicht bereit: `ready:false`, `checked:3`. Erwartung: `3`, und die Ausgabe
  matcht `^[0-9]+$` — kein Statuswort.
- `model-drift`: `/v1/models` meldet eine ID, die für diesen Port in der Loadout-Fixture nicht
  geführt ist. Erwartung: `1`. Gegenprobe: ein Port, auf dem drei Slugs geführt sind und die
  gemeldete ID einem davon entspricht, zählt nicht.
- `dead-endpoints`, Familiengrenze: zwei lokale Endpunkte ohne Listener, einer davon zusätzlich in
  der MCP-Registry-Fixture geführt. Erwartung: `1`.
- `autostart-coverage`: zwei Unit-Dateien im Fixture-Verzeichnis, eine `enabled`, eine `disabled`.
  Erwartung: `1`.

Ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/llm-stack-goals.bats
# expected: FAIL — scripts/lib/llm-stack-measure.sh existiert noch nicht
```

Syntax-Vorprüfung der neuen Datei mit `tests/unit/lib/bats-core/bin/bats --count <datei>`;
`bash -n` ist für `.bats` untauglich (T002351-M2).

## Task 2 — GREEN: Messquelle `scripts/lib/llm-stack-measure.sh`

Ein Skript mit fünf Subkommandos, je eine Zahl oder `n/a` auf stdout, Exit 0 auch bei `n/a` (der
Aufrufer unterscheidet über den Wert, nicht über den Status):

| Subkommando | Ziel | Was gezählt wird |
|---|---|---|
| `server-availability` | `G-LLM01` | `exclusiveGroup`s ohne erreichbares Mitglied plus gruppenlose Ports ohne Listener |
| `proxy-readiness` | `G-LLM02` | degradierte Backends laut `/health`; bei `ready:false` der Wert von `checked` |
| `model-drift` | `G-LLM03` | antwortende Loadout-Ports, deren `/v1/models`-ID für diesen Port nicht geführt ist |
| `autostart-coverage` | `G-LLM04` | deklarierte LLM-Unit-Dateien ohne `enabled`-Zustand |
| `dead-endpoints` | `G-LLM05` | lokale Endpunkte der Backend-Registry ohne Listener |

Gemeinsame Regeln:

- **Positiv-Anker als erste Anweisung jedes Subkommandos.** Schlägt er fehl, `n/a` ausgeben und
  beenden. Die Anker stehen in `specs/health-goals.md` unter `REQ-HEALTH-GOALS-LLM-002` und sind
  dort bindend formuliert.
- **Gemeinsamer Host-Anker für `server-availability`, `model-drift` und `dead-endpoints`:**
  `/livez` des llm-proxy (`LLM_PROXY_URL`, Vorgabe `http://127.0.0.1:18235`). Antwortet er nicht,
  ist die lokale LLM-Seite als Ganzes aus und die Messung meldet `n/a` statt einer Fehlerzahl.
  Bewusst `/livez` und nicht `/health`: `/health` beantwortet Readiness und meldet 503, sobald ein
  Prio-1-Backend tot ist — als Host-Anker gelesen würde ein degradierter Proxy die drei Ziele
  fälschlich stummschalten. Derselbe Unterschied hat T002281 verursacht.
- **Kein `except: pass` über den ganzen Messkörper.** Ein Parse- oder Formfehler führt zu `n/a`,
  ein leeres Ergebnis nach erfolgreichem Parsen zu `0` — beide Fälle müssen getrennt bleiben. Der
  Bestandsbefehl vermischt sie und deckt damit seinen eigenen `AttributeError` zu.
- **Nur Zahlen oder `n/a` auf stdout.** Diagnosetext gehört nach stderr. `health-goals-check.sh`
  vergleicht arithmetisch und schreibt den Wert in `HG_VALUES_FILE`.
- **`stderr` nicht pauschal nach `/dev/null`,** wenn dadurch ein Fehler als leere Eingabe bei
  `wc -l` landen könnte.
- **Overrides** wie in Task 1 gelistet; ohne sie gelten die Produktionsvorgaben
  (`scripts/llm/loadouts.json`, `factory_psql`-Abfrage auf `tickets.llm_proxy_backends` mit
  `enabled = true`, `docs/agent-guide/registry/mcp.yaml`, Unit-Verzeichnisse `scripts/llm/` und
  `scripts/llm-proxy/`, `systemctl --user is-enabled`).

Fachliche Feinheiten, die aus der Messrunde folgen:

- **Ein Port kann mehrere Loadout-Slugs tragen.** `8091` trägt `gemma-factory`,
  `gemma-multiagent` und `gemma26-factory`. `model-drift` vergleicht deshalb gegen die **Menge**
  der für diesen Port geführten Slugs und Modell-Dateinamen, nicht gegen einen einzelnen Wert.
- **Cluster-DNS-Endpunkte werden nicht geprobt.** `llm-gateway-embed`/`-rerank` auf `:8081` sind
  aus `environments/*.yaml` nur im Cluster auflösbar; sie gehören zu `G-OPS01`. `dead-endpoints`
  betrachtet ausschließlich `127.0.0.1`- und `localhost`-Endpunkte.
- **`ollama.service`** ist in `scripts/llm/` deklariert und aktuell nicht installiert. Das ist ein
  echter Fund für `G-LLM04` und darf nicht wegdefiniert werden. Units, die bewusst nicht auf
  dieser Maschine laufen sollen, werden über eine benannte Ausnahmeliste im Skriptkopf mit
  Begründung ausgeschlossen — nicht durch stilles Weglassen aus dem Glob.

Nach diesem Task muss der Testlauf aus Task 1 grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/llm-stack-goals.bats
```

## Task 3 — `.claude/lib/goals.md`: Familie auf fünf Ziele bringen

Nur den Bereich ab `## G-LLM01` bis vor `## G-WT01` bearbeiten. Der `G-IF*`-Block darüber und der
`G-WT*`-Block darunter bleiben unangetastet.

- `G-LLM01` und `G-LLM02`: Messblock durch den Aufruf von `scripts/lib/llm-stack-measure.sh`
  ersetzen. Die Prosa an das tatsächliche Verhalten angleichen: bei `G-LLM01` die
  `exclusiveGroup`-Regel benennen, bei `G-LLM02` den Feldnamen `degraded` und den Grund, warum die
  bisherige `providers`-Annahme still grün meldete.
- `G-LLM03` bis `G-LLM05` neu anlegen, im Format der Bestandsziele: H2-Zeile mit Wertepfeil,
  Abschnitt `**Was:**`, Messblock, Meta-Zeile mit Priorität, Baseline, Target, Aufwand,
  Messzyklus, Reproduzierbarkeit und `**Ticket:** T002442`.
- Reproduzierbarkeit einheitlich als „nur lokal" führen.
- Im Abschnitt `Messzyklus` am Dateiende die lokale Familie um die `G-LLM*`-IDs ergänzen, damit sie
  nicht in der Wöchentlich-Liste der CI-Ziele landen. Steht dort durch T002443 bereits eine Zeile
  für lokale Ziele, wird sie erweitert statt dupliziert.

Baselines werden **gemessen**, nicht geschätzt: je Subkommando einmal auf dem Hauptcheckout laufen
lassen und die Werte eintragen. Erwartungswerte aus der Erhebung vom 2026-08-02 als Plausibilitäts-
kontrolle, nicht als Eintrag: `autostart-coverage` 1 (`ollama.service`), `dead-endpoints` 1
(`opencode-zen` auf `:5099`), `proxy-readiness` 2 (`deepseek`, `opencode-zen`). Weichen die
gemessenen Werte ab, gilt die Messung, und die Abweichung wird im Ticket vermerkt.

## Task 4 — `scripts/health-goals-check.sh`: LLM-Sektion auf die Messquelle umstellen

Ausschließlich die Sektion `LLM-TARGETS` ersetzen. Die `WT-TARGETS`-Sektion darunter bleibt
unangetastet, damit T002443 dort ohne Konflikt arbeiten kann.

Je Ziel eine `row target`-Zeile mit dem Skriptaufruf als Wert. Die bisherigen mehrzeiligen
Python-Substitutionen entfallen; das ist die Netto-Zeilenreduktion aus dem Budget-Abschnitt.

Wichtig: `row` behandelt den Wert `-` als „nicht messbar". Das Skript gibt `n/a` aus, also muss die
Sektion `n/a` auf `-` abbilden — oder `row` akzeptiert beide Schreibweisen. Die zweite Variante ist
vorzuziehen, weil sie für `G-WT*` denselben Dienst tut; sie ist eine Ein-Zeilen-Ergänzung in `row`
und kein Umbau. Wer sie wählt, hält sie additiv, damit T002443 nicht kollidiert.

Prüfen, dass ein `n/a`-Wert als übersprungen und nicht als erreicht gezählt wird:

```bash
bash scripts/health-goals-check.sh --only=G-LLM01,G-LLM02,G-LLM03,G-LLM04,G-LLM05
```

## Task 5 — Messort: `health:llm` und Anschluss an den Warn-Block

- Neue Task `health:llm` in `Taskfile.yml`, die `scripts/health-goals-check.sh` auf die
  `G-LLM*`-IDs einschränkt. Das erfüllt zugleich das S4-Gate: das neue Skript ist über Taskfile und
  `health-goals-check.sh` erreichbar und damit kein Orphan.
- `HG_LOCAL_ONLY_GOALS` um die fünf `G-LLM*`-IDs **erweitern**. Existiert die Variable noch nicht,
  weil T002443 später merged, wird sie hier mit den `G-LLM*`-IDs angelegt — in derselben Form, die
  der T002443-Plan beschreibt, damit der spätere Merge ein reines Anhängen ist.
- Den Warn-Block in `freshness:check` **nicht duplizieren**. Ist er durch T002443 vorhanden, genügt
  die Erweiterung der Variable. Ist er nicht vorhanden, wird er hier angelegt: hinter dem
  Divergenz-Hinweis aus T002561, unter `CI` eine Skip-Notiz mit Begründung, sonst Aufruf des
  Health-Checks mit `|| true`, damit der Exit-Status des Gates unverändert bleibt.

Der Block gehört bewusst **nicht** in `freshness:regenerate`: diese Task schreibt Artefakte und
läuft auch in CI.

Gegenprobe beider Zweige:

```bash
task freshness:check 2>&1 | grep -c 'G-LLM'
CI=true task freshness:check 2>&1 | grep -ci 'uebersprungen\|übersprungen'
```

## Task 6 — Finale Verifikation

- [ ] Testinventar neu erzeugen, weil eine BATS-Datei hinzugekommen ist:

```bash
task test:inventory
```

- [ ] OpenSpec-Delta validieren:

```bash
bash scripts/openspec.sh validate zielfamilie-llm-stack
```

- [ ] Plan-Linter über den eigenen Plan laufen lassen:

```bash
bash scripts/plan-lint.sh openspec/changes/zielfamilie-llm-stack/tasks.md
```

- [ ] Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:regenerate` erzeugt `website/src/lib/goals-data.generated.json` aus der geänderten
`goals.md` neu; die Datei gehört mit in den Commit, sonst schlägt `freshness:check` an.
