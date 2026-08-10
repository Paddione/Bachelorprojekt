---
ticket_id: T002623
plan_ref: openspec/changes/adr006-sdlc-topologie/tasks.md
status: active
date: 2026-08-04
---

# Design: ADR-006 SDLC-Topologie — Epic/Architektur-Dokument

## Kontext

Der Software-Development-Lifecycle (Factory, Tickets, Repo-Health, Cluster-Monitoring,
Komponentenseiten, Asset-Generierung) ist heute physisch mit der Kundenproduktion verwoben.
Gemessen am 2026-08-03 läuft:

| Bestandteil | Läuft auf | Anmerkung |
|---|---|---|
| Factory-Kern (`dispatcher.js`, `wakeup.sh`, `scout.sh`, `watchdog.sh`, `pipeline.mjs`) | **Dev-Host** | systemd-User-Service, 5-min-Timer |
| Agentische Laufzeit (`llm-proxy` :18235, Ollama, llama.cpp, `factory-mcp`, `mcp-gateway`, ComfyUI) | **Dev-Host** | nativ WSL2 / Windows |
| Factory-Sandbox-Jobs | **Dev-Host** | `hostPath`-Mount auf den Worktree — auf fleet nicht lauffähig |
| SDLC-Daten (`tickets.*`) | **fleet** | `shared-db`, Namespace `workspace` |
| SDLC-Oberfläche (Factory-Floor, Cockpit, Tickets, Observability, Repo-Health) | **fleet** | dieselbe Astro-App wie mentolder.de |
| bge-embed / bge-rerank | **fleet** | CPU-only, bedient auch Website-Suche |

Die drei Schmerzpunkte (Blast Radius, Ressourcenlast, kognitive Vermischung) sind in ADR-006
dokumentiert und durch das Grilling G1–G12 (2026-08-03) entschieden. Dieses Dokument ist die
Epic-/Architektur-Sicht: es hält die Entscheidung, die gemessenen Ist-Daten (Assets) und die
abgeleitete Change-Landschaft fest.

## Entscheidung (Grilling G1–G12)

**Trennkriterium:** Alles, was ein Kunden-Request synchron benötigt, bleibt auf fleet. Alles, was
ausschließlich die Entwicklung benötigt, zieht auf den Dev-Host — auch um den Preis, dass es nur
verfügbar ist, wenn diese Workstation läuft. Es wandern **Dienste zum Host**, nicht der Host.

**Zielverteilung (G6, G3, G4):**

| | Dev-Host (Heim) | fleet (Hetzner) |
|---|---|---|
| **Oberfläche** | Factory-Floor, Cockpit, Pipeline, alle Tickets inkl. Frontend, Observability, Repo-Health, Komponentenseiten, Systemtest-Board, Prompts, KI-Konfiguration, Asset-Generierung | Kundenwebsite, Rechnungen, Buchhaltung, Billing, Kunden, Coaching, Inhalte, **Knowledge/Wissen**, **Live-Sessions** |
| **Daten** | `tickets.*` (primär, G3), Modell-Registry, Trainingsläufe | Geschäftsdaten (`public.*`, `bachelorprojekt.*`, `mentolder.*`), Nextcloud, Vaultwarden |
| **Agentisch** | `llm-proxy`, Ollama, llama.cpp, `factory-mcp`, `mcp-gateway`, ComfyUI, Unsloth-Training | — |
| **Embedding** | zweites bge-Paar im lokalen k3d, CPU-only (G10) | bestehendes bge-Paar für Website-Suche |
| **Identität** | lokale Auth mit Pocket-ID-Fallback über das Mesh, fail-closed (G7) | Pocket ID (unverändert) |
| **Erreichbarkeit** | SDLC ist Heimarbeit — kein Remote-Cockpit, kein Tunnel (G11) | — |

**Bauformen (G4, G5):**
- **Frontend:** zwei Build-Targets aus einer Codebase mit physischer Verzeichnistrennung
  (`src/pages/sdlc/`, `src/lib/sdlc/`, `src/components/sdlc/`) + negativem `paths`-Filter in
  `build-website.yml` (E1, gemergt).
- **Laufzeit:** gemischt — zustandsbehaftetes (Console, lokale PostgreSQL, bge-Paar) in einem
  lokalen k3d-Cluster über dieselben Kustomize-Manifeste wie Prod; GPU-Prozesse nativ
  (WSL/Windows) ohne Container-Indirektion.
- **CI-Rückkanal (G9):** Pull-Modell — ein lokaler Poller holt Runs, PRs, Checks von GitHub und
  schreibt lokal; kein eingehender Weg.
- **GPU-Arbitrierung (G2):** Training hat Vorrang. Trainings-Lock-Datei → `llm-proxy` versetzt
  lokale Backends auf `draining` → Factory routet auf die API. Kosten während Trainingsfenstern
  bewusst akzeptiert.
- **Modell-Registry (G8):** vier Dimensionen — Eignung (Eval-Harness T002606), Stat-Requirements
  (VRAM/Kontext/Durchsatz), Provenienz, Einsatz-Anleitung.

**Bewusst nicht verlagert:** `knowledge/` + `wissen` (produktiver pgvector-Raum + Website-Suche),
`live/sessions` (`sessions-server` ist Cluster-Deployment). `assets`/`asset-generation`:
**Werkzeug lokal** (ComfyUI auf der GPU), **Ablage produktiv**.

## Gemessene Assets (2026-08-04)

### A1 — Import-Graph `website/src/lib` (post-E1)

Nach dem E1-Verzeichnis-Schnitt neu gemessen (Importe aller Seiten unter `website/src/pages`):

| Größe | Wert |
|---|---|
| `lib`-Module gesamt | 295 |
| davon unter `lib/sdlc/` (bereits getrennt) | 37 |
| von SDLC-Seiten benutzt | 69 |
| von Geschäfts-Seiten benutzt | 114 |
| **von beiden benutzt (geteilt)** | **17 (5,8 %)** |

Die 17 geteilten Module sind **ausschließlich Infrastruktur**: `auth`, `db-pool`, `logger`,
`identity`, `audit-log`, `rate-limit`, `website-db`, `logging/error-log-store`,
`llm-models-probe`, `provider-config`, `ki-catalog`, `knowledge-db`, `messaging-db`,
`native-billing`, `questionnaire-db`, `questionnaire-display`, `systemtest/feature-flag`.

**Folgerung:** Das im ADR als offen geführte Maß „Import-Verflechtung" ist beantwortet. Vor E1
teilten 18 Module (11 %) beide Flächen, darunter noch echte fachliche Überschneidungen
(`provider-config`, `llm-models-probe`, `ki-catalog` im Coaching). Post-E1 bleibt nur noch
Infrastruktur übrig — die Flächen sind fachlich entkoppelt. Änderungen an den 17 geteilten
Modulen lösen weiterhin beide Builds aus; das ist korrekt (sie sind tatsächlich gemeinsam) und
im ADR als nicht vermeidbar dokumentiert.

### A2 — `tickets`-Schema: Tabellen, Zeilenzahlen, FK-Kanten

Gemessen über `information_schema` + `pg_stat_user_tables` (2026-08-04, Prod-`shared-db`):

| Tabelle | ca. Zeilen | | Tabelle | ca. Zeilen |
|---|---:|---|---|---:|
| `ticket_activity` | 11.929 | | `ticket_links` | 541 |
| `ticket_comments` | 10.763 | | `factory_run_budget` | 498 |
| `factory_phase_events` | 4.793 | | `ticket_plans` | 297 |
| `factory_control` | 3.069 | | `provider_config` | 39 |
| **`tickets`** | **2.010** | | `ticket_injections` | 22 |
| übrige 13 Tabellen (tags, watchers, embeddings, feature_flags, qa_reviews, pr_events, cockpit_audit, …) | 0–39 | | **Summe** | **~36.000** |

FK-Kanten (15 gesamt): **alle intern** — 13 × auf `tickets.tickets(id)`, 2 × auf
`tickets.tags(id)`. **Keine FK-Kante nach `public.*` oder `bachelorprojekt.*`.** Auch die drei
Views (`v_active_features`, `v_cockpit_rollup`, `v_factory_metrics`) referenzieren ausschließlich
`tickets.*`.

**Folgerung für E3 (T002626):** Die offene Frage „Voll-Migration oder Stichtags-Schnitt mit
read-only Archiv" ist kopplungsseitig beantwortet: das Schema ist autark, eine Voll-Migration ist
nicht durch Schema-Kanten blockiert (~36.000 Zeilen, wenige MB — technisch trivial). Die
verbleibende Querkopplung ist **Anwendungscode** (die geteilten Module `website-db`, `auth` aus
A1), keine DB-Kante. Die Archiv-Frage reduziert sich damit auf Datenhaltungspolitik, nicht auf
Integritätszwang.

### A3 — fleet-Last: SDLC-Anteil

Aus dem Pod-Inventar des `workspace`-Namespace (2026-08-04) sind die SDLC-relevanten Workloads
im Cluster: `mentolder-web` (beherbergt bis E4 die SDLC-Routen im Produktions-Image),
`shared-db` (hält `tickets.*`) und die nächtlichen `knowledge-ingest-*`-Cronjobs. Der
knowledge-ingest ist laut ADR der einzige echte SDLC-Workload im Cluster; alle übrigen
Cluster-Services (Nextcloud, Brain, Brett, Studio, Talk, Mediaviewer, …) sind Geschäft oder
Infrastruktur. Damit bestätigt sich qualitativ: Der Großteil der Admin-ausgelösten Last
(Polling, Factory-Floor-Refresh, Ticket-Queries) trifft `mentolder-web` und `shared-db`.

**Mess-Limitation:** Aus dem Planungs-Kontext war die Metrics-API
(`pods.metrics.k8s.io`) nicht erreichbar (RBAC-Verbot für das ServiceAccount), eine quantitative
Aufteilung war daher nicht möglich. Die quantitative Baseline (Anteil Admin-/Factory-Last vor
E4) ist in T002627 (E4, DoD: „Admin-bedingte Last messbar gesunken gegen die E1-Baseline")
verankert und wird dort gegen diese qualitative Beschreibung gemessen.

### A4 — VRAM-Messreihe der Kandidatenmodelle

Vorhandene Messwerte (Quelle: `scripts/llm/loadouts.json`, Notizen; Ziel: RTX 5070 Ti, 16 GB):

| Modell / Quant | VRAM | Durchsatz (gemessen) | Kontext |
|---|---|---|---|
| gpt-oss-20b Q8_0 (`gptoss-context`) | 11,5–12,1 GB | 158–166 tok/s decode | bis 105.472 |
| Devstral-Small-2 24B IQ4_XS (`devstral-quality`) | 12,78 GB | — | min. 8.192 |
| Gemma-4-12B Q4_K_XL (`gemma-factory`/`gemma-multiagent`) | ~8–9 GB (Q4_K_XL) | — | bis 262.144 (q8_0-KV) |

Dazu liefert `scripts/finetune/measure_corpus.py` eine VRAM-Machbarkeitsmatrix pro
Kandidatenmodell (`--vram-gb` Default 16) — die Datengrundlage für E5 (Arbitrierung: was passt
gleichzeitig in 16 GB?) und E6 (Registry-Dimension 2 „Stat-Requirements").

**Folgerung:** Ein einzelnes 20B/24B-Modell in Q8/IQ4_XS belegt bereits ~12 GB — Training
(Unsloth) und Inferenz gleichzeitig passen nicht in 16 GB. Das bestätigt die G2-Entscheidung:
Arbitrierung ist Pflicht, nicht Kür.

## Abgeleitete Changes (Epic-Struktur)

| # | Change / Ticket | Löst | Voraussetzung | Stand |
|---|---|---|---|---|
| **E1** | Build-Target-Split (`sdlc-build-target-split`, T002624) | Blast Radius | — | **gemergt** |
| **E2** | Lokaler k3d-Stack: Console, PostgreSQL, bge, Auth (T002625) | Infrastruktur für E3 | E1 | offen |
| **E3** | `tickets.*` lokal-primär + GitHub-Poller (T002626) | Datenhoheit | E2 | offen |
| **E4** | SDLC-Routen aus dem Produktions-Image (T002627) | Ressourcenlast, UI-Vermischung | E3 | offen (build-seitig wirksam) |
| **E5** | GPU-Arbitrierung: Trainings-Lock, Draining (T002628) | Trainingsfähigkeit | — (parallel) | offen |
| **E6** | Modell-Registry + Training Grounds (T002629) | Messbare Modellauswahl | E5, PR #3745 | offen |

E4 darf erst nach E3 laufen (sonst verlorener Zugriff auf die Ticket-Historie). E5 läuft parallel
zu E1–E4. E6 hängt an PR #3745 (T002587), das `train.py`, `measure_corpus.py` und
`template_guard.py` liefert — ohne Merge hat die Registry nichts zu registrieren.

## Abgrenzung zu bestehenden Entscheidungen

- **ADR-004 / T002551 (bge auf fleet):** bleibt unangetastet — das Kriterium ist „ob ein
  Kunden-Request den Dienst synchron braucht", nicht „lokal oder remote". Website-Suche braucht
  das bestehende bge-Paar synchron → bleibt; die Factory braucht ihr eigenes bge-Paar für die
  Ticket-Semantik → zweites Paar lokal (G10).
- **Nicht-Entwicklung bleibt auf fleet:** Kundenwebsite, Billing, Coaching, Nextcloud, Pocket ID,
  Vaultwarden — das ADR verschiebt nichts davon, es grenzt nur ab.
- **`dev.mentolder.de` und `terminal-sidekick`:** zwei bekannte Abweichungen vom Trennkriterium
  (Vorschau-Umgebung auf fleet; Prod-Ingress auf Workstation-`ttyd`). Beide sind nicht Teil
  dieses Tickets; sie sind im ADR als offene Punkte dokumentiert und werden in E2 entschieden.

## Offene Punkte (Stand nach diesem Change)

- **WSL-Speicherzuteilung:** Wie viel von den 64 GB braucht die Windows-Seite tatsächlich?
  Messung vor E2; Ergebnis bestimmt den neuen `memory`-Wert in `.wslconfig` (E2, T002625).
- **Backup der lokalen DB:** Zielort und Verfahren für die lokale PostgreSQL (SDLC-Daten sind
  Bestandteil der Bachelorarbeit) — entscheidet E3 (T002626), unterstützt durch T002647
  (Migrations-Runner).
- **Kunden-Bugmeldungen:** Schreibpfad aus Prod in die lokale DB (Outbox-Muster) — E3.
- **`dev.mentolder.de` / `terminal-sidekick`:** Abweichungen 1 und 2 aus dem ADR — E2.
- **Quantitative fleet-Last-Baseline:** RBAC-bedingt hier nicht messbar — wird in E4 (T002627)
  gegen die qualitative Beschreibung aus A3 gemessen.

## Konsequenzen

**Positive:** SDLC-Commit kann die Kundenwebsite nicht mehr ausrollen; Produktionsfläche schrumpft
um ~130 API-Routen und 12 Seiten; Factory-Last verlässt Hetzner-Knoten und gemeinsame DB;
Factory unabhängig vom WireGuard-Tunnel; Trainingsläufe bekommen eine verlässliche GPU; agentische
Infrastruktur liegt an einem Ort und ist erstmals gegen den Eval-Harness auswertbar.

**Negative:** SDLC-Cockpit nur von zu Hause und bei laufender Workstation; CI-Ereignisse
verzögert (Pull-Modell); zwei PostgreSQL-Instanzen (zwei Backup-/Migrationspfade); zwei
Auth-Pfade in einer Codebase (fail-closed nötig, eigener Test); lokales k3d belegt dauerhaft RAM
im 18-GB-WSL-Limit (Anhebung Voraussetzung für E2); API-Kosten während Trainingsfenstern;
dritte Betriebsumgebung (k3d wird dauerhaft betrieben).
