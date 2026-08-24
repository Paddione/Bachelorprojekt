# P2 — VDA-Aufruf und Agent-Guide-Oberflaechen

_Teil von `openspec/changes/callable-ai-council/tasks.md` (T016501); beginnt erst, wenn
`p1-engine` abgeschlossen ist und `scripts/vda/council.mjs` den dort geplanten CLI-Vertrag
bereitstellt._

## Ziel und Grenzen

Dieser Partial macht den in P1 gebauten, read-only Council ueber den kanonischen VDA-Einstieg
aufrufbar und ueber die bestehende Agent-Guide-Registry auffindbar. Er fuehrt weder eine zweite
Modellliste noch Council-spezifische Provider-/Modellstrings ein. Die Modellzuordnung bleibt
allein Sache von `.opencode/agent-models.jsonc` und deren validiertem Spiegel
`docs/agent-guide/registry/agents.yaml`; die Oberflaeche dokumentiert nur Runtime-IDs als
Benutzereingabe.

## Betroffene Dateien und Zeilenlage

| Datei | Ist | Wirksame Schwelle / Budget |
|---|---:|---|
| `scripts/vda.sh` | 107 | `.sh`-Limit 800, nicht baselined: **Budget 693** |
| `.gitignore` | 254 | Konfigurationsdatei; kein S1-Zeilenlimit |
| `docs/agent-guide/registry/tools.yaml` | 272 | Registry-Konfiguration; kein S1-Zeilenlimit |
| `components/website/src/lib/agent-guide.generated.json` | 2161 | Generator-Artefakt; nicht manuell editieren, S1 nicht anwendbar |
| `components/website/src/lib/platform-descriptions.generated.json` | 142 | Generator-Artefakt; nicht manuell editieren, S1 nicht anwendbar |
| `docs/agent-guide/20-werkzeuge.md` | 375 | Generator-Artefakt; nicht manuell editieren, S1 nicht anwendbar |
| `docs/agent-guide/maps/tools-map.md` | 38 | Generator-Artefakt; nicht manuell editieren, S1 nicht anwendbar |

Der kleine Dispatch-Zuwachs laesst `scripts/vda.sh` weit unter 80 % seiner wirksamen Schwelle;
ein Split ist nicht erforderlich. Die JSON-/Markdown-Ausgaben koennen gross sein, sind aber
bewusst vollstaendig aus der Registry erzeugt; ihre Zeilenzahl wird nicht durch kosmetisches
Zusammenziehen manipuliert.

## Tasks

### 1. Council als kanonischen VDA-Subcommand verdrahten

In `scripts/vda.sh` genau denselben Dispatch-Stil wie bei den vorhandenen Subcommands verwenden:

- In `show_help()` einen Eintrag `council` mit kurzer Beschreibung als read-only,
  multi-model Entscheidungsberatung ergaenzen.
- Im `case`-Block `council)` aufnehmen, das Subcommand entfernen und per
  `exec node "${SCRIPT_DIR}/vda/council.mjs" "$@"` an die P1-CLI uebergibt. Dadurch bleiben
  Exit-Code, stdout/stderr und Signale des Runners erhalten; keine Council-Logik in den Bash-
  Router duplizieren.
- Der dokumentierte und getestete Einstieg bleibt ausschliesslich
  `bash scripts/vda.sh council ...`; keinen zweiten Taskfile-, Wrapper- oder Direktaufruf als
  gleichwertige Benutzeroberflaeche einfuehren.
- Die Hilfe muss die Zuweisung registrierter Runtime-IDs ausdruecken, darf aber keine konkrete
  Provider-/Modell-ID als Konfiguration festschreiben. Ausfuehrliche Optionshilfe verbleibt bei
  `bash scripts/vda.sh council --help` in P1.

### 2. Lokale Council-Laufartefakte ignorieren

In `.gitignore` einen benannten Abschnitt fuer `.council/` ergaenzen. Der Eintrag ignoriert den
gesamten lokalen Run-Root, den P1 unter `.council/runs/<run-id>/` schreibt, damit Prompts,
Modellantworten, Ballots und Provenienz-Snapshots nicht versehentlich committed werden.
Keine feinere Negativregel fuer einzelne Run-Dateien anlegen: die Artefakte sind vollstaendig
ephemer und koennen nutzerspezifische Fragestellungen enthalten.

### 3. Council einmalig in der Werkzeug-Registry beschreiben

In `docs/agent-guide/registry/tools.yaml` einen Eintrag mit stabiler ID `ai-council` anlegen und
die vorhandene Registry-Form vollstaendig befuellen:

- `kind: task`, `harness: both`, Thema/Phase passend zu Planung und Entscheidung sowie
  `danger: safe`, weil der Council nur beraten und lokale Run-Artefakte schreiben darf.
- Deutscher Name und Kurztexte erklaeren unabhaengige Positionen, Kreuzpruefung, explizite
  Ballots, sichtbare Einwaende und die moeglichen Eskalationen `HUMAN_REQUIRED` bzw.
  `INSUFFICIENT_EVIDENCE`; weder Einstimmigkeit noch automatische Umsetzung versprechen.
- `how_to_start_de` und `init_prompt_de` nennen den kanonischen Aufruf
  `bash scripts/vda.sh council`, wiederholbare `--member <runtime-id>[=<mandat>]`, `--question`
  beziehungsweise `--prompt-file` und optional `--chair <runtime-id>`. Beispiele verwenden
  Runtime-IDs nur als Aufrufparameter und behaupten keine dauerhafte Modellbindung.
- Guardrail-/Fehlertext macht deutlich: Runtime-IDs werden beim Lauf gegen die bestehende
  Agenten-Registry aufgeloest, gleiche aufgeloeste Modellidentitaeten zaehlen nicht mehrfach
  fuer die Evidenz, und ein Council-Ergebnis fuehrt keine Code-, Factory- oder Prod-Aktion aus.
- Passende Aliase und Beziehungen auf `dev-flow-plan` eintragen, sodass Suche und Navigation den
  Council als vorgeschaltete Beratungsstufe finden. Keine zweite Council-Mitgliederliste in der
  Tool-Registry pflegen.

Vor der Emission die Registry mit dem vorhandenen Validator pruefen, damit fehlende Pflichtfelder,
ungueltige Referenzen oder doppelte IDs fail-closed auffallen:

```bash
node scripts/agent-guide/validate.mjs
```

### 4. Alle abgeleiteten Oberflaechen deterministisch regenerieren

Nach der einzigen inhaltlichen Registry-Aenderung `task agent-guide:emit` ausfuehren und nur die
vom Generator gelieferten Ergebnisse uebernehmen:

- `components/website/src/lib/agent-guide.generated.json` erhaelt den neuen Tool-Datensatz fuer
  die Web-Oberflaeche.
- `docs/agent-guide/20-werkzeuge.md` erhaelt die generierte Council-Werkzeugkarte.
- `docs/agent-guide/maps/tools-map.md` erhaelt die neue Council-Zeile und deren Beziehungen.
- `components/website/src/lib/platform-descriptions.generated.json` wird durch das Umbrella-Ziel
  ebenfalls deterministisch aus `components.yaml` erzeugt. Da dieser Partial `components.yaml`
  nicht aendert, ist fuer diese Datei **keine inhaltliche Aenderung erwartet**; eine unerwartete
  Differenz ist als Generator-/Ausgangsdrift zu untersuchen und nicht von Hand zu korrigieren.

Die drei Council-relevanten Ausgaben niemals direkt editieren. Einen zweiten Lauf von
`task agent-guide:emit` anschliessen und danach pruefen, dass `git diff` fuer die vier generierten
Zieldateien unveraendert bleibt; dies belegt die deterministische Emission.

### 5. Partial-Verifikation und Uebergabe an P3

Folgende Checks ausfuehren:

```bash
bash -n scripts/vda.sh
bash scripts/vda.sh help
node scripts/agent-guide/validate.mjs
task agent-guide:emit
git diff --check -- scripts/vda.sh .gitignore docs/agent-guide/registry/tools.yaml components/website/src/lib/agent-guide.generated.json components/website/src/lib/platform-descriptions.generated.json docs/agent-guide/20-werkzeuge.md docs/agent-guide/maps/tools-map.md
```

Manuell im Help-Output bestaetigen, dass `council` genau einmal erscheint. Die semantischen
Dispatch-, SSOT- und Read-only-Vertraege werden nicht mit Source-Greps als Ersatztest in diesem
Partial festgeschrieben; P3 deckt sie in `tests/unit/vda-council.bats` ab und haengt deshalb von
P1 und diesem Partial ab.

## Nicht im Scope

- Council-Engine, Registry-Aufloesung, Prozesssteuerung oder Entscheidungslogik aus P1
- Tests und Test-Inventar aus P3
- Aenderungen an Agent-/Modellregistries oder ihren Drift-Guards
- Direkte Handarbeit in generierten JSON-/Markdown-Dateien
- Taskfile-, CI-, Factory-, Deployment- oder Produktivanschluss
