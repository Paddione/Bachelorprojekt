---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-23
---

# Design: bge-m3 + bge-reranker-v2-m3 auf persistente llama.cpp-GPU-Server

**Ticket:** T002110
**Parent-SSOT:** `openspec/specs/llm-pipeline.md`
**Nebenberührung:** `openspec/specs/local-llm-proxy.md` (Bonsai-Slot-Budget)

## Purpose

Die Embedding- und Rerank-Modelle der Plattform laufen heute in einem Zustand, den niemand so
entworfen hat: `bge-m3` als TEI-Docker-Container auf **CPU mit float32**, `bge-reranker-v2-m3`
**überhaupt nicht** (`tei-rerank.service` ist tot), und der ehemals zentrale LM-Studio-Endpunkt
`:1234` existiert nicht mehr — `lmstudio-socat.service` forwarded seit unbekannter Zeit ins Leere.
Dass der Reranker-Ausfall unbemerkt blieb, liegt an `website/src/lib/rerank.ts`, das jeden Fehler
verschluckt und stillschweigend `score: 0` für alle Dokumente zurückgibt: Die Suche funktioniert
weiter, nur ohne Reranking, und nichts im System meldet das.

Dieser Change überführt beide Modelle als vorhandene Q8_0-GGUFs auf zwei persistente
`llama-server`-Instanzen mit GPU-Offload, entfernt die gesamte Docker-plus-socat-Zwischenschicht,
macht den stillen Rerank-Ausfall sichtbar und schafft nebenbei einen vierten parallelen
Subagenten-Slot auf dem Bonsai-Server.

## Ausgangslage (verifiziert 2026-07-23)

| Komponente | Zustand |
|---|---|
| LM Studio `:1234` | Prozess weg, antwortet nicht |
| `lmstudio-socat.service` | aktiv, forwarded ins Leere |
| `bge-m3` | TEI-Docker `127.0.0.1:9081`, `cpu-1.9`, **float32**, `pooling: cls`, via `tei-socat.service` auf `0.0.0.0:8081` |
| `bge-reranker-v2-m3` | `tei-rerank.service` **dead**, `:9083` tot; `tei-rerank-socat.service` läuft weiter auf `0.0.0.0:8083` |
| `llama-server.exe` | genau ein Prozess: Bonsai `:8093`, `-np 1 -c 65536 -ctk q4_0 -ctv q4_0 --cache-ram 24576 -ngl 99` |
| Persistenz | **keine** — kein Scheduled Task, kein Dienst, kein Startup-Eintrag, kein Startskript |
| GPU | RTX 5070 Ti, 16303 MiB, 6923 belegt, **9075 MiB frei** |
| GGUFs | `gpustack/bge-m3-GGUF/bge-m3-Q8_0.gguf` (635 MB), `gpustack/bge-reranker-v2-m3-GGUF/bge-reranker-v2-m3-Q8_0.gguf` (636 MB) |
| llama.cpp-Builds | `llama-b10090-13.3` (neuester), `b9957-cuda13.3`, `b9553-cuda13`, `bonsai-cuda13.3` |
| `llm-proxy` `:18235` | läuft (T002102 `done`), aber Bind auf **`127.0.0.1`** → für Cluster-Pods unerreichbar |

## Architektur

### Zwei Server, nicht einer

`llama-server` erzwingt beim `--reranking`-Modus das Pooling `RANK`, beim Embedding-Modus `CLS`.
Ein Prozess kann nur einen davon bedienen — zwei Instanzen sind keine Design-Wahl, sondern eine
Eigenschaft von llama.cpp.

| Rolle | Port | Modell | Kernflags |
|---|---|---|---|
| Embedding | `8095` | `bge-m3-Q8_0.gguf` | `--embedding --pooling cls -ngl 99 -c 8192 -fa on --host 0.0.0.0` |
| Reranking | `8096` | `bge-reranker-v2-m3-Q8_0.gguf` | `--reranking -ngl 99 -c 8192 -fa on --host 0.0.0.0` |

**Binary:** `C:\Users\PatrickKorczewski\llama-b10090-13.3\llama-server.exe` — neuester vorhandener
Build, `llama-server.exe` liegt dort flach im Wurzelverzeichnis (nicht unter `bin/` wie bei
`b9957-cuda13.3`). Die benötigten Flags sind gegen `b9957` verifiziert:
`--pooling {none,mean,cls,last,rank}`, `--embedding`, `--rerank/--reranking`, `-np/--parallel N`.

`--pooling cls` ist für `bge-m3` **zwingend**: Der laufende TEI meldet
`"model_type":{"embedding":{"pooling":"cls"}}`. llama.cpp defaultet ohne dieses Flag auf den
Modell-Default, was bei abweichender GGUF-Metadata systematisch andere Vektoren erzeugt und jeden
bestehenden pgvector-Index entwertet — deshalb explizit setzen statt sich auf den Default zu
verlassen.

`--embd-normalize` bleibt auf dem Default `2` (L2) und deckt sich damit mit dem
`normalize: true`-Verhalten des heutigen TEI. Eine Abweichung hier würde die Äquivalenzmessung
sofort reißen lassen.

`-c 8192` entspricht der `max_input_length` des heutigen TEI. Beide Server binden `0.0.0.0`,
sind damit über wg-gpu (`192.168.100.10`) direkt aus dem Cluster erreichbar — genauso, wie es
LM Studio auf `:1234` war. Kein socat, kein Proxy.

### Warum direkt und nicht über `llm-proxy :18235`

Der `llm-proxy` bindet `127.0.0.1` und bedient Host-Prozesse; ihn auf `0.0.0.0` umzustellen würde
auch den Chat-Pfad exponieren und einen SPOF für die Cluster-Suche schaffen. Embeddings brauchen
zudem keine der Fixup-Transformationen, für die der Proxy gebaut wurde. Die entfallende Kette
`Docker → socat → Endpoint` war genau der Grund, warum der Reranker-Ausfall unbemerkt blieb —
Kettenlänge zu reduzieren ist hier das eigentliche Ziel.

### Datenfluss nach dem Change

```
Cluster-Pod (embeddings.ts) → llm-gateway-embed:8095  → 192.168.100.10:8095 → llama-server (GPU)
Cluster-Pod (rerank.ts)     → llm-gateway-rerank:8096 → 192.168.100.10:8096 → llama-server (GPU)
Host (openspec-embed-local) → 127.0.0.1:8095 (bzw. 192.168.100.10:8095)
```

## Kernrisiko: Vektor-Äquivalenz

Der Wechsel ist **nicht vektor-neutral**: float32-ONNX → Q8_0-GGUF. Dieselben Gewichte, andere
Präzision. Da alle bestehenden pgvector-Einträge gegen die alten Vektoren aufgebaut sind, steht vor
dem Cutover eine Messung:

1. Ein fixes Textsample (mind. 20 Texte, deutsch + englisch, kurz + lang) durch **beide**
   Endpunkte — alt `127.0.0.1:9081/embed`, neu `127.0.0.1:8095/v1/embeddings`.
2. Paarweise Kosinus-Ähnlichkeit, Mittelwert und Minimum.
3. **Gate:** Mittelwert **≥ 0.99** → Cutover. Darunter → **kein Cutover**; der Change endet mit dem
   dokumentierten Messergebnis und einem Folgeticket für den pgvector-Reindex, und die Env-Vars
   bleiben auf TEI.

Der TEI-Container wird deshalb **erst nach** bestandener Messung abgeschaltet — bis dahin ist er
die einzige Referenz. Der Reindex selbst ist per Entscheidung **out of scope** dieses Changes.

## Persistenz

Heute existiert kein Autostart. Verschiebt man die Embeddings ungeschützt auf einen handgestarteten
Windows-Prozess, wird die Verfügbarkeit gegenüber dem systemd-verwalteten TEI-Docker **schlechter**.
Deshalb ist Persistenz Teil des Changes, nicht Folgearbeit:

- Versionierte PS1-Startskripte unter `scripts/llm/` — je eines für Embedding, Rerank und **Bonsai**
  (letzterer läuft heute ohne Skript rein aus der Shell-History).
- Registrierung als Windows Scheduled Task, Trigger `At system startup`, `RunAs SYSTEM`,
  `RestartCount 3` / `RestartInterval PT1M`.
- Ein idempotentes Registrierungsskript, das mehrfach ausführbar ist.
- Notausstieg: Umgebungsvariable `LLM_EMBED_NGL` (Default `99`) wird ins Startskript
  durchgereicht. `LLM_EMBED_NGL=0` legt das Modell bei VRAM-Druck bewusst auf CPU-RAM.
  Bewusst **kein** automatisches Offloading: das würde die Latenz ohne Vorwarnung um
  Größenordnungen verschlechtern.

## Vierter Subagenten-Slot

Der vierte Subagent scheitert heute nicht an VRAM, sondern an `-np 1` auf dem Bonsai-Server: alle
Subagenten teilen sich einen seriellen Slot.

llama.cpp teilt `-c` gleichmäßig auf die Slots auf. `-np 4` bei unverändertem `-c 65536` ergäbe
16k Kontext pro Slot — zu wenig für Factory-Prompts (~37k). `-c` muss also mitwachsen; der
Zielwert wird **gemessen, nicht geschätzt**:

1. Baseline: VRAM nach Start der beiden neuen Embedding-Server erfassen.
2. Bonsai mit `-np 4` und schrittweise steigendem `-c` (131072 → 196608 → 262144) starten,
   VRAM je Stufe messen.
3. Größtes `-c` wählen, bei dem die Belegung ≤ 15000 MiB bleibt (≈1300 MiB Reserve auf 16303 MiB).
4. `--cache-ram` als CPU-seitigen KV-Puffer beibehalten oder anheben.

Rollback ist ein Ein-Zeilen-Rücksprung im Startskript auf `-np 1 -c 65536`.

## Client-Anpassungen

### `website/src/lib/rerank.ts`

Heute TEI-Dialekt: `POST {LLM_RERANKER_URL}/rerank`, Body `{query, texts}`, Antwort als flaches
Array `[{index, score}]`. Ziel ist der llama.cpp-Dialekt: `POST {LLM_RERANKER_URL}/v1/rerank`,
Body `{model, query, documents, top_n}`, Antwort `{results:[{index, relevance_score}]}`.

Bemerkenswert: Der SSOT-Spec beschreibt unter *„Rerank-Endpunkt gibt korrekt sortierte Ergebnisse
zurück (E2E)"* bereits `POST /v1/rerank` mit `results[].relevance_score`. Der Change bringt die
Implementierung damit an den Spec heran, statt von ihm weg.

Zusätzlich: Der `catch`-Block gibt weiterhin `score: 0` zurück (Graceful Degradation bleibt
Requirement), loggt den Fehler aber über `logger.warn` — sonst wiederholt sich der stille Ausfall.

### `website/src/lib/embeddings.ts`

Das Wire-Format `POST {LLM_EMBED_URL}/v1/embeddings` mit `{model, input}` passt bereits exakt zu
llama.cpp. Nur der Default in `embedUrl()` und der veraltete Kommentar über LM-Studio-Routing
ändern sich.

### Konfiguration

| Datei | Änderung |
|---|---|
| `environments/schema.yaml` | `LLM_EMBED_URL`/`LLM_RERANKER_URL`-Beschreibungen auf llama.cpp; `LLM_LMSTUDIO_URL`, `LLM_ROUTER_URL`, `LLM_CHAT_MODEL`, `LLM_CODING_MODEL`, `LLM_EMBED_MODEL_NOMIC` entfernen (alle zeigen auf totes LM Studio) |
| `environments/{dev,mentolder,korczewski,staging,fleet-*}.yaml` | neue Service-URLs, tote Vars raus |
| `k3d/llm-gpu.yaml` | `llm-gateway-lmstudio`, `llm-gateway-tei-embed`, `llm-gateway-tei-rerank` raus; `llm-gateway-embed:8095` und `llm-gateway-rerank:8096` rein; Kopfkommentar korrigieren |
| `scripts/openspec-embed-local.sh` | TEI-Probe auf neuen Endpunkt |
| `scripts/llm-host-setup.sh` | TEI-Docker-Setup durch llama.cpp-Server-Setup ersetzen |

### Host-Aufräumung (Runbook, kein Repo-Diff)

`systemctl disable --now tei-embed tei-rerank tei-socat tei-rerank-socat lmstudio-socat`, beide
TEI-Docker-Container entfernen. Als dokumentierte Cutover-Schritte, nicht als Code.

## Testing

| Ebene | Inhalt |
|---|---|
| BATS `tests/spec/llm-pipeline.bats` | Kein `172.17.0.1`/`:1234`/`tei-` mehr in `environments/` und `k3d/llm-gpu.yaml`; `llm-gpu.yaml` enthält beide neuen Service/Endpoints-Paare; PS1-Skripte existieren und enthalten `--pooling cls` bzw. `--reranking` |
| Vitest `website/src/lib/rerank.test.ts` | llama.cpp-Antwortform wird korrekt nach `relevance_score` sortiert; Fehlerfall liefert `score: 0` **und** loggt eine Warnung; leere Eingabe kurzschließt |
| Vitest `website/src/lib/embeddings.test.ts` | Default-URL zeigt auf den neuen Embed-Service |
| Manuell/Runbook | Äquivalenzmessung (Gate 0.99), VRAM-Messreihe für `-np 4`, Reboot-Test des Scheduled Task |

Ein automatisierter E2E-Test gegen die Live-Server gehört nicht in diesen Change: Die Server laufen
auf dem Windows-Host, CI hat keinen Zugriff darauf.

## Abhängigkeit

**T002109** (`fix/k3d-dev-llm-bridge`, Status `in_review`) ändert `environments/dev.yaml`,
`environments/schema.yaml`, `k3d/llm-gpu.yaml` und `tests/spec/llm-pipeline.bats` — dieselben
Dateien. Er stellt dev von der Docker-Bridge auf wg-mesh `192.168.100.10` um, worauf dieser Change
aufbaut. **`dev-flow-execute` erst nach dem Merge von T002109 starten.**

## Explizit out of scope

- pgvector-Reindex (Folgeticket, falls das 0.99-Gate reißt)
- `llm-proxy`-Bind-Änderung oder Embedding-Routing über `:18235`
- Ablösung des Bonsai-Modells selbst; nur `-np`/`-c` werden angefasst
- `nomic-embed-text-v1.5` — hat kein GGUF-Pendant im Bestand und keinen aktiven Consumer
