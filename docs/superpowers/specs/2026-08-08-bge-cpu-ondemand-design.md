---
title: bge-CPU-Stack on demand — Design [T002729]
ticket_id: T002729
domains: [infra, ops, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bge-CPU-Stack on demand — Design [T002729]

**Datum:** 2026-08-08
**Ticket:** T002729
**Branch:** `fix/bge-cpu-ondemand-T002729`

## Purpose (DE)

Embedding und Reranking sollen lokal in WSL rein CPU-gebunden und strikt auf Abruf
bereitstehen, nachdem die vier Windows-Autostart-Server abgeschaltet wurden. Zwei Hindernisse
stehen dem entgegen: eine `exclusiveGroup`, die den gleichzeitigen Betrieb beider Dienste ohne
Sachgrund verhindert, und zwei verwaiste Cluster-Objekte, die auf die abgeschalteten Prozesse
zeigen und dadurch einen funktionierenden Pfad vortäuschen.

## Ausgangslage (belegt)

Auf dem Windows-Host liefen vier Scheduled Tasks unter `\Llama\`, alle als SYSTEM mit
Boot-Trigger und `-ngl 99`. Drei starteten byte-identisch denselben Reranker auf `:8096`; zwei
verloren das Bind-Rennen und blieben als GPU-belegende Prozesse ohne Socket stehen. Der vierte
(`LlamaEmbedServer`) endete auf `--port` ohne Wert und konnte nie starten. Alle vier sind
deaktiviert, die Prozesse beendet, die Task-XMLs gesichert unter
`C:\Users\PatrickKorczewski\llama-tasks-backup\`.

Bereits verifiziert und deshalb **nicht** Gegenstand dieser Arbeit:

| Aussage | Nachweis |
|---|---|
| On-Demand-Start funktioniert | `POST /admin/loadouts/bge-rerank-cpu/start` → `llama-bge-rerank-cpu.service` active/running auf `:8096` |
| Läuft CPU-only | GPU-Belegung unverändert 2143 / 16303 MiB (reiner Desktop-Verbrauch) |
| Numerisch äquivalent zum GPU-Server | derselbe Rerank-Request liefert zeichengenau `-5.711606979370117` / `-11.020078659057617` |
| Binary vorhanden | `~/opt/llama-current/bin/llama-server` (b10241); der Proxy nutzt den absoluten Pfad |
| Aktiver Cluster-Pfad unberührt | `bge-embed`/`bge-rerank` laufen als Pods in `ns workspace`; `bge-mcp` und die Forwards 8081/8093 funktionieren |

## Problem 1 — `exclusiveGroup` serialisiert ohne Sachgrund

`bge-embed-cpu` und `bge-rerank-cpu` tragen beide `exclusiveGroup: "bge-cpu"`.
`findExclusiveConflict` lehnt den zweiten Start mit HTTP 409 ab:

```
{"code":"exclusive_conflict","message":"bge-embed-cpu teilt exclusiveGroup 'bge-cpu'
 mit dem laufenden Loadout bge-rerank-cpu ..."}
```

`exclusiveGroup` modelliert VRAM-Exklusivität — bei den `chat-gpu`-Loadouts zwingend, da 16 GB
VRAM keine zwei 12B-Modelle fassen. Beide bge-Loadouts laufen mit `ngl: 0` und
`CUDA_VISIBLE_DEVICES: ""` und belegen keinerlei VRAM. Für RAG ist die Serialisierung
disqualifizierend: Embedding und Reranking sind die zwei Hälften derselben Abfrage.

## Problem 2 — verwaiste Cluster-Objekte in `workspace-korczewski`

`llm-gateway-rerank` und `llm-gateway-embed` zeigen dort per handgesetztem Endpoint auf
`192.168.100.10:8096` bzw. `:8095`, also auf die abgeschalteten Windows-Prozesse.

Es sind **Flux-Waisen**, keine gepflegte Konfiguration: Commit `20e123b7f` (T002551, „bge-Stack
von WSL-CPU nach Kubernetes-CPU migrieren") hat sie aus dem Repo entfernt. Überlebt haben sie,
weil `flux-korczewski` suspendiert ist (`suspend: true` bei `ready: True`) — ohne Reconciliation
läuft auch kein Prune. Von 33 Deployments in `workspace-korczewski` referenziert keines
`llm-gateway-*`; der Waisen-Service hört zudem auf `8096`, während der einzige Konsument im Repo
(`k3d/sdlc-stack/sdlc-console.yaml`) `http://llm-gateway-rerank:8081` erwartet.

Ein Service ohne Selector mit handgesetzten Endpoints wird von Kubernetes nie auf Erreichbarkeit
geprüft. Der Endpoint bleibt grün, auch wenn dahinter nichts lauscht — so blieb der tote
Embed-Pfad unbemerkt.

## Problem 3 — der bestehende Guard erzwingt die Gruppe

`tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats:120-123`:

```bash
# Positiv-Anker: eine Gruppe ist ueberhaupt gesetzt — sonst bestuende der
# Test auch bei einem Loadout ohne jede Gruppenzuordnung.
[ "$output" != "null" ]
[ "$output" != "chat-gpu" ]
```

Der Anker ist zu stark formuliert. Geprüft werden soll „bge steht nicht in der GPU-Gruppe";
abgesichert wird das über `!= null`, was die bloße *Existenz* einer Gruppe zur Anforderung macht.
Das Entfernen der sachlich unbegründeten Gruppe bricht den Test, obwohl seine eigentliche Aussage
weiter gilt.

Die Auflösung verschiebt den Anker auf eine **Kontrollgruppe**: an einem `chat-gpu`-Loadout wird
nachgewiesen, dass die Ausleseroutine `chat-gpu` tatsächlich findet. Erst dann ist „bei bge kommt
nicht `chat-gpu` heraus" belastbar statt vakuos. Die T002356-M1-Konvention bleibt erfüllt, ohne
eine fremde Eigenschaft festzuschreiben.

## Zielzustand

1. **`scripts/llm/loadouts.json`** — `exclusiveGroup` bei `bge-embed-cpu` und `bge-rerank-cpu`
   entfernt; `-t 4` bleibt unverändert. Der `notes`-Text von `bge-rerank-cpu` ersetzt die
   überholte Port-Konflikt-Warnung durch den tatsächlichen Stand.
2. **`tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats`** — Anker auf Kontrollgruppe
   umgestellt; neuer Test hält die Abwesenheit einer gemeinsamen Gruppe bei den beiden
   bge-CPU-Loadouts positiv fest (RED-Test dieses Fixes).
3. **Cluster** — `svc` und `endpoints` `llm-gateway-rerank`/`-embed` in `workspace-korczewski`
   entfernt. Reine Ops-Aktion ohne Repo-Artefakt: das Repo kennt diese Objekte seit T002551
   nicht mehr.
4. **`docs/superpowers/references/gotchas-footguns.md`** — Eintrag, dass `suspend: true` bei
   `ready: True` Drift verdeckt, mit den Waisen als belegtem Fall.

## Bewusst ausgeschlossen

| Ausgeschlossen | Begründung |
|---|---|
| Autostart (Distribution oder lazy beim ersten Request) | „on demand" ist die Anforderung; ein Autostart wäre ein Rückfall in genau das Muster, das auf der Windows-Seite gerade abgeschaltet wurde |
| Threads von `-t 4` senken | erst messen, wenn gleichzeitiger Betrieb real Last erzeugt |
| `flux-korczewski` entsuspendieren | eine Reaktivierung prunet **alle** seit der Suspendierung entstandenen Abweichungen auf einmal, nicht nur diese zwei Objekte; Umfang unbekannt → eigenes Ticket |
| Tool-Call-Fehlalarm im Start-Check | Nebenbefund: ein Reranker hat kein Chat-Template und kann per Definition keine Tool-Calls erzeugen; im Ticket vermerkt |
| `scripts/llm-proxy/exclusive-conflict.test.mjs` | arbeitet mit hartkodiertem Fixture-Array, nicht mit der echten `loadouts.json` — bleibt grün |

## Verifikation

| Prüfung | Erwartung |
|---|---|
| `bats -r tests/spec/local-llm-proxy*` | grün, inkl. neuem Gruppen-Test |
| `task llm:loadouts:check` | grün — Datei bleibt kanonisch serialisiert |
| beide Loadouts nacheinander starten | kein `exclusive_conflict`; `:8095` und `:8096` gleichzeitig healthy |
| `nvidia-smi` während beide laufen | GPU-Belegung unverändert auf Desktop-Niveau |
| Rerank-Scores nach der Änderung | unverändert `-5.711606979370117` / `-11.020078659057617` |
| `kubectl -n workspace-korczewski get svc,endpoints` | keine `llm-gateway-*`-Objekte mehr |
| `bge-mcp` und Forwards 8081/8093 | weiterhin funktionsfähig (Regressionsschutz) |
