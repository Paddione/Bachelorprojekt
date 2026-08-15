# Proposal: repo-structure-reorg

## Why

Die Repo-Root trägt ~35 Top-Level-Einträge, deren Semantik weder für Menschen noch für
Agenten ablesbar ist: `website/` liegt neben `assets/` neben `wireguard/` neben `SOUL.md`.
Fünf MD-Dateien (`SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `QWEN.md`) werden
von keinem Tool maschinell gelesen (repo-weiter Grep, 2026-08-15); `QWEN.md` dupliziert
mit 335 Zeilen Projekt-Kontext, der in `CLAUDE.md` maßgeblich gepflegt wird. Gleichzeitig
existieren Struktur-Keime (`apps/` als App-Registry, `packages/` als npm-Pakete), die ein
konsequentes Monorepo-Layout nahelegen.

Design-Doc (User-freigegeben): `docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md`

## What

Drei Maßnahmen, gruppiert nach Konsumenten-Beziehungen statt Ästhetik:

1. **MD-Kur:** `SOUL.md` + `IDENTITY.md` → `docs/agent-context/persona.md`, `USER.md` →
   `docs/agent-context/user.md`, `HEARTBEAT.md` → `docs/agent-context/heartbeat.md`,
   `QWEN.md` → Zeiger auf `CLAUDE.md` (Vorbild `GEMINI.md`). Die Root behält nur
   Harness- und GitHub-Konventionen (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `QWEN.md`,
   `README.md`, `CONTRIBUTING.md`, `LICENSE`).
2. **Komponenten-Gruppierung:** `website`, `brett`, `studio-server`, `mentolder-web`,
   `mediaviewer-widget`, `VideoVault` → `components/`. `apps/` bleibt als App-Registry
   unberührt. Jede Komponente hat dasselbe Konsumentenprofil (eigener Build-Workflow,
   Dockerfile, Taskfile-/tests-/scripts-Referenzen) — sechs gleichförmige atomare Moves.
3. **Mini-Moves:** `design-system` → `packages/design-system`, `art-library` →
   `assets/art-library`.

**Out of scope** (bewusste Entscheidung, im Delta-Spec festgeschrieben): `k3d/`, `prod*/`,
`flux/`, `environments/`, `openspec/`, `tests/`, `scripts/`, `docker/`, `dotfiles/`,
`migrations/`, `templates/`, `wireguard/`, `rustdesk-installer/` und alle Root-Configs
(tooling-seitig erzwungen) bleiben unverändert.

Ausführung: ein Move = ein atomarer Commit (`git mv` + alle Referenz-Updates), Reihenfolge
risikofallend, Grep-Verifikation pro Move (Referenzen auf den alten Pfad müssen leer sein).
Finaler Verify: `task test:all` + `freshness:regenerate` + `freshness:check`.

_Ticket: T006999_
