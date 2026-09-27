---
title: "pi-harness — Design"
ticket_id: T900529
status: draft
---

# pi-harness — Design

## Entscheidungen (User, 2026-09-27)

| ID | Frage | Entscheidung |
|----|-------|--------------|
| D1 | Werkzeuge | Nur CLI + Skills. Kein MCP, keine Extensions. |
| D2 | Umfang | Trial-Runner. `factory-runner` bleibt unverändert. |
| D3 | Modell | Lokal, OpenAI-kompatibler Endpunkt `127.0.0.1:1919` (derselbe wie opencode-Default). |
| D4 | Registry | Laufzeit-Ableitung statt generierter Datei: der Runner liest `capabilities.yaml` direkt. |
| D5 | Modellquelle (Nachtrag 2026-09-27, ersetzt D3) | Jedes Modell aus dem LM-Link/Tailscale-Verbund: der Runner fragt eine Liste OpenAI-kompatibler Endpunkte ab (Default `:1919` llama-server und `:1234` LM Studio, das die LM-Link-Geräte durchreicht) und löst `--model` gegen alle auf. Kein Cloud-Provider. |
| D6 | Aufrufer (Nachtrag 2026-09-27) | Orchestrierbar ohne Vorwissen: `--list-models`, JSON-Bericht, stabile Exit-Codes, eigenes Agent-Verzeichnis je Lauf für parallele Aufrufer. |

## Komponenten

### 1. Registry-Rolle `pi`

- `pi` wird in `VALID_ROLES` von `scripts/toolset/check.mjs` und `scripts/toolset-context.sh`
  aufgenommen.
- Explizit-Regel: Für die Rolle `pi` gilt `roles: [all]` **nicht**. `toolset-context.sh pi`
  gibt nur Instanzen aus, deren `roles` den Eintrag `pi` wörtlich enthalten. Grund: Fast alle
  Basis-Skills sind `all`; mit Wildcard erbte Pi den vollen Katalog, den das Experiment gerade
  vermeiden soll.
- Anfangszustand: keine Instanz trägt `pi`. L3 ist damit bis zur ersten Freigabe identisch mit L2.

### 2. Installation (`taskfiles/Taskfile.pi.yml`, eingebunden als Namespace `pi:`)

- `install`: `npm install -g @mariozechner/pi-coding-agent@<PI_VERSION>` (Default `0.73.1`,
  Node ≥ 20.6 — vorhanden ist 22.23), danach `pi --version`.
- `status`: Version, Agent-Verzeichnis, Erreichbarkeit von `127.0.0.1:1919/v1/models`.
- `uninstall`: `npm uninstall -g` und Entfernen des Agent-Verzeichnisses.
- Agent-Verzeichnis: `${XDG_STATE_HOME:-$HOME/.local/state}/pi-harness/agent` via
  `PI_CODING_AGENT_DIR`. `~/.pi` bleibt unberührt.
- `PI_OFFLINE=1` in jedem Aufruf: keine Telemetrie, keine Update-Checks.

### 3. Trial-Runner `scripts/pi-run.sh`

Aufruf: `scripts/pi-run.sh <T-ID|pfad/tasks.md> [--level L0|L1|L2|L3] [--model <id>] [--dry-run]`

Basis-Flags jeder Stufe: `--mode json --no-session -nc --no-skills --no-extensions
--no-prompt-templates --no-themes --provider local --model <id>`.

| Stufe | Zusätzlich | Tools |
|-------|-----------|-------|
| L0 | Plan-Text als Prompt | `read,write,edit,bash` |
| L1 | `--append-system-prompt "$(cat .pi/context.md)"` | wie L0 |
| L2 | wie L1 | `read,write,edit,bash,grep,find,ls` |
| L3 | wie L2 plus `--skill <pfad>` je Registry-Skill der Rolle `pi` | wie L2 |

- Plan-Auflösung: T-ID → `plan=` aus dem `FACTORY-PLAN-REF`-Kommentar (`scripts/ticket.sh get`); Pfad → direkt.
- `models.json`: vor jedem Lauf aus `GET http://127.0.0.1:1919/v1/models` ins Agent-Verzeichnis
  geschrieben (`api: openai-completions`, `compat.supportsDeveloperRole: false`). Ohne `--model`
  wird die erste gelistete ID genommen.
- `.pi/context.md` (neu, ≤ 60 Zeilen): Worktree-Regel, Commit-Konvention, Testaufruf
  (`task test:changed`), Verbot von Pushes auf `main`.
- Log: `.pi/runs/<ticket>-<stufe>-<zeitstempel>.jsonl` (gitignored).
- Ergebnis: Exit-Code von Pi, Anzahl geänderter Dateien (`git diff --stat`), Exit-Code von
  `task test:changed`. Mit T-ID als Ticket-Kommentar über `scripts/ticket.sh add-comment`.
- `--dry-run` gibt nur die Pi-Kommandozeile aus, ohne Endpunkt-Probe und ohne Pi-Aufruf.

### Fehlerbehandlung

- Endpunkt nicht erreichbar oder leere Modellliste: Exit 2, Meldung nennt URL und Ursache. Kein
  Ausweichen auf Cloud-Provider.
- `pi` nicht installiert: Exit 2 mit Hinweis `task pi:install`.
- Unbekannte Stufe: Exit 1 mit Liste der gültigen Stufen.

### 4. Endpunkt-Verbund und Aufrufer-Vertrag (D5, D6)

- Endpunkte: `PI_ENDPOINTS` (Komma- oder Leerzeichen-getrennte Basis-URLs, Default
  `http://127.0.0.1:1919,http://127.0.0.1:1234`). `PI_LOCAL_BASE_URL` bleibt als Einzel-Override
  und ersetzt die Liste. Tailnet-Hosts (`http://<host>.<tailnet>.ts.net:<port>`) sind gewöhnliche
  Einträge.
- Discovery je Endpunkt `GET /v1/models`. Ein stummer Endpunkt wird mit URL auf stderr gemeldet,
  der Lauf bricht erst ab (Exit 2), wenn kein Endpunkt ein Modell liefert. Embedding- und
  Reranker-Modelle (`embed`, `rerank` in der ID) werden ausgefiltert.
- `models.json` enthält einen Provider je Endpunkt (`ep-<host>-<port>`), `contextWindow` aus
  `meta.n_ctx`, falls der Server es meldet.
- `--model <id>`: exakte ID, erster Endpunkt in Listenreihenfolge gewinnt; `--provider` wird
  daraus abgeleitet. Unbekannte ID: Exit 2 mit Liste der verfügbaren Modelle, Pi startet nicht.
- `--list-models`: `modell<TAB>endpunkt` je Zeile (mit `--json` ein JSON-Array), Exit 0 bzw. 2.
- `--json`: Bericht als ein JSON-Objekt auf stdout (`level, plan, endpoint, provider, model,
  pi_exit, changed_files, test_exit, log`).
- `--skip-tests`: `task test:changed` entfällt, `test_exit` ist `null`. Für Aufrufer, die selbst
  verifizieren.
- Agent-Verzeichnis je Lauf unter `.../pi-harness/agent/runs/<id>`, nach dem Lauf entfernt.
  Parallele Läufe überschreiben sich damit nicht gegenseitig `models.json`.

## Tests

- `tests/spec/pi-harness.bats`: Flag-Aufbau je Stufe über `--dry-run` (Output-Prüfung), Exit 2
  bei fehlendem Endpunkt (Port ohne Lauscher), Exit 1 bei unbekannter Stufe, Taskfile-Syntax.
- `tests/spec/toolset-registry.bats` bzw. `scripts/toolset/check.test.mjs`: Rolle `pi` gültig;
  `toolset-context.sh pi` enthält keine `all`-Instanz.

## Risiken

- R1: Unsere `SKILL.md` referenzieren teils Claude-only-Tools. Deshalb startet die Freigabe
  leer; jede Aufnahme in `pi` ist eine bewusste Einzelentscheidung.
- R2: `:1919` läuft Windows-seitig und ist nicht immer online, der LM-Studio-Server `:1234` ist
  unabhängig von geladenen Modellen oft aus. Stumme Endpunkte werden gemeldet, erst ein leerer
  Verbund bricht ab.
- R3: `sync.mjs` rendert Pi nicht. Das ist gewollt (D4); `toolset-registry` bekommt dafür eine
  eigene Requirement, damit die Ausnahme dokumentiert ist.
