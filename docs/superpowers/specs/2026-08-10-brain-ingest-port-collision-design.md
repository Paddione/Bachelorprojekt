# brain-ingest sendet an den Reranker — Port-8093-Kollision auflösen

_Ticket: T003203 · 2026-08-10 · Vorgang 1 von 3 der LLM-Stack-Konsolidierung_

## Problem

`scripts/brain-ingest.sh` schickt seine Chat-Completions per Default an `localhost:8093`.
Dort lauscht der kubectl-Port-Forward auf `svc/llm-gateway-rerank`. Reproduziert am
2026-08-10:

```
POST http://127.0.0.1:8093/v1/chat/completions
→ 500  {"error":{"message":"the current context does not logits computation. skipping"}}
```

Das ist kein blockierter Start, sondern ein aktiver Fehlerpfad: Wer `brain-ingest.sh` ohne
gesetztes `LM_STUDIO_URL` aufruft, spricht mit einem Reranker, der keine Logits berechnet.

### Ursache

Port 8093 trägt zwei Bedeutungen. Beide sind einzeln begründet; keine kannte die andere.

| Anspruch | Herkunft | Belege |
|---|---|---|
| **Bonsai-Erbe** | llama-server auf dem Windows-GPU-Host | Loadout `brain-ingest` in `scripts/llm/loadouts.json`; Backend `llamacpp-bonsai`; Default in `scripts/brain-ingest.sh:43` |
| **Rerank-Forward** | seit T002551 produktiv | `scripts/bge-mcp/bge-forward-rerank.service`; `bge-mcp.service` (`LLM_RERANKER_URL`) |

Die Unit begründet ihre Portwahl ausdrücklich: *„Lokal 8093 und NICHT 8082: 8082 ist auf dem
Windows-Host von einem svchost belegt."* Die Bonsai-Seite ist älter und dokumentiert ihren
Anspruch in `scripts/llm-host-setup.sh` — dort allerdings für eine andere Maschine (siehe
unten).

### Der Vorfall hat einen Vorgänger

`scripts/factory/provider-register-local.sh:7-8` hält fest, dass schon einmal ein
Factory-Provider fälschlich auf 8093 zeigte:

> „'ternary-bonsai-27b' mit base_url `http://127.0.0.1:8093/v1`. Beides war zu dem Zeitpunkt
> falsch: Port 8093 serviert seit T002551 den bge-Reranker."

Dieselbe Wurzel, anderer Betroffener. `brain-ingest` ist der zweite Fall. Ein dritter ist
unten als Nebenbefund notiert. Die Fehlerklasse wiederholt sich, weil es keine gemeinsame
Sicht auf die lokale Portbelegung gibt — nicht, weil jemand unsorgfältig war.

### Was *keine* Kollision ist

`scripts/llm-host-setup.sh` nennt 8093 viermal, meint aber `${LLM_HOST_IP:-192.168.100.10}:8093`
— den Windows-Host über `wg-mesh`, nicht `localhost`. Firewall-Regel und Diagnoseausgabe
bleiben unangetastet. Diese Unterscheidung ist auch für den Guard maßgeblich: nur lokale
Ansprüche zählen.

## Entscheidungen

### brain-ingest weicht, nicht der Forward

Der Rerank-Forward läuft produktiv, hängt an `bge-mcp` (`LLM_RERANKER_URL`) und seine
Portwahl ist durch den svchost-Konflikt auf 8082 begründet. Das Bonsai-Erbe zeigt dagegen auf
einen Host, den es in dieser Form nicht mehr gibt; das Loadout `brain-ingest` ist längst ein
lokaler Ersatz auf `gptoss20`, der nur Namen und Port geerbt hat.

Verworfen wurde außerdem, `brain-ingest` ganz abzuschaffen und auf den llm-proxy umzustellen.
Das löst zwar zusätzlich eine Doppelstruktur, greift aber tiefer in die Brain-Pipeline ein,
als dieser Fix rechtfertigt.

### Zielport ist 8100

Nicht 8097: `scripts/factory/provider-register-gptoss.sh:31` registriert dort einen
Factory-Provider (`BASE_URL="http://127.0.0.1:8097/v1"`). Der Block 8089–8099 ist bis auf
8097 vollständig durch Loadouts belegt, 8100 liegt sauber außerhalb.

### llamacpp-bonsai bleibt deaktiviert

Die `base_url` wird auf 8100 mitgezogen, damit die Konsistenz-Invariante greift. `enabled`
bleibt `false`. Grund: der llm-proxy meldet bereits dauerhaft `ready: false`. Von sieben als
degraded gemeldeten Backends tragen sechs `priority=1` und gehören sämtlich der
`exclusiveGroup` `chat-gpu` an — sie können per Definition nicht gleichzeitig laufen. Ein
weiteres dauer-degradiertes Backend würde das Signal nur zusätzlich verwässern. Der Widerspruch ist als **T003202** erfasst und wird dort
entschieden; `brain-ingest.sh` spricht den Port ohnehin direkt an und braucht den Proxy nicht.

## Änderungen

| Datei | Änderung |
|---|---|
| `scripts/llm/loadouts.json` | `brain-ingest.port` 8093 → 8100 |
| `scripts/brain-ingest.sh:43` | Default `localhost:8093` → `localhost:8100` |
| `scripts/migrations/2026-08-10-brain-ingest-port.sql` *(neu)* | `llamacpp-bonsai.base_url` → `http://127.0.0.1:8100/v1`, `enabled` unverändert `false` |
| `tests/spec/local-llm-proxy/brain-ingest-port.bats` *(neu)* | beide Invarianten |

Nach der Änderung an `loadouts.json` ist `task llm:loadouts:format` auszuführen — die Datei
hat eine kanonische Form, die `task llm:loadouts:check` fail-closed erzwingt.

Die Migration trägt im Kopfkommentar die Apply-Zeilen für **beide** Brands; mentolder und
korczewski haben getrennte Datenbanken.

### Datenfluss nachher

```
brain-ingest.sh ──► :8100   Loadout brain-ingest (gptoss20, parallel=4)
bge-mcp ──────────► :8081   Forward → llm-gateway-embed    (unverändert)
        └─────────► :8093   Forward → llm-gateway-rerank   (unverändert)
```

Der laufende RAG-Pfad wird nicht angefasst.

## Guard

Zwei Invarianten in `tests/spec/local-llm-proxy/brain-ingest-port.bats`. Beide prüfen
Repo-Artefakte statt Laufzeitzustand, laufen also in CI ohne besondere Ausstattung. Benötigt
werden nur `jq` und `grep`.

### Invariante 1 — Loadout gegen Port-Forward

Kein Port aus `loadouts.json` darf zugleich die **lokale** Seite eines `port-forward` in
`scripts/bge-mcp/*.service` sein.

Ausdrücklich **nicht** geprüft wird „jeder Port genau einmal". Loadouts derselben
`exclusiveGroup` dürfen sich einen Port teilen, weil sie nie gleichzeitig laufen; die Warnung
davor steht in `tests/spec/local-llm-proxy/qwen3-coder-loadout.bats`. Ein Loadout und ein
Port-Forward hingegen können nie koexistieren — der Forward läuft permanent.

### Invariante 2 — Konsistenz über drei Deklarationen

`brain-ingest`-Loadout-Port ≡ Default in `brain-ingest.sh` ≡ Port in der Migrationszeile für
`llamacpp-bonsai`.

Geprüft wird gegen die **Migrationsdatei**, nicht gegen die Datenbank. CI hat keine DB; ein
DB-Test würde dort skippen und damit die Ausstattung des Runners messen statt den Zustand des
Codes (T002716). Das Muster stammt aus `qwen3-coder-loadout.bats`, das die
Proxy-Registrierung auf demselben Weg prüft.

### Gemeinsame Regeln beider Invarianten

- **Positiv-Anker zuerst** (T002356-M1): Vor jeder Negativ-Aussage wird belegt, dass die
  Extraktion nicht leer ist und einen bekannten Port enthält. Ohne ihn bestünde der Test
  vakuos, sobald ein `grep` ins Leere läuft — genau die Lücke, gegen die
  `openspec/specs/divergence-guard.md:141` argumentiert.
- **Nur lokale Ansprüche:** `127.0.0.1` und `localhost`. Der wg-mesh-Port aus
  `llm-host-setup.sh` zählt nicht.
- **Nur nicht-kommentierte Zeilen:** `provider-register-local.sh` und `llm-proxy/fixups.mjs`
  nennen 8093 in Historien-Kommentaren. Würden sie mitzählen, produzierte der Guard
  Fehlalarme.
- **Output- statt Source-Verifikation** im Sinne von T002448-M4 ist hier nicht anwendbar: Die
  Invariante existiert ausschließlich in der Beziehung zweier Deklarationen, nicht im
  Laufzeitverhalten einer Komponente. Das ist die in CLAUDE.md benannte Ausnahme; die
  Testdatei hält den Prüfmodus im Kopfkommentar fest.

## Rot-Grün

Invariante 1 ist **vor** dem Fix rot: 8093 steht sowohl in `loadouts.json` als auch in
`bge-forward-rerank.service`. Die Rotphase entsteht damit aus dem realen Defekt und muss
nicht künstlich erzeugt werden.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/brain-ingest-port.bats
# vor dem Fix:  FAIL
# nach dem Fix: PASS
```

Ein `command -v`-Verfügbarkeitsguard ist nicht nötig, weil keine externe Abhängigkeit im
Spiel ist.

## Abgrenzung

Nicht Teil dieses Vorgangs:

- **T003202** — der llm-proxy meldet dauerhaft `ready: false`, weil die Readiness-Definition
  (`local-llm-proxy.md:303`) der `exclusiveGroup`-Semantik (`:577`) widerspricht.
- **Vorgang 2** — Messreihe qwen3-coder gegen gptoss-context, danach Routing-Entscheidung und
  Abschaltung von `devstral-quality`.
- **Vorgang 3** — bge-embed und bge-rerank in den llm-proxy holen (CPU als `priority=1`,
  Cluster-Gateways als `priority=2`).
- **Bonsai-Reste** in `scripts/llm-host-setup.sh` und `taskfiles/Taskfile.llm.yml`: Sie
  beschreiben den Windows-Host und sind keine lokalen Portansprüche. Sie bleiben unverändert.

### Nebenbefund

`scripts/factory/provider-register-gptoss.sh:31` registriert einen Provider auf `:8097`,
während `gptoss-context` auf `:8098` läuft. Das ist der dritte Fall derselben Fehlerklasse.
Er wird hier festgehalten, aber nicht gefixt — der Guard dieses Vorgangs erfasst ihn nicht,
weil er Loadouts gegen Port-Forwards prüft und nicht Factory-Provider gegen Loadouts. Eine
Erweiterung wäre möglich und gehört in einen eigenen Vorgang.
