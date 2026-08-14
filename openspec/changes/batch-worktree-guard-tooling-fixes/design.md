---
ticket_id: T004295
plan_ref: openspec/changes/batch-worktree-guard-tooling-fixes/tasks.md
status: active
date: 2026-08-14
---

# Design: batch-worktree-guard-tooling-fixes

## Goals

Fünf Mishap-Fixes aus dem Bereich Worktree-/Guard-Tooling in einem Batch-Durchlauf beheben
(Parent T004295, Kinder T004261, T003991, T004269, T003988, T003982). Gemeinsames Ziel:
der Standard-Arbeitspfad (Commit → Hook → Plan → Stage → Archive → Deploy) läuft ohne
manuelle Bypasses und ohne stille Hänger.

## Non-Goals

- Kein Umbau der Factory-Pipeline (pipeline.js) — nur die Allowlist wird erweitert.
- Kein automatisches Deployen des lokalen SDLC-Stacks — er bleibt manuell deployed.
- Keine Rename-Welle bestehender `feat/batch-*`-Branches — Bestand bleibt unberührt.
- Keine Änderung am Embed-Backend selbst — nur Verbindungsverhalten im Hook-Pfad.

## Decisions

### D1 — T004261: Allowlist erweitern (User-Entscheidung 2026-08-14)

Der Pre-commit-Hook (`.githooks/pre-commit` Z. 166) akzeptiert künftig `feat/batch-*`
zusätzlich zu `feature/ fix/ chore/ docs/`. Die Factory-Praxis (`feat/batch-*-T00XXXX`)
bleibt unangetastet; CLAUDE.md Rule 7 wird um das Batch-Muster ergänzt.

- **Trade-off:** `feat/` bleibt generell verboten — nur das Batch-Muster wird erlaubt,
  damit keine ungewollten Branch-Konventionen einsickern.
- **Verworfen:** Factory auf `feature/batch-*` umstellen — bräche bestehende Plan-Refs
  und Lock-Namen und verlagert die Reibung in den Erzeuger.

### D2 — T003991: Guard normalisiert `-T<id>`-Suffix (User-Entscheidung 2026-08-14)

`scripts/hooks/worktree-write-guard.sh` prüft bei der Pfad-Normalisierung zusätzlich:
existiert der Lock-Worktree-Pfad nicht, aber derselbe Pfad ohne `-T\d+`-Suffix, gilt der
reale Pfad. Damit fällt der eigene Claim mit Suffix-Drift nicht mehr in den Fremd-Zweig
(Regel 3, T002412-Muster aus T003812).

- **Beobachtung aus dieser Session (2026-08-14):** Ein Write in den Haupt-Checkout bei
  aktivem Worktree-Claim wurde vom Guard blockiert — das ist korrektes Guard-Verhalten
  (T002357-M1: Edit/Write treffen sonst still die falsche Arbeitskopie). Der Claim gehört
  erst in Phase B, nicht vor Phase A. Zusätzlich legt `worktree-create.sh` den Worktree
  mit `-T<id>`-Suffix an, auch wenn der Pfad ohne Suffix übergeben wird — die
  Drift-Quelle, die dieser Fix entschärft.
- **Trade-off:** etwas mehr Logik im Guard, dafür deckt er auch Legacy-Claims und fremde
  Aufrufer ab — die Fehlerklasse, nicht die Einzelinstanz.
- **Verworfen:** Namensschema im Claim fixen — schützt nur neue Claims.

### D3 — T003982: Routing-Ausschluss `k3d/sdlc-stack/` (User-Entscheidung 2026-08-14)

`scripts/devflow-post-merge-deploy.sh` filtert `k3d/sdlc-stack/`-Pfade vor dem
`DEPLOY_K8S`-Match heraus; die Routing-SSOT `.claude/skills/references/deploy-routing.md`
wird um den Ausschluss ergänzt.

- **Technische Notiz:** `grep -E` hat kein Lookahead — der Ausschluss läuft als
  vorgeschalteter Filter (erst sdlc-stack-Pfade entfernen, dann matcht die bestehende
  k3d/-Regex), kein einzelner Riesen-Regex.
- **Verworfen:** lokales Auto-Deploy des SDLC-Stacks — neue Fähigkeit mit eigenem
  Fehlerraum (lokaler Cluster läuft nicht immer), YAGNI.

### D4 — T004269: `git show`-Fallback in `cmd_archive_plan`

`scripts/ticket.sh` Z. 237 liest die Plandatei bei fehlender Datei per
`git show "${branch}:${plan_file}"` statt `cat` (der Existenz-Check Z. 209 hat den Blob
dann bereits bestätigt). CLI- und MCP-Pfad teilen die Funktion — beide geheilt.

- **Grundlage:** Ticket-Empfehlung; der SSOT
  (`devflow-selection-archive-hardening`) deckt nur den CLI-Worktree-Fall ab, nicht den
  Adapter-cwd-Fall des Go-Adapters.

### D5 — T003988: Connect-Timeout am pg.Pool

`scripts/openspec-embed.mjs` Z. 375 setzt `connectionTimeoutMillis` (10 s) auf dem
pg.Pool; bei Timeout/ECONNREFUSED wird die vorhandene Kollisions-Diagnose (Z. 376–382)
als Ursache ausgegeben statt zu hängen. Damit greift der bestehende 3×-Retry + WARN-Pfad
des Hooks (`.githooks/post-commit-embed`).

- **Explorer-Präzisierung:** Der Hänger entsteht nicht an Port 15432 direkt (das ist der
  k3d-Published-Port für Postgres), sondern am Pool-Connect ohne Timeout
  (pg-Default 0 = unbegrenzt).
- **Grundlage:** SSOT `batch-openspec-embed-fixes` Requirement „Port-Kollision nicht-fatal
  mit klarer Meldung" — der Fix schließt die Implementierungslücke zu diesem Requirement.

## Testing

Ein BATS-Guard pro Vorgang (T002416-Konvention: eigene Datei unter `tests/spec/<spec>/`),
durchgehend Output-Verifikation (T002448-M4) mit Positiv-Anker (T002356-M1):
Hook-Lauf mit simuliertem `feat/batch-*`-Branch, Guard mit driftendem Lock-Pfad,
`archive-plan` mit Branch-only-Plan, Embed-Skript mit unreachable-URL + Zeitmessung,
Routing-Skript mit sdlc-stack-Pfadliste.
