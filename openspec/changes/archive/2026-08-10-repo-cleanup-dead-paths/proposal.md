# Proposal: repo-cleanup-dead-paths

## Why

Die Repo-Wurzel trägt Dateien, die auf nichts mehr zeigen, und Konfiguration, die auf Dateien
zeigt, die es nicht gibt. Beides ist dieselbe Krankheit von zwei Seiten, und beides ist belegt:

- `scripts/factory/service-registry.sh` führt sechs Einträge, deren Manifest nicht existiert
  (`k3d/whiteboard.yaml`, `k3d/claude-code-config.yaml`, `k3d/claude-code-mcp-browser.yaml`,
  `k3d/claude-code-mcp-github.yaml`, `k3d/claude-code-mcp-ops.yaml`, `k3d/claude-code-rbac.yaml`).
- `.dockerignore` listet vierzehn Pfade, die im Repo fehlen — davon acht echte Karteileichen
  (`argocd`, `docs-site`, `deploy`, `whisper`, `korczewski-website`, `vault-exports`,
  `billing-bot`, `memory`).
- `.antigravitycli/af195bcc-….json` ist ein getrackter Symlink auf
  `/home/patrick/.gemini/config/projects/`, also ein maschinenlokaler Absolutpfad in der
  Versionierung, der im Arbeitsbaum nicht auflösbar ist.
- `CLAUDE.md` beschreibt unter „Key components" ein `deploy/`-Verzeichnis, das nicht existiert.

Der gravierendste Fall ist Task Master AI. Es ist ein zweites Aufgabensystem neben der
Tickets-Datenbank, vollständig verdrahtet (MCP-Registry-SSOT, `.mcp.json`,
`Taskfile.taskmaster.yml` mit zehn Tasks) — und seine Datei `tasks/tasks.json` behauptet seit dem
2026-07-10, sechs Aufgaben seien offen. Alle sechs sind erledigt:

| Eintrag | Behauptung | Nachweis |
|---|---|---|
| #1 Auth auf `GET /api/admin/coaching/sessions` fehlt | `pending` | `website/src/pages/api/admin/coaching/sessions/index.ts:11` und `:29` prüfen `!session \|\| !isAdmin(session)` und antworten 401 |
| #2 `window.__COACHING_CUSTOMERS__`-Datenleck | `pending` | Symbol kommt in `website/src` nicht mehr vor |
| #3–#6 T001775 (vier Duplikate) | `pending` | Ticket T001775 hat Status `archived` |

Ein unpflegtes Zweitsystem verfällt nicht neutral. Solange es leer ist, ist es harmlos; sobald es
Einträge hat und niemand sie mitpflegt, wird es zur Fehlinformationsquelle. Wer heute
`task taskmaster:list` aufruft, bekommt zwei Sicherheitslücken gemeldet, die nicht existieren.
Die Halbwertszeit betrug hier vier Wochen.

Aufräumen allein genügt nicht. Der Commit `fdcf4f4` vom 2026-06-22 hieß bereits
_„chore: remove drift — vestigial dirs, dead refs"_. Ohne Gate war der Drift nach sieben Wochen
zurück. Dieser Vorgang schreibt die Prüfung, die den Befund erzeugt hat, deshalb als Test fest.

## What

Dies ist **Vorgang A von drei** getrennten Aufräum-Tickets. Die Zerlegung folgt der
Verifizierbarkeit, nicht der Größe: A lässt sich vollständig beweisen, C nicht ohne eigenen
Verifikationsschritt.

| Vorgang | Inhalt | Ticket |
|---|---|---|
| **A** | Tote Dateien und tote Pfad-Referenzen entfernen, Guard einziehen | T002688 (dieser) |
| **B** | 15 `Taskfile.*.yml` nach `taskfiles/` | folgt nach A |
| **C** | Service- und Deploy-Verzeichnisse umstrukturieren | folgt nach B |

### Löschungen

- `NANOS_RESPONSE`, `OPPO` — 0 Byte, keine Referenz
- `.antigravitycli/` — unauflösbarer Symlink auf einen maschinenlokalen Pfad
- `.astro/` in der Repo-Wurzel — generierte Astro-Typen; `tsconfig.json` referenziert sie nicht,
  `.gitignore` kennt nur `website/.astro/`
- `mcp-browser/` — Dockerfile ohne Manifest, ohne Build-Workflow, ohne Task
- Task Master vollständig: `tasks/`, `.taskmaster/`, `Taskfile.taskmaster.yml`, der
  `taskmaster:`-Include in `Taskfile.yml`, der Block in
  `docs/agent-guide/registry/mcp.yaml`, danach `task mcp:sync`

### Referenz-Abräumung

- `scripts/factory/service-registry.sh`: die sechs Einträge ohne Manifest
- `.dockerignore`: acht der vierzehn fehlenden Pfade. **Nicht** entfernt werden
  `!website/.env.example` und `!scripts/knowledge` (Negativ-Muster, deren Ziel fehlen darf),
  `website/.env.*` (Glob) sowie `website/dist`, `mentolder-web/node_modules` und
  `tests/e2e/test-results` — letztere drei sind glob-freie Literale, die zur Laufzeit entstehen
  und deshalb den Marker `# runtime: <erzeugender Schritt>` erhalten, damit der Guard sie
  überspringt und die Begründung neben dem Eintrag steht statt in einer separaten Allowlist
- `CLAUDE.md`: der `deploy/`-Eintrag

### Guard

`tests/spec/repo-hygiene/dead-path-references.bats` mit drei Prüfungen, die die drei tatsächlich
gefundenen Driftquellen abdecken — nicht mehr. Jede prüft Kommando-Ergebnisse statt Quelltext und
trägt einen Positiv-Anker, damit sie bei leerer Kandidatenliste nicht vakuos besteht.

## Non-Goals

Nicht angefasst und ausdrücklich **kein** Löschkandidat:

- `studio-server/` und `rustdesk-installer/` — echter Code mit Deployment-Bezug. Die niedrige
  Referenzzahl heißt „wird selten angefasst", nicht „ist tot".
- `openclaw/` — `Taskfile.openclaw.yml:11` liest `openclaw/.env.example`.
- `claude-code/` — Konfiguration und System-Prompt.
- `apps/whiteboard/` — `apps/` ist eine gelebte App-Registry. Fünf Skripte und ein Validate-Task
  lesen `apps/<name>/app.yaml`, adressiert über die Variable `apps/${appName}/app.yaml`. Eine
  Volltextsuche nach dem Verzeichnisnamen findet diese Referenzen nicht; das Verzeichnis sieht
  dadurch systematisch toter aus, als es ist.
- Sämtliche Verschiebungen — das sind B und C.

_Ticket: T002688_
