---
title: "bge-role-registry-routing — Design"
ticket_id: T900006
status: planning
domains: [website, db, ops, test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: bge-Rollen ueber die Backend-Registry

## E1 — Die Grenze zwischen Registry und Anfrage-Auswahl

Der Change beruehrt zwei Dinge, die auseinandergehalten werden muessen:

| Aspekt | Quelle heute | Quelle nachher |
|---|---|---|
| Welche Glieder gibt es, in welcher Reihenfolge? | `loadouts.json` → `roles.*.chain` | Registry (`roles`-Spalte + `priority`) |
| Welches Glied bedient **diese** Anfrage? | Ausgang der weitergeleiteten Anfrage | **unveraendert** |

`local-llm-proxy.md` verbietet probe-getriebene Auswahl mit einer belegten
Begruendung: am 2026-08-09 nahm der Cluster-Endpoint die Verbindung an und
antwortete 60 s nicht, waehrend `/health` weiter 200 lieferte (T002838). Diese
Anforderung bleibt unangetastet.

Die Folge fuer die Implementierung ist eine harte Regel: `bge-routes.mjs` darf
`discovery.mjs` **nicht** importieren. Die Registry wird ueber
`getBackends()` aus `backends.mjs` gelesen — die reine Konfigurationsquelle,
ohne Health-State. Ein Test sichert das ab, sonst verdrahtet die naechste
Session den Probe "hilfsbereit" wieder hinein.

## E2 — Warum die Reihenfolge umgekehrt wird (ersetzt E2/E3 aus T006143)

Die bestehende Reihenfolge ist in `tests/spec/local-llm-proxy/bge-chain-order.bats`
als Guard festgeschrieben: "Laptop/Tablet zuerst (GPU), Cluster zweit
(always-on), Desktop-CPU-Loadout zuletzt (on-demand)". Der Guard wird durch
diesen Change ersetzt, weil seine Praemisse entfallen ist:

- **Damals:** die Desktop-CPU war von llama.cpp-Chat-Loadouts belegt; ein
  bge-Prozess dort haette mit dem Chat-Pfad konkurriert. Die iGPUs der Geraete
  waren die freieren Ressourcen.
- **Heute:** FreeToken serviert mit `--moe-backend offload --moe-cpu-layers 0`
  (`scripts/llm/restart-freetoken.ps1`). Der Chat-Pfad rechnet null auf der
  CPU. Gemessen am Host (Ryzen 7 5800X3D, 8C/16T, 64 GB): rund 30 GB RAM frei,
  CPU-Auslastung im Mittel 22 %.
- **Lastprofil:** bge-m3 ist ein Encoder (XLM-RoBERTa-large, 568M Parameter).
  Ein bidirektionaler Forward-Pass ueber die Sequenz ist GEMM-lastig und
  skaliert mit Kernen, nicht mit Speicherbandbreite. Das ist die Lastart, fuer
  die acht Zen-3-Kerne das richtige Werkzeug sind.

Der Nebeneffekt loest Befund 2 des Proposals **ohne** Probe: steht das
schlafende Geraet am Ende der Kette, wird es nur erreicht, wenn Desktop und
Cluster bereits gescheitert sind. Die 30 s fallen dann an — und sind dort
berechtigt, weil tatsaechlich nichts anderes mehr uebrig ist.

## E3 — Rueckfall, wenn die Registry nicht erreichbar ist

`backends.mjs::loadBackendsOnce()` ruft `factory_psql` ueber `execFileSync`
auf und wirft, wenn kein `shared-db`-Pod erreichbar ist. Fuer die Chat-Routen
ist das hinnehmbar; fuer die bge-Rollen nicht — Embedding und Rerank haengen
an lokalen Prozessen, die auch ohne Cluster funktionieren.

Entscheidung: Faellt die Registry-Aufloesung aus, faellt die Rollen-Kette auf
`loadouts.json` zurueck und der Proxy loggt eine Zeile mit dem Grund. Der
`roles`-Block in `loadouts.json` bleibt damit erhalten und wird zum
dokumentierten Notfall-Pfad statt zur primaeren Quelle.

## E4 — Loadout-Glieder in einer URL-Registry

Die Kette kennt heute zwei Gliedarten: `loadout:<slug>` (startet ein lokales
Loadout on-demand) und eine absolute URL. Die Registry traegt nur `base_url`
mit `CHECK (kind IN ('llamacpp','lmstudio','openai-remote'))`.

Entscheidung: eine nullable Spalte `loadout_slug`. Ist sie gesetzt, erzeugt der
Reader ein `{kind:'loadout', slug}`-Glied; sonst ein `{kind:'url', baseUrl}`.
Das haelt `loadRoles()`s Rueckgabeform unveraendert, sodass `routeRequest()`
und `defaultStartLoadout()` nicht angefasst werden muessen.

## E5 — Aequivalenz-Gate als Aufnahmebedingung

Sobald Glieder aus einer Registry kommen, kann ein Backend in die embed-Kette
geraten, ohne dass jemand seine Vektoren geprueft hat. Das faellt nicht auf:
ein Backend mit abweichendem Pooling liefert plausible Vektoren in einem
anderen Raum, und die Retrieval-Qualitaet sinkt still. Springt der Rueckfall
waehrend einer Indexierung ein, ist der Index dauerhaft gemischt.

`scripts/llm/measure-embedding-equivalence.mjs` misst genau das (Kosinus >= 0,99
ueber 20+ deutsche und englische Texte, kurz und lang) und wird deshalb
Aufnahmebedingung, nicht Empfehlung. Die Dimension bleibt 1024 —
`components/website/src/lib/embeddings.ts` und `scripts/index-repo.ts` haengen
daran.

## Nicht entschieden

- **Welches TEI-Deployment** (Container auf dem Desktop vs. systemd-Unit) — das
  entscheidet der ausfuehrende Task anhand dessen, was auf dem Host laeuft.
- **ONNX/INT8-Quantisierung** statt Q8_0 GGUF. Eigenes Ticket, eigene Messung;
  dieser Change stellt nur das Gate bereit, das eine solche Umstellung pruefbar
  macht.
