# Proposal: zielfamilie-llm-stack

## Why

Der LLM-Stack trägt inzwischen mehrere Kernfunktionen: Embedding und Reranking für die gesamte
Suche, die Software Factory läuft seit 2026-07-27 über den Proxy auf Gemma, der Task-Oracle routet
über Ollama, der Brain-Ingest braucht ein Modell. Sein Betriebszustand war bis PR #3641 in keiner
Zielfamilie erfasst.

Seither existieren `G-LLM01` und `G-LLM02` in `.claude/lib/goals.md` und
`scripts/health-goals-check.sh`. Dieser Vorgang setzt dort auf, weil eine Messrunde am 2026-08-02
zeigt, dass **beide bestehenden Ziele heute keine belastbare Aussage liefern** und drei der fünf im
Ticket geforderten Zielarten ganz fehlen.

### Befund 1: `G-LLM01` hat noch nie eine Zahl geliefert

Der Messbefehl macht `json.load('scripts/llm/loadouts.json')` und iteriert direkt über das
Ergebnis. Die Datei ist aber ein Objekt mit den Schlüsseln `version`, `modelRoots`, `defaults`,
`loadouts`; die Iteration liefert Strings, `str.get` existiert nicht, der `except`-Zweig gibt `-`
aus. Nachgestellt am 2026-08-02:

```
AttributeError: 'str' object has no attribute 'get'   ->   Ausgabe "-"   ->   SKIP
```

Ein zweiter, unabhängiger Defekt daneben: der Filter verlangt `kind == 'llamacpp'`. Kein
Loadout-Eintrag hat überhaupt einen Schlüssel `kind`. Auch nach Behebung der Iteration wäre die
Liste leer und die Ausgabe `n/a`. Das Ziel ist seit seiner Einführung strukturell unmessbar.

### Befund 2: `G-LLM02` meldet vakuos grün

Die tatsächliche Antwort des llm-proxy (`:18235/health`, gemessen 2026-08-02):

```json
{"status":"ok","ready":true,"degraded":[{"name":"deepseek"},{"name":"opencode-zen"}],"checked":3}
```

Der Messbefehl zählt `data.get('providers', [])`. Ein Schlüssel `providers` existiert in dieser
Antwort nicht. Die Summe über die leere Vorgabeliste ist `0`, das Ziel meldet **0 = erreicht** —
während zwei von drei Backends tot sind. Das ist exakt die Klasse, die `T002356-M1` verbietet: eine
fehlende Grundlage erzeugt eine leere Liste und damit trivial grün.

Zusätzlich gibt der Zweig für `ready == false` den Text `degraded` aus. `health-goals-check.sh`
vergleicht mit `[ "$actual" -le 0 ]`, was auf einem nicht-numerischen Wert einen Shell-Fehler
erzeugt, und schreibt den Wert bei gesetztem `HG_VALUES_FILE` in die Rohdaten für
`health-goals-update.sh`.

### Befund 3: Die Ticket-Belege vom 28.07. sind größtenteils überholt

Messrunde 2026-08-02, alle Werte frisch erhoben:

| Ticket-Aussage (28.07.) | Stand 02.08. |
|---|---|
| llm-proxy `degraded`, `ready false`, alle drei Provider tot | `ready: true`, 2 von 3 Backends degradiert (`deepseek`, `opencode-zen` auf `:5099`) |
| `:8095` und `:8096` antworten, `:8091`/`:8093`/`:8094` down | `:8095` durch T002551 dekommissioniert; `:8091` (gemma26-factory) und `:8093`/`:8096` (Reranker) antworten; `:8094`, `:8098`, `:8099` down |
| `:8098` meldet `gptoss-mcp` statt `gptoss-context` | auf `:8098` lauscht nichts mehr; der Drift-Fall ist derzeit nicht reproduzierbar |
| llm-proxy hat keinen Autostart | `scripts/llm-proxy/llm-proxy.service` existiert, ist `enabled` und läuft; Installationsweg ist `task llm:proxy:install-service` |
| tote Endpunktverweise in `environments/*.yaml` (LM Studio `:1234`) | dort steht kein Host-Endpunkt mehr, nur Cluster-DNS `llm-gateway-*.svc:8081`; `LLM_LMSTUDIO_URL` ist aus `environments/schema.yaml` entfernt |

Übrig bleiben zwei **real messbare** offene Fälle: `scripts/llm/ollama.service` ist im Repo
deklariert, aber als Unit nicht installiert, und `:11434` antwortet nicht — obwohl der Task-Oracle
primär dorthin routet. Und der Proxy führt mit `opencode-zen` ein Backend auf
`http://127.0.0.1:5099`, auf dem kein Listener lauscht. Letzteres ist der direkte Nachfolger des
LM-Studio-`:1234`-Falls.

### Befund 4: `exclusiveGroup` macht die naive Verfügbarkeitsmessung unbrauchbar

Alle fünf Loadouts liegen in `exclusiveGroup: chat-gpu` auf den Ports 8098, 8099 und 8091 (drei
Slugs teilen sich 8091). Die Gruppe teilt sich eine GPU, es kann konstruktionsbedingt **immer nur
einer laufen**. Ein Ziel „alle Loadout-Ports müssen antworten" wäre dauerhaft rot und könnte nie
grün werden — ein unerreichbares Ziel wird ignoriert und ist damit wertlos. Die Messung muss pro
`exclusiveGroup` fragen, ob **mindestens ein** Mitglied antwortet.

## What Changes

Die Familie wächst von zwei auf fünf Ziele. Beide Bestandsziele werden repariert, nicht ersetzt.

| ID | Status | Was gemessen wird |
|---|---|---|
| `G-LLM01` | geschärft | `exclusiveGroup`s ohne ein einziges erreichbares Mitglied plus gruppenlose Loadout-Ports ohne Listener |
| `G-LLM02` | geschärft | Degradierte Backends laut `/health` des llm-proxy; ein nicht-bereiter Proxy zählt alle geprüften Backends |
| `G-LLM03` | neu | Laufende Modellserver, deren gemeldete Modell-ID für ihren Port in `loadouts.json` nicht geführt ist |
| `G-LLM04` | neu | Im Repo deklarierte LLM-Stack-Units ohne installierten Autostart |
| `G-LLM05` | neu | Lokale LLM-Endpunkte aus der Proxy-Backend-Registry ohne Listener |

Die Messlogik zieht aus den Ziel-Prosablöcken in eine Quelle: `scripts/lib/llm-stack-measure.sh`.
`goals.md` und `health-goals-check.sh` rufen sie nur noch auf. Das ist derselbe Zuschnitt, den
`T002443` für `scripts/lib/wt-hygiene-measure.sh` wählt.

## Entscheidungen

1. **Lokal, nicht CI.** Die Familie misst den Zustand des GPU-Hosts und der WSL-Seite. Ein
   CI-Runner hat keinen davon; dort wären alle fünf Ziele strukturell grün und damit wertlos.
   Messort ist `task freshness:check` auf der Entwicklermaschine, mit sichtbarer Skip-Notiz unter
   `CI`.
2. **`n/a` statt `0`.** Fehlt die Messgrundlage, ist die Ausgabe `n/a`; `health-goals-check.sh`
   zählt das als übersprungen, nicht als erreicht. Übernommen aus `T002443`.
3. **Kein Fail im Merge-Gate.** Der Block in `freshness:check` warnt und lässt den Exit-Status
   unverändert.
4. **Ein gemeinsamer Anker für die Host-Erreichbarkeit.** `G-LLM01`, `G-LLM03` und `G-LLM05`
   können einen toten Host nicht von einem toten Dienst unterscheiden. Anker ist deshalb
   `/livez` des llm-proxy: antwortet der nicht, ist die lokale LLM-Seite als Ganzes aus und die
   drei Ziele melden `n/a`. `/livez` ist reine Liveness und sagt nichts über Backends aus, der
   Anker ist also nicht zirkulär zu `G-LLM02`.
5. **Nur der eigene ID-Bereich wird angefasst.** In `goals.md` ausschließlich der Block von
   `## G-LLM01` bis vor `## G-WT01`; in `health-goals-check.sh` ausschließlich die Sektion
   `LLM-TARGETS`. `T002443` arbeitet spiegelbildlich nur in `WT-TARGETS`. Der Warn-Block in
   `freshness:check` wird nicht dupliziert: die `G-LLM*`-IDs werden an die von `T002443` angelegte
   Variable `HG_LOCAL_ONLY_GOALS` angehängt. Merged dieser Vorgang zuerst, legt er die Variable mit
   den `G-LLM*`-IDs an, und `T002443` hängt seine an.

## Abgrenzung zur Schnittstellen-Familie

Die Überschneidung ist real: `G-IF01` misst „MCP-Endpunkte ohne Listener", `G-IF03` misst
„Konfig-gegen-Laufzeit-Drift (MCP-Registry vs Cluster)". Beide beschreiben abstrakt dieselben
Fehlerbilder wie `G-LLM05` und `G-LLM03`.

**Die Regel ist das deklarierende Artefakt, nicht die Fehlerart.** Ein Endpunkt gehört der Familie,
deren SSOT-Artefakt ihn führt:

| Deklarierendes Artefakt | Familie |
|---|---|
| `docs/agent-guide/registry/mcp.yaml`, `.mcp.json`, `scripts/llm/mcp-servers.json` | `G-IF` |
| `scripts/llm/loadouts.json`, `tickets.llm_proxy_backends`, `*.service` des LLM-Stacks | `G-LLM` |

Damit ist der Grenzfall entschieden, der im Ticket steht: der `:8098`-Server meldete sich als
`gptoss-mcp` und hostete 40 MCP-Tools — der **Endpunkt** ist aber in `loadouts.json` deklariert,
also führt `G-LLM03` den Fall. `G-IF03` bleibt beim Portabgleich Registry gegen Cluster, `G-LLM03`
misst Modellnamen-Drift; das sind verschiedene Aussagen über verschiedene Artefakte.

Damit die Regel nicht nur Prosa bleibt, filtert `G-LLM05` Endpunkte, die in der MCP-Registry
geführt sind, aktiv heraus, und ein Test belegt das.

## Impact

- `.claude/lib/goals.md` (Block `G-LLM01` bis `G-LLM05`)
- `scripts/health-goals-check.sh` (nur Sektion `LLM-TARGETS`)
- `scripts/lib/llm-stack-measure.sh` (neu)
- `tests/spec/health-goals/llm-stack-goals.bats` (neu)
- `Taskfile.yml` (`health:llm`, `HG_LOCAL_ONLY_GOALS`, Warn-Block in `freshness:check`)
- generiert: `website/src/lib/goals-data.generated.json`, `website/src/data/test-inventory.json`

Kein Produktionsverhalten ändert sich; die Änderung ist reine Messinfrastruktur.

## Nicht in diesem Vorgang

- **T002580** (`bge-embed` wird im Cluster wiederholt OOMKilled, 10 Restarts bei
  `limits.memory: 2Gi`) wird nicht mitbehoben. Er ist hier nur Messbedingung: ein Dienst im
  Restart-Zyklus liefert je nach Messzeitpunkt verschiedene Ergebnisse. Die Cluster-Dienste
  (`llm-gateway-embed` und `-rerank` auf `:8081`) sind deshalb **nicht** Gegenstand dieser Familie —
  sie sind über `G-OPS01` (Pods nicht Running/Ready) bereits erfasst.
- Reparatur der gefundenen Verletzungen selbst (`ollama.service` installieren, `opencode-zen`
  aus der Backend-Registry nehmen). Die Familie macht sie sichtbar; das Beheben ist eigene Arbeit.
