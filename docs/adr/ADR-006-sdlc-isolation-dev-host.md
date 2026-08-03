# ADR-006: SDLC-Isolation — Entwicklungsfläche auf den Dev-Host, Produktion bleibt auf fleet

**Status:** Proposed
**Datum:** 2026-08-03
**Ticket:** T002623

## Kontext

Der Software-Development-Lifecycle dieses Projekts ist heute physisch mit der Kundenproduktion
verwoben, obwohl er logisch nichts mit ihr zu tun hat.

**Ist-Zustand, gemessen am 2026-08-03:**

| Bestandteil | Läuft auf | Anmerkung |
|---|---|---|
| Factory-Kern (`dispatcher.js`, `wakeup.sh`, `scout.sh`, `watchdog.sh`, `pipeline.mjs`) | **Dev-Host** | systemd *user*-Service, 5-min-Timer, `WorkingDirectory=/home/patrick/Bachelorprojekt` |
| Agentische Laufzeit (`llm-proxy` :18235, Ollama, llama.cpp, `factory-mcp`, `mcp-gateway`, ComfyUI) | **Dev-Host** | nativ unter WSL2 / Windows |
| Factory-Sandbox-Jobs | **Dev-Host** | `sandbox-job.yaml` mountet `hostPath` auf den Worktree — auf fleet nicht lauffähig |
| SDLC-Daten (`tickets.*`: Tickets, `ticket_plans`, `factory_phase_events`, Budgets, Slots, Provider-Config) | **fleet** | `shared-db`, Namespace `workspace` |
| SDLC-Oberfläche (Factory-Floor, Cockpit, Pipeline, Tickets, Observability, Repo-Health) | **fleet** | Teil der Astro-App im Namespace `website` — **dieselbe Anwendung wie mentolder.de** |
| bge-embed / bge-rerank | **fleet** | CPU-only, seit T002551 bewusst *im* Cluster; bedient auch die Website-Suche |

Der Kern läuft also bereits lokal. Was in der Produktion hängt, sind **Daten** und **Oberfläche** —
und genau daraus entstehen die drei beobachteten Probleme:

1. **Blast Radius.** `.github/workflows/build-website.yml` triggert auf `paths: ['website/**']`.
   Ein Commit an `website/src/pages/admin/cockpit.astro` baut das Website-Image neu und rollt es
   auf mentolder.de und korczewski.de aus. Ein Fehler in der Entwicklungsfläche kann die
   Kundenseite kippen.
2. **Ressourcenlast auf fleet.** Jeder Cockpit-Poll, jeder Factory-Floor-Refresh und jede
   Ticket-Query trifft einen Website-Pod in `workspace` und die `shared-db`. Der einzige *echte*
   SDLC-Workload im Cluster ist der nächtliche `knowledge-ingest-cronjob`; die Last stammt fast
   vollständig aus der Admin-Fläche.
3. **Kognitive Vermischung.** Unter `/admin` liegen Rechnungen, Buchhaltung, Steuer, Kunden und
   Coaching direkt neben Factory-Floor, Pipeline und Cluster-Monitoring — 29 Seiten und 346
   API-Dateien in einem Verzeichnisbaum.

**Abgrenzung zu ADR-004 / T002551.** T002551 hat bge-Embedding und -Reranking *vom* Dev-Host
*in* den Cluster verlagert, um den Host-SPOF zu beseitigen. Diese Entscheidung nimmt das nicht
zurück und widerspricht ihr nicht: das Kriterium ist nicht „lokal oder remote", sondern **ob ein
Kunden-Request den Dienst synchron braucht**. Embedding bedient die Website-Suche und bleibt
deshalb auf fleet. Die Factory bedient niemanden außer der Entwicklung.

## Entscheidung

**Trennkriterium:** Alles, was ein Kunden-Request synchron benötigt, bleibt auf fleet. Alles, was
ausschließlich die Entwicklung benötigt, zieht auf den Dev-Host — auch um den Preis, dass es nur
verfügbar ist, wenn diese Workstation läuft.

Der Dev-Host bleibt, wo er ist (WSL2 auf der Heim-Workstation, RTX 5070 Ti / 16 GB VRAM,
17 GB WSL-RAM, wg-Mesh `192.168.100.10`). Es wandern **Dienste zu ihm hin**, nicht der Host.

### Zielverteilung

| | Dev-Host (Heim) | fleet (Hetzner) |
|---|---|---|
| **Oberfläche** | Factory-Floor, Cockpit, Pipeline, **alle Tickets inkl. Frontend**, Observability/Cluster-Monitoring, Repo-Health-Dashboard, technische Komponentenseiten (`architektur`, `platform`, `app-catalog`), Systemtest-Board, Prompts, KI-Konfiguration, Asset-Generierung | Kundenwebsite, Rechnungen, Buchhaltung, Steuer, Billing, Kunden, Mitglieder, Termine, Kalender, Meetings, Dokumente, Coaching, Fragebögen, Inhalte, Projekte, Zeiterfassung, Rechtliches, Inbox, Einstellungen, Brett, **Knowledge/Wissen**, **Live-Sessions** |
| **Daten** | `tickets.*` (primär), Modell-Registry, Trainingsläufe | Geschäftsdaten (`public.*`, `bachelorprojekt.*`, `mentolder.*`), Nextcloud, Vaultwarden |
| **Agentisch** | `llm-proxy`, Ollama, llama.cpp, `factory-mcp`, `mcp-gateway`, ComfyUI, Unsloth-Training | — |
| **Embedding** | eigenes bge-Paar im lokalen k3d (CPU-only) | bestehendes bge-Paar für Website-Suche |
| **Identität** | lokale Auth mit Pocket-ID-Fallback über das Mesh | Pocket ID (unverändert) |

**Bewusst nicht verlagert:** `knowledge/` + `wissen` (hängt an der Website-Suche und am
produktiven pgvector-Raum) und `live/sessions` (`sessions-server` ist ein Cluster-Deployment in
`workspace`). Bei `assets` / `asset-generation` gilt: **Werkzeug lokal** (ComfyUI auf der GPU),
**Ablage produktiv** — die erzeugten Bilder sind Material der Kundenwebsite.

### Bauformen

**Frontend — zwei Build-Targets aus einer Codebase.** Kein zweites `package.json`, keine
Verdopplung von Auth, Layouts und Design-Tokens. Stattdessen:

- SDLC-Code zieht physisch in eigene Verzeichnisse (`website/src/pages/sdlc/`,
  `website/src/lib/sdlc/`, `website/src/components/sdlc/`). Ohne diese Trennung greift kein
  Pfad-Filter und der Blast Radius bleibt bestehen.
- `build-website.yml` bekommt einen negativen Pfad-Filter
  (`paths: ['website/**', '!website/src/**/sdlc/**']`), sodass eine reine SDLC-Änderung den
  Produktions-Build nicht mehr auslöst.
- Eine Astro-Integration filtert im Hook `astro:routes:resolved` (verfügbar in Astro 7.1.6) das
  Route-Manifest anhand von `BUILD_TARGET=prod|sdlc`. Damit enthält das Produktions-Image die
  SDLC-Routen nicht mehr — Abschaltung durch Abwesenheit, nicht durch eine Laufzeitprüfung.
- Änderungen an echt geteiltem Code (Auth, Logger, DB-Pool, Basis-Layouts) lösen weiterhin beide
  Builds aus. Das ist korrekt und nicht vermeidbar.

**Laufzeit — gemischt.** Zustandsbehaftetes (SDLC-Console, lokale PostgreSQL, bge-Paar) läuft in
einem lokalen k3d-Cluster über dieselben Kustomize-Manifeste wie Prod. GPU-Prozesse (llama.cpp,
Unsloth, ComfyUI) laufen nativ ohne Container-Indirektion.

> **Der lokale Cluster existiert derzeit nicht.** `k3d cluster list` ist leer; von den in
> CLAUDE.md genannten Kontexten sind nur `fleet` und ein toter `k3d-korczewski`-Eintrag
> vorhanden, `k3d-mentolder-dev` fehlt. E2 baut den Cluster also neu auf, statt einen
> bestehenden mitzubenutzen — und er wird dabei von einer Wegwerf-Testumgebung zu einer
> dauerhaft betriebenen.

**Arbeitsspeicher ist die knappe Ressource, nicht VRAM.** `.wslconfig` weist WSL derzeit 18 GB
von 64 GB zu (46 GB bewusster Windows-Headroom). In diesen 18 GB müssen künftig gleichzeitig
Platz finden: der k3d-Cluster (Control-Plane, Console, PostgreSQL, bge-Paar ≈ 4–5 GB),
parallele Factory-Ticks (`claude -p` plus `task test:all` je Pipeline, jeweils im GB-Bereich)
und das Unsloth-Training — dessen venvs unter `~/.venvs` liegen, also **in WSL** laufen, nicht
auf der Windows-Seite. llama.cpp und ComfyUI laufen dagegen nativ unter Windows und belegen bei
vollem GPU-Offload wenig System-RAM. Die Aufteilung 18/46 ist damit vermutlich falsch herum
gewichtet; eine Anhebung des WSL-Limits ist Voraussetzung für E2 und wird dort gemessen statt
geraten.

**GPU-Arbitrierung — Training hat Vorrang.** Die 16 GB VRAM tragen Training und Inferenz nicht
gleichzeitig. Startet ein Trainingslauf, setzt er eine Lock-Datei; der `llm-proxy` versetzt die
lokalen Backends in `draining` und die Factory routet auf die API. Ein Trainingslauf wird niemals
von einem Factory-Tick unterbrochen. Der Preis ist API-Verbrauch während Trainingsfenstern; das
ist gegenüber abgebrochenen Messreihen die günstigere Seite.

**CI-Rückkanal — Pull.** GitHub kann den Dev-Host nicht erreichen. Ein lokaler Poller holt Runs,
PRs und Checks über die GitHub-API und schreibt in die lokale Datenbank; `babysit-prs.sh` und
`auto-close-merged.sh` arbeiten bereits nach diesem Muster. Ereignisse kommen verzögert und nur
bei laufender Workstation — akzeptiert, weil Entwicklung ohnehin nur dann stattfindet.

**Modell-Registry — vier Dimensionen.** Jeder trainierte Adapter wird erfasst mit
(1) **Eignung**: Messreihe pro Factory-Rolle gegen den Eval-Harness aus T002606;
(2) **Stat-Requirements**: VRAM je Quantisierung, maximale Kontextlänge, Durchsatz, Ladezeit —
Grundlage der GPU-Arbitrierung; (3) **Provenienz**: Basismodell, Korpus, LoRA-Konfiguration,
Commit; (4) **Einsatz-Anleitung**: Chat-Template (verifiziert durch `template_guard.py` aus
PR #3745), Stop-Tokens, Sampling-Parameter, fertiger `loadouts.json`-Block.

### Etappen

Die Reihenfolge folgt dem Grundsatz, dass die Produktion in jedem Zwischenzustand vollständig
funktionsfähig bleibt und keine Etappe Daten gefährdet.

| # | Etappe | Löst | Voraussetzung |
|---|---|---|---|
| **E1** | Verzeichnis-Umzug + Build-Target-Split + Pfad-Filter | Blast Radius | — |
| **E2** | Lokaler SDLC-Stack im k3d: Console, PostgreSQL, bge-Paar, Auth | Infrastruktur für E3 | E1 |
| **E3** | Datenumzug `tickets.*` nach lokal-primär + GitHub-Poller | Datenhoheit | E2 |
| **E4** | SDLC-Routen aus dem Produktions-Image entfernen | Ressourcenlast, UI-Vermischung | E3 |
| **E5** | GPU-Arbitrierung: Trainings-Lock, `llm-proxy`-Draining | Trainingsfähigkeit | — (parallel zu E1–E4) |
| **E6** | Modell-Registry + ausgebaute Training Grounds | Messbare Modellauswahl | E5, **PR #3745 gemergt** |

Zu E6: `scripts/finetune/` enthält aktuell nur den Eval-Harness aus T002606
(`eval_harness.py`, `eval_scoring.py`, `testsets/`). Die Trainingsseite — `train.py`,
`measure_corpus.py`, `template_guard.py` — liegt in PR #3745 (T002587), der offen ist und zwei
rote Checks trägt. Ohne diesen Merge hat E6 keine Grundlage; die Registry wüsste nichts zu
registrieren.

E1 ist vollständig reversibel und liefert den größten Schmerzpunkt sofort. E4 darf erst nach E3
laufen: die Routen in Prod abzuschalten, bevor die Daten lokal liegen, hieße den Zugriff auf die
Ticket-Historie zu verlieren.

## Konsequenzen

**Positive Konsequenzen:**

- Ein SDLC-Commit kann die Kundenwebsite nicht mehr ausrollen — der Produktions-Build wird gar
  nicht erst ausgelöst.
- Die Produktionsfläche schrumpft um rund 130 API-Routen und 12 Seiten; `/admin` enthält danach
  ausschließlich Geschäftliches.
- Factory-Last (Polling, Ticket-Queries, Sandbox-Jobs) verlässt die Hetzner-Knoten und die
  gemeinsame Datenbank vollständig.
- Die Factory wird unabhängig vom WireGuard-Tunnel: sie läuft weiter, auch wenn das Mesh steht.
- Trainingsläufe bekommen eine verlässliche, ununterbrochene GPU.
- Die agentische Infrastruktur (Modelle, Adapter, Loadouts, Messwerte) liegt an einem Ort und
  ist erstmals gegen den Eval-Harness auswertbar.

**Negative Konsequenzen:**

- Das SDLC-Cockpit ist nur noch von zu Hause und nur bei laufender Workstation erreichbar. Ein
  Remote-Zugang wird bewusst nicht gebaut — er würde einen eingehenden Weg ins Heimnetz öffnen.
- CI-Ereignisse erreichen die Ticket-Datenbank verzögert; während die Workstation aus ist, sammelt
  sich Rückstand an, den der Poller nachholt.
- Zwei PostgreSQL-Instanzen statt einer: zwei Backup-Pfade, zwei Migrationsziele, zwei
  Wiederherstellungsverfahren.
- Zwei Auth-Pfade in einer Codebase (lokal + Pocket-ID-Fallback) sind eine bekannte Quelle für
  Sicherheitslücken und brauchen eine fail-closed Implementierung mit eigenem Test.
- Das lokale k3d belegt dauerhaft RAM auf einem Host, dessen WSL-Anteil derzeit auf 18 GB
  begrenzt ist — Console, PostgreSQL und das bge-Paar konkurrieren dort mit Unsloth-Training und
  parallelen Factory-Ticks. Ohne Anhebung des Limits ist E2 nicht tragfähig.
- Während Trainingsläufen arbeitet die Factory auf der API und verursacht Kosten.
- Das Vorhaben führt die Zahl der Betriebsumgebungen von zwei (fleet, k3d-dev) faktisch auf drei,
  weil der lokale k3d vom Wegwerf-Testcluster zu einer dauerhaft betriebenen Umgebung wird.

## Offene Punkte

Diese Fragen werden nicht hier entschieden, sondern in der jeweiligen Etappe:

- **Import-Verflechtung**: Wie stark teilen SDLC- und Geschäftscode `website/src/lib/`? Der
  gemessene Import-Graph bestimmt den tatsächlichen Umzugsaufwand in E1.
- **Ticket-Historie**: Vollständige Migration des `tickets`-Schemas oder Schnitt zu einem Stichtag
  mit read-only Archiv in Prod? Entscheidung in E3, abhängig von den FK-Kanten nach `public.*`.
- **Kunden-Bugmeldungen**: Kommen Fehlermeldungen weiterhin über die Website herein, braucht Prod
  einen Schreibpfad in die lokale Datenbank — voraussichtlich eine Outbox-Tabelle nach dem Muster
  von `public.systemtest_failure_outbox`. Zu klären in E3.
- **Backup der lokalen Datenbank**: Die SDLC-Daten sind Bestandteil der Bachelorarbeit; ein
  Datenverlust auf einer Heim-Workstation ist nicht hinnehmbar. Zielort und Verfahren offen.
- **`knowledge`/`wissen`**: Bleibt produktiv, während der Brain-Ingest lokal läuft. Ob diese
  Aufteilung tragfähig ist, zeigt sich im Betrieb.
- **WSL-Speicherzuteilung**: Wie viel von den 64 GB braucht die Windows-Seite tatsächlich, wenn
  llama.cpp mit vollem GPU-Offload und ComfyUI laufen? Messung vor E2; das Ergebnis bestimmt den
  neuen `memory`-Wert in `.wslconfig`.
