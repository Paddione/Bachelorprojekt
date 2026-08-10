# Proposal: mishap-bundle-T002506

## Zweck

7 der 10 Mishaps aus dem T002506-Bundle (2026-08-01) beheben — 4 Script-Bugs mit klaren
Root-Causes und 3 Dokumentations-Updates. Die verbleibenden 3 Einträge (M5: Push-Event-Verlust,
M8: Runner-down, M9: Phantom-Konflikt #3574) sind bereits anderweitig getrackt und werden nicht
in diesem Change gefixt.

## Scope

### Script-Fixes (4)

| Mishap | Datei | Defekt | Fix |
|--------|-------|--------|-----|
| M2 | `scripts/agent-lock-merged.sh` | `git log --grep="$TICKET_ID"` findet jede Erwähnung im Commit-Body (z. B. `[[T002494]]` im Fließtext von `goals.md`). Ein anderer Commit wird als Merger-Nachweis für T002494 gemeldet → dev-flow bricht ab. | GREP auf Commits mit `[TICKET_ID]` im Betreff einschränken (PR-Konvention); Body-Scan entfernen. |
| M7 | `scripts/devflow-post-merge-deploy.sh` | Zeile 14: `--merges` schließt Squash-Merge-Commits aus (haben genau einen Parent). Findet nie einen "Merge-Commit". | `--merges` ersatzlos streichen. Der `--grep`-Match auf `[TICKET_ID]` identifiziert den Squash-Commit bereits eindeutig. |
| M3 | `scripts/agent-collision.sh` | `--branch`-Modus meldet neu angelegte Dateien als COLLISION gegen einen fremden Worktree, obwohl diese dort nicht existieren. Zusätzlich Lock↔Worktree-Zuordnung inkorrekt. | Vor dem Melden: Datei-Existenz im Peer-Worktree prüfen (`[ -f "$wt/$file" ]`), ggf. Lock-Metadaten korrigieren. |
| M6 | `scripts/plan-lint.sh` | W3/G1: Die Abschnittsgrenze `^##[[:space:]]` matcht H2 (`## Task`), aber nicht H3 (`### Task`). Tasks unter H3 werden komplett aus dem W3-Prüfbereich ausgeblendet; G1 zählt Dateien falsch. | Grenze auf `^#{2,3}[[:space:]]` erweitern, oder explizit `^##[[:space:]]` UND `^###[[:space:]]+Task ` als Grenze erkennen. |

### Dokumentation (3)

| Mishap | Datei | Defekt | Fix |
|--------|-------|--------|-----|
| M1 | `.opencode/skills/opencode-flow-execute/SKILL.md` | `git fetch origin main:main` funktioniert nur, wenn main NICHT im Hauptcheckout ausgecheckt ist. Die Skill empfiehlt es ohne Fallunterscheidung. | Fallunterscheidung ergänzen: "Im Worktree: `fetch origin main:main`; im Hauptcheckout: `git pull --ff-only`". |
| M4 | `CLAUDE.md` oder `docs/CLAUDE.local.md` | `gitleaks` fehlt auf der Entwicklungsmaschine → Pre-Commit-Secret-Scan wird stillschweigend übersprungen. | Setup-Hinweis in die Onboarding-Doku aufnehmen, damit die Lücke eine bewusste Entscheidung ist. |
| M10 | `CLAUDE.md` (Rule 7), `docs/...` | T002459 wurde auf done/shipped gesetzt, bevor P5.5-Deliverable auf main war. Closure ohne Deliverable-Check. | Closure-Konvention um Deliverable-Check ergänzen: vor `done` prüfen, ob alle im Plan deklarierten Dateien auf main existieren. |

### Nicht in diesem Change (anderweitig getrackt)

| Mishap | Warum nicht hier |
|--------|-------------------|
| M5 (Push-Events intermittierend) | Getrackt in T002486 (main-CI rot) — Teil der 15 roten Gates |
| M8 (fleet-gpu Runner down) | Getrackt in T002492-M8 (infra/ci-runner) — benötigt Infra-Zugriff |
| M9 (#3574 Phantom-Konflikt) | Getrackt auf PR #3574 / T002503 — Bearbeiter-Anleitung liegt per agent-msg vor |

## Test-Ansatz

Jeder Script-Fix bekommt einen RED-Test in `tests/spec/mishap-bundle-T002506.bats`:
- **M2**: `check-merged` mit einer Ticket-ID, die nur im Commit-Body eines anderen Merges vorkommt → erwartet rc=0 (ID NOT found), aktuell rc=1 (false positive)
- **M7**: `post-merge-deploy` mit einem gültigen Squash-Merge-Commit (existiert auf main mit einem Parent) → erwartet `MERGE_COMMIT` nicht leer, aktuell leer wegen `--merges`
- **M3**: `agent-collision --branch` mit neu angelegter Datei gegen einen leeren Worktree → erwartet 0 COLLISION-Warnungen, aktuell false positive
- **M6**: `plan-lint` auf einem Plan mit `### Task`-Headings → erwartet PASS für W3/G1, aktuell false negatives bei W3
