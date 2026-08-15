---
ticket_id: T006999
plan_ref: openspec/changes/repo-structure-reorg/tasks.md
status: active
date: 2026-08-15
---

# Design: Repo-Root entschlacken — Gruppierung nach Konsumenten-Beziehungen

## Zweck

Die Repo-Root trägt ~35 Top-Level-Einträge (12 MDs, ~15 Configs, ~20 Ordner), deren Semantik
weder für Menschen noch für Agenten ablesbar ist. Fünf MD-Dateien (`SOUL.md`, `IDENTITY.md`,
`USER.md`, `HEARTBEAT.md`, `QWEN.md`) werden von keinem Tool maschinell gelesen (repo-weiter
Grep, 2026-08-15); `QWEN.md` dupliziert mit 335 Zeilen Projekt-Kontext aus `CLAUDE.md`.
Ziel: eine Root, die nur noch Harness- und GitHub-Konventionen trägt, und eine
Komponenten-Gruppierung, deren Konsumenten-Beziehungen erzählbar sind.

Ausführliches Brainstorming-Dokument:
`docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md` (User-freigegeben).

## Entscheidungen

1. **Ansatz B — Gruppierung nach Konsumenten** (User-Entscheidung 2026-08-15): Ein Ordner
   wandert nur, wenn seine Konsumenten klar benennbar und Referenzen mechanisch
   aktualisierbar sind. Aggressive Voll-Reorgs (Ansatz A) und MD-only (Ansatz C) verworfen.
2. **`components/` als Gruppenname** (User bestätigt): `services/` und `workspaces/`
   verworfen — `components/` beschreibt Build-Artefakte ohne Laufzeit-Semantik am
   neutralsten. `apps/` bleibt als App-Registry unberührt (Kollision vermieden).
3. **Ticket-Typ `chore` mit OpenSpec-Proposal und Partial-Plan** statt inline-Chore-Pfad —
   expliziter User-Wunsch („/dev-flow-plan a structure").
4. **Infra-Pfade und Betriebs-Ordner bleiben Top-Level** (`k3d/`, `prod*/`, `flux/`,
   `environments/`, `openspec/`, `tests/`, `scripts/`, `docker/`, `dotfiles/`,
   `migrations/`, `templates/`, `wireguard/`, `rustdesk-installer/`): im Delta-Spec als
   Requirements festgeschrieben, damit die Entscheidung nicht still umkehrbar ist.
5. **Root-Configs bleiben**: `.mcp.json`, `renovate.json5`, `release-please-*`,
   `package.json` etc. sind tooling-seitig an die Root gebunden (GitHub-/Renovate-/
   Release-Please-Konventionen).

## Ziel-Struktur

```
BACHELORPROJEKT/  (Root — nur noch Harness- und GitHub-Konventionen)
├── CLAUDE.md  AGENTS.md  GEMINI.md  QWEN.md(Zeiger)   ← Harness-Einstiege
├── README.md  CONTRIBUTING.md  LICENSE                  ← GitHub-Konventionen
├── components/          ← NEU: Build-Komponenten mit Workflow + Dockerfile
│   ├── website/  brett/  studio-server/  mentolder-web/
│   └── mediaviewer-widget/  VideoVault/
├── packages/            ← + design-system/
├── assets/              ← + art-library/ (als Unterordner)
├── docs/agent-context/  ← NEU: persona.md (SOUL+IDENTITY), user.md, heartbeat.md
└── alles andere unverändert
```

## Referenz-Update-Matrix

Konsumenten je Move-Cluster, gemessen per Grep am 2026-08-15 (Fixed-String, ohne
node_modules/.git/tmp/k3d/docs-content-built):

| Move | Konsumenten | Last |
|---|---|---|
| `website` → `components/website` | `.github/workflows/` (~40), `Taskfile*.yml` (25+), `scripts/` (198+), `tests/` (495+), `.claude`/`.opencode` (100+), website-intern | groß — eigenes Partial |
| `brett`, `studio-server`, `mentolder-web`, `mediaviewer-widget`, `VideoVault` → `components/` | je: 1 Build-Workflow, 2–3 Taskfile-Stellen, 5–30 tests-Stellen, wenige scripts-Stellen | mittel — 1–2 Partials |
| `design-system` → `packages/design-system` | build.mjs-Ausgabeziele, Taskfile assets, tests | klein |
| `art-library` → `assets/art-library` | Taskfile art-library, scripts/branding | klein |
| MD-Kur | keine maschinellen Referenzen (verifiziert) | trivial |

**Verifizierter Negativ-Befund:** `k3d/`, `flux/`, `prod*/` enthalten keine echten
Repo-Pfad-Referenzen auf die Move-Kandidaten (Treffer in `k3d/docs-content-built/*.html`
sind generierte Doku; `apps/whiteboard` in `k3d/vaultwarden-seed-job.yaml` ist eine
Nextcloud-App-URL). Die Infra bleibt vom Reorg unberührt.

## Ausführungs-Strategie

1. **Ein Move = ein atomarer Commit:** `git mv` plus alle Referenz-Updates im selben
   Commit. Kein Zwischenzustand darf CI brechen — Workflows mit `paths:`-Filtern reagieren
   auf jeden main-Push, `test:inventory` schlägt bei Pfad-Drift fehl.
2. **Reihenfolge risikofallend:** MD-Kur → Mini-Moves (design-system, art-library) →
   kleine Komponenten → `website` zuletzt.
3. **Verifikation pro Move:** Grep-Verifikation (Referenzen auf den alten Pfad müssen leer
   sein), `task test:changed`, gezielte BATS-Läufe, `task workspace:validate`. Finaler
   Verify: `task test:all` + `task freshness:regenerate` + `task freshness:check`.
4. **`git mv` überall** (History bleibt erhalten); Squash-Merge.

## Risiken

| Risiko | Mitigation |
|---|---|
| CI rot durch übersehene Referenz | Matrix + Grep-Verifikation pro Move als expliziter Step in jedem Partial-Plan |
| Factory-/Session-Parallelität auf denselben Dateien | Partials disjunkt halten (D1-Regel), Branch-Frische vor jedem Partial |
| Generierte Doku (`k3d/docs-content-built/`, brain-Wiki) referenziert alte Pfade informativ | Kein Guard; `docs:deploy` und brain-ingest laufen nach Abschluss erneut |
| `assets/schemas`-Skill-Referenzen | Unberührt — `assets/` bleibt, nur ein Unterordner kommt hinzu |

## Testing

- Bestehende Guards (`test:inventory`, Taskfile-Dry-Run, `workspace:validate`) laufen
  unverändert — sie sind zugleich die Sicherheitsnetze, die Pfad-Brüche rot machen.
- Pro Move-Cluster: BATS-Test der betroffenen Specs; für den `website`-Move ein neuer
  Drift-Guard (keine Top-Level-`website/`-Referenz darf zurückbleiben, mit
  Positiv-Anker-Konvention: erst der gültige Fall, dann die Negativ-Aussage).
- Finale Verifikation: `task test:all` + `task freshness:regenerate` +
  `task freshness:check` grün, bevor gemergt wird.
