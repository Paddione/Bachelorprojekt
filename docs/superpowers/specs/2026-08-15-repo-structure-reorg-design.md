# Repo-Struktur-Reorg — Root entschlacken nach Konsumenten-Beziehungen

_2026-08-15 · Brainstorming-Ergebnis mit Patrick · Ansatz B (Gruppierung nach Konsumenten)_

## Problem

Die Repo-Root trägt ~35 Top-Level-Einträge: 12 Markdown-Dateien, ~15 Config-Dateien und
~20 Ordner mit sehr unterschiedlicher Semantik. Für Menschen wie Agenten ist nicht ablesbar,
welcher Ordner wem gehört: `website/` liegt neben `assets/` neben `wireguard/` neben
`SOUL.md`. Fünf der MD-Dateien (`SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`,
`QWEN.md`) werden von **keinem** Tool maschinell gelesen (verifiziert per repo-weitem Grep
am 2026-08-15) — sie sind reine Root-Lese-Konvention für Agenten. `QWEN.md` dupliziert mit
335 Zeilen Projekt-Kontext, der in `CLAUDE.md` maßgeblich gepflegt wird.

Gleichzeitig existieren bereits Struktur-Keime mit definierter Semantik, die ein Reorg
respektieren muss:

- **`apps/`** ist eine App-Registry (`apps/whiteboard/app.yaml`: name, kustomize-Pfad,
  domains, secrets) — kein Ort für Quellcode-Komponenten.
- **`packages/`** enthält npm-Pakete (`packages/videovault-player` mit src/, tsconfig).
- **`taskfiles/`** bündelt alle Teil-Taskfiles (14 Stück).
- **`assets/`** wird von `.claude`-Skills konsumiert (`assets/schemas`, 82 Referenzen).

## Scope

**In scope:** MD-Konsolidierung, Gruppierung der sechs Build-Komponenten unter
`components/`, zwei Mini-Moves (`design-system` → `packages/`, `art-library` → `assets/`).

**Bewusst out of scope (User-Entscheidung 2026-08-15):**

- `k3d/`, `prod*/`, `flux/`, `environments/`, `openspec/`, `tests/`, `scripts/` — tief in
  Flux-GitOps, CI-Workflows und Taskfiles verdrahtet; ein Move dort hätte Produktionsrisiko
  ohne Verständnis-Gewinn.
- `docker/`, `dotfiles/`, `migrations/`, `templates/`, `wireguard/`, `rustdesk-installer/` —
  hybrid konsumierte Betriebs-Ordner (Skripte, Tests, Skill-Templates, Workflows). Der
  Move-Aufwand steht in keinem Verhältnis zum Gewinn; ihre Top-Level-Position ist ein
  etablierter Konsumvertrag.
- Root-Config-Dateien (`.mcp.json`, `renovate.json5`, `release-please-*`, `package.json`,
  `commitlint.config.cjs`, `lighthouserc.json`, …) — Root ist hier tooling-seitig erzwungen
  oder Best Practice (Renovate/GitHub-Konventionen). Verschieben bräche Konventionen.

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
└── alles andere unverändert: k3d/ prod*/ flux/ environments/ openspec/ tests/ scripts/
    taskfiles/ apps/ docker/ dotfiles/ migrations/ templates/ wireguard/
    rustdesk-installer/ + Root-Configs
```

**Gelöscht aus Root:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md` — Inhalte
konsolidiert nach `docs/agent-context/persona.md` (SOUL+IDENTITY), `user.md`, `heartbeat.md`.
`QWEN.md` wird auf einen Zeiger reduziert (Vorbild: `GEMINI.md`, das bereits nur auf
`CLAUDE.md` verweist).

## Referenz-Update-Matrix

Konsumenten je Move-Cluster, gemessen per Grep am 2026-08-15:

| Move | Konsumenten | Last |
|---|---|---|
| `website` → `components/website` | `.github/workflows/` (build-website, ci, e2e, ~40 Stellen), `Taskfile*.yml` (25+), `scripts/` (198+), `tests/` (495+), `.claude`/`.opencode` (100+), website-interne Pfade | groß — eigenes Partial |
| `brett`, `studio-server`, `mentolder-web`, `mediaviewer-widget`, `VideoVault` → `components/` | je: 1 Build-Workflow, 2–3 Taskfile-Stellen, 5–30 tests-Stellen, wenige scripts-Stellen | mittel — 1–2 Partials |
| `design-system` → `packages/design-system` | build.mjs-Ausgabeziele, Taskfile-assets, tests | klein |
| `art-library` → `assets/art-library` | Taskfile art-library, scripts/branding | klein |
| MD-Kur | keine maschinellen Referenzen (verifiziert) | trivial |

**Verifizierter Negativ-Befund:** `k3d/`, `flux/`, `prod*/` enthalten keine echten
Repo-Pfad-Referenzen auf die Move-Kandidaten (Treffer in `k3d/docs-content-built/*.html`
sind generierte Doku; `apps/whiteboard`-Treffer in `k3d/vaultwarden-seed-job.yaml` ist eine
Nextcloud-App-URL). Die Infra bleibt vom Reorg also tatsächlich unberührt.

## Ausführungs-Strategie

1. **Ein Move = ein atomarer Commit:** `git mv` plus alle Referenz-Updates im selben
   Commit. Kein Zwischenzustand darf CI brechen — Workflows mit `paths:`-Filtern reagieren
   auf jeden main-Push, und `test:inventory` schlägt bei Pfad-Drift fehl.
2. **Reihenfolge nach Risiko aufsteigend:** MD-Kur → Mini-Moves (design-system,
   art-library) → kleine Komponenten → `website` zuletzt.
3. **Verifikation pro Move:** Grep-Verifikation (Referenzen auf den alten Pfad müssen leer
   sein), `task test:changed`, gezielte BATS-Läufe der betroffenen Specs,
   `task workspace:validate`. Der finale Verify-Task läuft `task test:all`,
   `task freshness:regenerate`, `task freshness:check`.
4. **`git mv` überall** (History bleibt erhalten); Squash-Merge.

## Risiken

| Risiko | Mitigation |
|---|---|
| CI rot durch übersehene Referenz | Matrix + Grep-Verifikation pro Move (`grep -rn '<alt-pfad>'` muss leer sein) als expliziter Step in jedem Partial-Plan |
| Factory-/Session-Parallelität auf denselben Dateien | Partials disjunkt halten (D1-Regel), Branch-Frische vor jedem Partial |
| Generierte Doku (`k3d/docs-content-built/`, brain-Wiki) referenziert alte Pfade informativ | Kein Guard; `docs:deploy` und brain-ingest laufen nach Abschluss erneut |
| `assets/schemas`-Skill-Referenzen | Unberührt — `assets/` bleibt, nur ein Unterordner kommt hinzu |

## Testing

- Bestehende Guards (`test:inventory`, Taskfile-Dry-Run, `workspace:validate`) laufen
  unverändert — sie sind zugleich die Sicherheitsnetze, die Pfad-Brüche rot machen.
- Pro Move-Cluster: BATS-Test der betroffenen Specs; für den `website`-Move ein neuer
  Drift-Guard, der sicherstellt, dass keine Top-Level-`website/`-Referenz zurückbleibt
  (mit Positiv-Anker-Konvention: erst der gültige Fall, dann die Negativ-Aussage).
- Finale Verifikation: `task test:all` + `task freshness:regenerate` + `task freshness:check`
  grün, bevor gemergt wird.

## Entscheidungen (im Review 2026-08-15 getroffen)

- Ticket-Typ `chore` (keine Verhaltensänderung), aber mit OpenSpec-Proposal und
  Partial-Plan — expliziter User-Wunsch, nicht der inline-Chore-Pfad. Ticket: T006999.
- Gruppennamen `components/` vom User bestätigt (Alternativen `services/`,
  `workspaces/` verworfen).
- Ob `QWEN.md` als Zeiger-Datei erhalten oder komplett entfernt wird, entscheidet sich
  beim Schreiben des MD-Kur-Partials anhand der `.opencode`-Referenzen.
