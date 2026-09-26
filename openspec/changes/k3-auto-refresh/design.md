---
ticket_id: T900450
plan_ref: null
status: active
date: 2026-09-26
---

# Design: K3-Auto-Refresh periodisch (Change 3/6)

Epic T900447, Change-Ticket T900450, ADR-009. K3 wird
Präzisions-Schicht: der Code-Graph (`~/.cache/codebase-memory-mcp/`,
SQLite, heute 97.506 Nodes / 228.997 Edges, Projekt
`home-patrick-Bachelorprojekt`) bekommt einen periodischen Refresh statt
manueller Snapshots — plus den Single-Flight-Schutz, ohne den jeder
Auto-Refresh die Stampede vom 24.08. wiederholen würde.

Input: K3-Exploration aus Session 01a0db9a (SEQ 7518, read-only,
verifiziert), Grill-Antworten auf T900450 (`k3-refresh-v1`:
freshness=periodisch, singleflight=in-3/6), archivierter Change
`2026-09-17-cbm-index-single-flight` (Proposal + Tasks als Vorlage).

## Ziele

- Periodischer Refresh ohne manuellen Lauf: Cron-Job auf dieser Maschine,
  hourly Default, skip-if-fresh (teure Volljobs nur bei Drift).
- Single-Flight: höchstens ein Index-Job pro Repo-Pfad — Cron UND
  manuelle Taskfile-Läufe laufen über den flock-Wrapper.
- Frische-Kriterium messbar (Ticket-Forderung): Staleness-Bound =
  Intervall + Refresh-Dauer; Nachweis über Cron-Metrik (last-refresh age)
  + Guard.
- Bestand erfüllen: SHALL in `agentic-tooling-quality-goals.md:322`
  (T016447) wird umgesetzt; REQ-k3-02-Abdeckung wird wahr.

## Nicht-Ziele

- Kein Shared-Store/Daemon-Umbau (Follow-up aus T016447, eigener Change).
- Kein CI-Trigger, keine systemd-Unit (Cron gewählt, E1), kein Cluster.
- Kein Hook-Umbau: `.githooks/post-merge` bleibt wie es ist (periodisch
  deckt alle Merge-Pfade ab, auch GitHub-Squash ohne Hook).
- Keine Versions-Bereinigung Binary vs. npx (v0.9.0 vs 0.10.8) →
  Follow-up-Ticket, hier nur als Risiko notiert.
- Kein K1/K4/Wiki-Eingriff (2/6, 4/6), keine Brand-Laufzeitänderung.

## Entscheidungen (Brainstorming 2026-09-26)

- E1: Cron-Skript nach `repo-hygiene-cron.sh`-Muster (aktiver Präzedenz:
  täglich 08:00 in dieser Crontab, S4-allowlisted). Gegen systemd-Timer:
  `sdlc-backup.timer` trägt Tot-Vermerk, Watchdog-Timer ist zwar aktiv,
  aber für Wartungs-Skripte ist Cron hier die Kategorie-Konvention.
  Verpasste Läufe bei ausgeschalteter Maschine sind akzeptiert
  (Staleness-Bound gilt bei laufender Maschine; erster Tick nach Boot
  holt bei Drift sofort nach).
- E2: Single-Flight-Wrapper `scripts/mcp/cbm-single-flight.sh` (flock,
  Lockdatei in `~/.cache/codebase-memory-mcp/`, `mkdir -p` fail-safe).
  Design aus dem archivierten Change übernommen (flock-Semantik,
  Runbook-Gliederung, Guard-Skizze) — kein Re-Design, Umsetzung des
  specced-aber-nie-gebauten Stands.
- E3: Intervall hourly Default; der Plan enthält einen Vermessungs-Task
  (`time` fast-refresh auf dieser Box): Intervall gilt nur, wenn p50
  Refresh-Dauer << Intervall (Akzeptanz: < 25 % des Intervalls).
  Unvermessen war Stand der Exploration — keine Annahme im Plan.
- E4: Skip-if-fresh im Cron-Job: `index_status` (~10 ms) +
  `detect_changes` (~1,4 s) als Pre-Gate; nur bei Drift läuft der
  Wrapper-Job. Spart die Volljob-Kosten im Normalfall.
- E5: `Taskfile.yml` (`codebase:index`, `codebase:refresh`) ruft den
  Wrapper auf — Kollisions-Check gegen 1/6- und 2/6-Partials negativ
  (kein Partial fasst Taskfile an). Manuelle Läufe werden so
  stampede-sicher, Verhalten sonst identisch.
- E6: Runbook `docs/runbooks/cbm-index-stampede.md` (Akut-Mitigation +
  Prävention nach T016447-Spec); Guard
  `tests/spec/cbm-stampede-guard.bats` (statisch: flock+Lockpfad,
  Cron-nutzt-Wrapper, kein direktes `index_repository` in Automation,
  Cron-Eintrag dokumentiert).
- E7: `docs/brain/k3-code-graph.md` wird auf neuen Stand gebracht
  (Persistenz SQLite, Projekt, periodischer Trigger). Spec-Purpose für
  `brain-k3-code-graph.md` („Purpose fehlt") landet beim Archiv-Merge:
  „K3 beschreibt den Code-Graphen (codebase-memory-mcp) als
  Präzisions-Schicht des Brains: Index-Ablage, Refresh-Trigger,
  Transportwege und Verhältnis zu K1."

## Risiken

- R1: Refresh-Dauer unvermessen (E3 fängt das: Mess-Task mit Gate).
- R2: Binary/npx-Drift (v0.9.0 vs 0.10.8) — Verhalten kann je Pfad
  abweichen; hier nur dokumentiert, Fix im Follow-up.
- R3: `auto_watch=true` feuert weiter server-seitig bei Drift — der
  Wrapper serialisiert nur skriptgesteuerte Aufrufe; Runbook adressiert
  den Rest (wie in T016447 specced).

## Validierung

- `task test:changed` + `freshness:check` grün; Guard-BATS grün.
- Cron-Tick-Dry-Run: skip-if-fresh greift bei frischem Index (kein
  Job-Start), feuert bei Drift (Wrapper-Log belegt Serialisierung).
- Zwei parallele Wrapper-Aufrufe: zweiter wartet, kein Doppel-Volljob
  (Szenario aus dem SHALL, manuell am Lockfile nachweisbar).
