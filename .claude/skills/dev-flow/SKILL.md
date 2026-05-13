---
name: dev-flow
description: Verwende immer wenn jemand in diesem Repo eine neue Funktion hinzufügen, einen Bug beheben oder eine Änderung machen will. Definiert unseren gemeinsamen Entwicklungsablauf — Pfade für Feature/Fix/Chore, Worktree-Isolation, Conventional-Commit-PRs, Post-Merge-Deploy auf beide Prod-Cluster.
---

# dev-flow — Unser gemeinsamer Entwicklungsablauf

## Wann diese Skill greift

Bei jeder Anfrage in diesem Repo, die etwas verändern will: neue Funktion, Bug fixen, Doku updaten, Dependencies bumpen, was auch immer.

**Sage zu Beginn:** "Ich nutze die dev-flow Skill für unseren Standard-Ablauf."

## Schritt 0: Pfad bestimmen

Lies die Anfrage und schlage einen der drei Pfade vor. Bestätigung beim User einholen, BEVOR du weitermachst.

| Pfad | Wann |
|---|---|
| **feature** | Neues Verhalten, neuer Endpunkt, neue UI-Sektion, neuer Task — alles was Nutzer bemerken |
| **fix** | Etwas ist kaputt; Output/Verhalten passt nicht zur Erwartung. **Erfordert ein BR-* Ticket.** |
| **chore** | Keine Verhaltensänderung für Nutzer — Dependency-Bumps, Refactors, Doku/Kommentar-Updates, Config/CI-Tweaks |

Sage z.B.: "Das klingt nach einem **fix** — wir reparieren ein bestehendes Verhalten. Passt das? Hast du eine BR-* Ticket-ID?"

## Schritt 1: Worktree anlegen

Rufe `superpowers:using-git-worktrees` auf. Branch-Name folgt dem Schema `<pfad>/<kurzer-slug>`:

- `feature/solo-replay`
- `fix/sse-connection-header`
- `chore/bump-astro`

Slug ist kurz und beschreibend. KEIN BR-* in den Branchnamen — das gehört in die PR-Beschreibung.

## Schritt 2: Den passenden Pfad ausführen

### Feature-Pfad

1. **Brainstorming.** Rufe `superpowers:brainstorming` auf. Ergibt eine Spec in `docs/superpowers/specs/`.
   - Visual-Companion-Artefakte (HTML-Mockups, Diagramme, Vergleichsbilder) werden vom lokalen brainstorming-Server ausgeliefert. Damit Patrick sie im Browser durchklicken kann statt `xdg-open` lokal zu fahren, siehe Sektion **Visual Companion via brainstorm.mentolder.de** unten.
2. **Plan.** Rufe `superpowers:writing-plans` auf. Ergibt einen Plan in `docs/superpowers/plans/`.
3. **Frontmatter-Hook.** Führe aus: `bash scripts/plan-frontmatter-hook.sh <plan-datei>` (Pflicht laut CLAUDE.md).
4. **Implementation.** Bevorzugt: `superpowers:subagent-driven-development` (parallele Agents, schnell). Alternative: `superpowers:executing-plans` (sequenziell).
   - Backend / Skripte / k8s-Logik: TDD via `superpowers:test-driven-development`.
   - UI-Arbeit: `frontend-design` Skill + Playwright Smoke Tests.
5. **Lokale Verifikation.** Führe in dieser Reihenfolge aus:

   ```bash
   task workspace:validate
   ./tests/runner.sh local <FA-XX oder SA-XX oder NFA-XX>   # falls relevant
   task test:all
   ```

6. **PR.** Rufe `commit-commands:commit-push-pr` auf.
   - Titel: `feat(<scope>): <kurze-beschreibung>`
   - Body: siehe Sektion **PR-Konventionen** unten.
7. **Auto-Merge** wenn CI grün ist.
8. **Post-Merge.** Folge der Sektion **Post-Merge Deploy** unten.

### Fix-Pfad

1. **BR-* Ticket finden.** Frage den User nach der Ticket-ID. Wenn keine existiert: verweise auf `https://web.mentolder.de/admin/bugs` zum Anlegen. **Ohne Ticket geht der Fix-Pfad nicht weiter.**
2. **Bug reproduzieren mit failing Test** (red-green-refactor — Pflicht). Schreibe einen Test, der den Bug beweist:

   ```bash
   ./tests/runner.sh local <neue-test-id>
   # Erwartet: FAIL
   ```

3. **Plan.** Bei nicht-trivialen Fixes: `superpowers:writing-plans`. Bei Einzeilern: kurze Inline-Begründung reicht.
4. **Fix implementieren** bis der Test grün ist.
5. **Verifikation:**

   ```bash
   task workspace:validate     # falls Manifests betroffen
   ./tests/runner.sh local <test-id>
   task test:all
   ```

6. **PR.** Titel: `fix(<scope>): <kurze-beschreibung>`. Body MUSS `Closes BR-YYYYMMDD-xxxx` enthalten — sonst Push blockieren und nochmal nachfragen.
7. **Auto-Merge** wenn CI grün ist.
8. **Post-Merge.** Folge der Sektion **Post-Merge Deploy** unten.

### Chore-Pfad

1. **Chore in einem Satz beschreiben.** Beispiele: "Astro auf 5.x bumpen", "Variable `foo` zu `bar` umbenennen", "Tippfehler in Doku korrigieren".
2. **Änderung machen.** Kein Plan, kein Spec, kein TDD nötig.
3. **Verifikation:**

   ```bash
   task test:all                # MUSS grün sein
   task workspace:validate      # falls Manifests betroffen
   task website:dev             # falls website/src/ betroffen — Smoke-Test
   ```

4. **PR.** Titel: `chore(<scope>): <kurze-beschreibung>`. Body: kurzes `## Summary` (1-2 Bullets) + `## Test plan` (was du gelaufen bist).
5. **Auto-Merge** wenn CI grün ist.
6. **Post-Merge.** Folge der Sektion **Post-Merge Deploy** unten.

## Visual Companion via brainstorm.mentolder.de

Der `superpowers:brainstorming`-Server bindet per Default `127.0.0.1:<random-port>` und schreibt Klicks aus dem Browser über WebSocket nach `$STATE_DIR/events`. Damit der Klick-Loop auch im Browser des Users funktioniert (und nicht nur auf `localhost`), gibt es eine sish-Reverse-Tunnel-Bridge auf dem mentolder-Cluster.

### Setup einmalig

```bash
task brainstorm:firewall:open       # ufw 32223/tcp auf gekko-hetzner-2 öffnen
# Eigenen Public-Key in environments/.secrets/mentolder.yaml unter
# DEV_SISH_AUTHORIZED_KEYS ergänzen (gleicher Key-Pool wie dev-tunnel).
task env:seal ENV=mentolder
task brainstorm:_materialise-keys   # ConfigMap im Cluster aktualisieren + sish rollen
```

### Pro Session

```bash
# Terminal A (oder Hintergrund): brainstorming-Server zeigt Port im JSON-Output.
# Terminal B: Tunnel hochziehen — terminal MUSS offen bleiben für die Session.
task brainstorm:publish -- <localport>
# → "Publishing localhost:<port> as https://brainstorm.mentolder.de — leave this terminal open."
```

Der Browser zeigt dann den Inhalt von `$SCREEN_DIR/*.html` unter `https://brainstorm.mentolder.de`. Klicks gehen per `wss://` durch den Tunnel zurück zum lokalen Server und landen in `$STATE_DIR/events`, das Claude beim nächsten Turn liest.

### `ws://`→`wss://` Auto-Patch

Der upstream-`helper.js` aus dem superpowers-Plugin nutzt `ws://`, was Browser über HTTPS als Mixed Content blocken. `scripts/superpowers-helper-patch.sh` patcht das idempotent zu protocol-aware `wss://`. Ein SessionStart-Hook in `.claude/settings.json` reappliedt nach jeder Claude-Session, falls ein superpowers-Sync den Patch überschreibt. Manuell bei Bedarf:

```bash
bash scripts/superpowers-helper-patch.sh           # apply
bash scripts/superpowers-helper-patch.sh --check   # exit 1 if any helper.js still unpatched
```

### Diagnose

```bash
task brainstorm:status   # Pod-Status + curl gegen brainstorm.mentolder.de
```

`502 Bad Gateway` ohne aktiven Tunnel ist erwartet (sish hat kein Backend). `200` mit Waiting-Page = Tunnel steht.

## Post-Merge Deploy

Nach dem Merge auf `main`: Schau dir die geänderten Dateien an (`gh pr view <pr> --json files` oder `git diff` auf den Merge-Commit) und führe den passenden Task aus:

| Geänderte Dateien | Task | Verify |
|---|---|---|
| `website/src/**`, `website/public/**`, `website/package*.json` | `task feature:website` | Live-Check `https://web.mentolder.de` + `https://web.korczewski.de` |
| `brett/**` | `task feature:brett` | `https://brett.mentolder.de` + `https://brett.korczewski.de` |
| `k3d/docs-content/**` | `task docs:deploy` | `https://docs.mentolder.de` + `https://docs.korczewski.de` |
| `k3d/livekit*.yaml` | `task feature:livekit` | `task livekit:status ENV=mentolder` + `ENV=korczewski` |
| `k3d/**`, `prod/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/sealed-secrets/**` | `task feature:deploy` | `task workspace:verify:all-prods` + `task health` |
| Nur `docs/`, `*.md`, `CLAUDE.md`, `tests/`, `.github/`, `Taskfile*.yml`, `scripts/`, `.claude/` | KEIN Deploy | Keine Verify |

Wenn mehrere Kategorien matchen, in dieser Reihenfolge ausführen: workspace → website → brett → livekit → docs.

**Wichtig bei Verify:**

- Bei Copy/Visual-Änderungen: Screenshot via Playwright machen.
- Bei funktionalen Änderungen: relevante `./tests/runner.sh local <FA-XX>` gegen die Live-URL laufen lassen.
- **Wenn Verify scheitert: KEINEN Fix auf `main` versuchen.** Sofort einen neuen `fix/<slug>` Branch via Fix-Pfad öffnen und Patrick benachrichtigen.

## PR-Konventionen

### Titel-Format

`<type>(<scope>): <imperative summary>`

- `<type>` ∈ {`feat`, `fix`, `chore`} — passt zum gewählten Pfad
- `<scope>` ist kurz, z.B. `website`, `arena`, `infra`, `db`, `ci`, `deps`, `docs`
- `<summary>` ist Imperativ Präsens, ohne Punkt am Ende, erstes Wort klein

Beispiele:

- `feat(arena): add solo replay button`
- `fix(sse): drop forbidden Connection header from SSE responses`
- `chore(deps): bump astro to 5.4`

### Body-Template

```markdown
## Summary
- <warum diese Änderung existiert, 1-3 Bullets>

## Test plan
- [x] task test:all
- [x] task workspace:validate          # wenn Manifests geändert
- [x] ./tests/runner.sh local FA-XX    # falls relevant
- [x] manueller Check auf web.mentolder.de  # falls user-sichtbar

Closes BR-YYYYMMDD-xxxx   <!-- nur Fix-Pfad — sonst weglassen -->

Co-Authored-By: <model-name>
```

## Failure-Handling

- **CI rot vor Merge:** Diagnose, Fix auf demselben Branch, neu pushen. Keinen zweiten PR aufmachen.
- **Deploy scheitert post-merge:** Loggen, Patrick benachrichtigen, Cluster wie ist lassen. Kein Auto-Rollback.
- **Verify scheitert post-merge:** Neuen `fix/<slug>` Branch via Fix-Pfad. Behandle die Regression als Bug.

## Agent-Routing

Jeder Pfad delegiert Spezialarbeit an die passenden Sub-Agents (siehe CLAUDE.md Agent-Routing-Tabelle):

- DB/Schema/Queries → `bachelorprojekt-db`
- Manifests/Kustomize/Taskfile → `bachelorprojekt-infra`
- Live-Cluster-Operations (Pods, Logs, Restarts) → `bachelorprojekt-ops`
- Tests schreiben/debuggen → `bachelorprojekt-test`
- Astro/Svelte/UI → `bachelorprojekt-website`
- SealedSecrets/Keycloak/OIDC → `bachelorprojekt-security`

**Pflicht vor jedem Sub-Agent-Dispatch:** `bash scripts/plan-context.sh <role>` ausführen und die Ausgabe in `<active-plans>` Tags an den Prompt voranstellen (Details in CLAUDE.md).
