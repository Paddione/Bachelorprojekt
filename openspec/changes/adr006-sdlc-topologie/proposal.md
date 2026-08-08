# Proposal: adr006-sdlc-topologie

## Why

Der Software-Development-Lifecycle dieses Projekts ist physisch mit der Kundenproduktion
verwoben, obwohl er logisch nichts mit ihr zu tun hat. Der Factory-Kern und die agentische
Laufzeit laufen zwar bereits lokal (Dev-Host, WSL2/RTX 5070 Ti), aber die **Daten**
(`tickets.*` in `shared-db` auf fleet) und die **Oberfläche** (SDLC-Seiten in derselben
Astro-Anwendung wie mentolder.de) hängen in der Hetzner-Produktion. Gemessen am 2026-08-03
ergeben sich daraus drei Schmerzpunkte:

1. **Blast Radius.** Ein Commit an einer SDLC-Seite baut das Website-Image neu und rollt es auf
   mentolder.de und korczewski.de aus. Ein Fehler in der Entwicklungsfläche kann die Kundenseite
   kippen.
2. **Ressourcenlast auf fleet.** Jeder Cockpit-Poll, jeder Factory-Floor-Refresh und jede
   Ticket-Query trifft einen Website-Pod und die `shared-db`. Der einzige echte SDLC-Workload im
   Cluster ist der nächtliche `knowledge-ingest-cronjob`; die Last stammt fast vollständig aus der
   Admin-Fläche.
3. **Kognitive Vermischung.** Unter `/admin` liegen Rechnungen, Buchhaltung, Steuer, Kunden und
   Coaching direkt neben Factory-Floor, Pipeline und Cluster-Monitoring.

Die Entscheidung, wie der Schnitt aussieht, ist durch das Grilling (2026-08-03, Fragen G1–G12)
bereits gefallen und in [ADR-006](../../../docs/adr/ADR-006-sdlc-isolation-dev-host.md)
festgehalten: SDLC wandert komplett auf den Dev-Host, Nicht-Entwicklung bleibt auf fleet. Dieses
Ticket ist die **Epic/ADR-Chore** — das ADR/Architektur-Dokument selbst, auf dem alle
abgeleiteten Changes (E1–E6) aufsetzen. Es liefert die gemessenen Assets, schärft das Zielbild
und definiert die abgeleitete Change-Landschaft.

## What

**Ein ADR/Architektur-Dokument** (als OpenSpec-Change mit Delta-Spec auf der SSOT
`sdlc-isolation`) plus die **gemessenen Ist-Daten**, die die im ADR offenen Punkte beantworten:

1. **Import-Graph `website/src/lib`** — post-E1 gemessen: Wie viel teilen SDLC- und
   Geschäftsfläche nach dem Verzeichnis-Schnitt noch? Ergebnis: 295 `lib`-Module, davon 37 unter
   `lib/sdlc/`; von beiden Flächen benutzt werden nur noch **17 Module (5,8 %)**, ausschließlich
   Infrastruktur (`auth`, `db-pool`, `logger`, `identity`, `website-db`, …) — **kein fachliches
   Overlap mehr**. Der Umzugsaufwand ist damit beantwortet: der Schnitt ist sauber.
2. **Tabellenliste `tickets`-Schema** — gemessen am 2026-08-04: 24 Tabellen, ~36.000 Zeilen
   (Schätzung über `pg_stat_user_tables`). Alle Foreign-Keys und Views sind **intern zum Schema**
   — es existieren **keine FK-Kanten nach `public.*`/`bachelorprojekt.*`** und keine View, die
   andere Schemata referenziert. Das Schema ist kopplungsseitig autark; eine Voll-Migration nach
   lokal-primär (E3) ist damit nicht durch Schema-Kanten blockiert. Die einzige Querkopplung läuft
   über geteilten Anwendungscode (`website-db`, `auth`), nicht über die DB.
3. **fleet-Last** — qualitativ bestätigt durch Pod-Inventar (2026-08-04): SDLC-relevante
   Workloads im Cluster sind `mentolder-web` (beherbergt bis E4 die SDLC-Routen), `shared-db`
   (hält `tickets.*`) und die `knowledge-ingest-*`-Cronjobs — letztere der einzige echte
   SDLC-Workload. Die Messmethodik (Baseline vor E4, Vergleich nach E4) ist in T002627 verankert;
   die Metrik-Schnittstelle war aus dem Planungs-Kontext nicht erreichbar (RBAC-Limitation, s.
   design.md).
4. **VRAM-Messreihe der Kandidatenmodelle** — vorhandene Messwerte aus `scripts/llm/loadouts.json`
   (gpt-oss-20b Q8_0: 11,5–12,1 GB, gemessen 158–166 tok/s bei 105.472 Kontext; Devstral-Small-2
   24B IQ4_XS: 12,78 GB; Gemma-4-12B Q4_K_XL) plus die Machbarkeitsmatrix aus
   `scripts/finetune/measure_corpus.py` (Default 16 GB). Das ist die Datengrundlage der
   GPU-Arbitrierung (E5) und der Modell-Registry-Dimension 2 (E6).

**Abgeleitete Change-Landschaft** (in ADR-006 als Etappen E1–E6 definiert, Tickets existieren):

| Etappe | Change / Ticket | Stand |
|---|---|---|
| E1 | Build-Target-Split (`sdlc-build-target-split`, T002624) | **gemergt** |
| E2 | Lokaler k3d-Stack — Console, PostgreSQL, bge, Auth (T002625) | offen, wird separat geplant |
| E3 | `tickets`-Schema lokal-primär + GitHub-Poller (T002626) | offen |
| E4 | SDLC-Routen aus dem Produktions-Image (T002627) | offen (build-seitig schon wirksam) |
| E5 | GPU-Arbitrierung — Trainings-Lock, llm-proxy-Draining (T002628) | offen |
| E6 | Modell-Registry + Training Grounds (T002629) | offen (hängt an PR #3745) |

Referenzen: T002606 (Eval-Harness, done), T002647 (Migrations-Runner, offen — berührt die lokale
DB ab E3).

## Impact

**Neue Dateien:**
- `openspec/changes/adr006-sdlc-topologie/proposal.md`
- `openspec/changes/adr006-sdlc-topologie/design.md`
- `openspec/changes/adr006-sdlc-topologie/specs/sdlc-isolation.md` (Delta auf SSOT-Parent
  `sdlc-isolation` — gleicher Parent wie E1; beim Archivieren wird die SSOT per `--create-new`
  angelegt)
- `openspec/changes/adr006-sdlc-topologie/tasks.md`
- `tests/spec/sdlc-isolation/adr006-topologie.bats` (RED→GREEN-Guard: ADR-Struktur + Epic-Spec)

**Geänderte Dateien:**
- `docs/adr/ADR-006-sdlc-isolation-dev-host.md` — Ist-Stand um die gemessenen Assets ergänzen
  (Import-Graph post-E1, Schema-Analyse, VRAM-Messwerte; beantwortete „Offene Punkte" abhaken)

**Risiken:** gering — reine Dokumentation plus ein BATS-Guard; keine Laufzeitänderungen.

**Out-of-Scope:** Die Kind-Etappen E2–E6 (T002625–T002629) werden in ihren eigenen Tickets
geplant. Nicht-Entwicklung (Kundenwebsite, Billing, Coaching, Nextcloud, Pocket ID, Vaultwarden)
bleibt auf fleet — das ADR bestätigt die Abgrenzung, verschiebt aber nichts.

_Ticket: T002623 (Epic/ADR) · Kinder: T002624 (E1, gemergt), T002625–T002629 (E2–E6)_
