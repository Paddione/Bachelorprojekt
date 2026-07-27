# git-workflow — Nachschlagewerk

Referenz zu [`git-workflow`](../git-workflow/SKILL.md). Der Skill-Body führt den Ablauf und alle
Guards; hier stehen das Commit-Format im Detail, die Schritt-Übersicht und die Fehlertabelle.

## Conventional Commits — Pflichtformat

```
<type>(<scope>): <subject> [<TICKET_EXT_ID>]
```

- **Header ≤ 100 Zeichen** (commitlint-Regel)
- `type`: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
- `scope`: einer von 14 (T002328) — sechs Domänen `website`, `infra`, `db`, `security`, `ops`,
  `test` (deckungsgleich mit den Agent-Rollen) plus `plans`, `factory`, `agents`, `ci`,
  `scripts`, `docs`, `mcp`, `deps`. Ein konsolidierter Altname wie `k3d` oder `pocket-id`
  wird abgelehnt, die Meldung nennt aber das Ziel (`infra` bzw. `security`).
- `TICKET_EXT_ID`: z. B. `T001026` — **immer anhängen** wenn ein Ticket existiert
- Body-Zeilen ebenfalls < 100 Zeichen

Beispiele:

```
feat(website): add React mentolder rebuild [T001026]
fix(security): rotate stale oauth2-proxy secret [T000950]
chore(infra): bump TEI embed port 9081 [T000978]
```

### Neuer Scope nötig?

Bevor ein noch nicht registrierter Scope (z. B. ein neuer Goal-Code wie `sec06`) in einer
Commit-Message oder einem PR-Titel verwendet wird, zuerst
`bash scripts/register-scope.sh <scope>` ausführen und die geänderte `commitlint.config.cjs`
mitcommitten — sonst schlägt das `commit-lint`-Gate (und `preflight-pr-scope.sh`) mit
"unknown scope" fehl. `commitlint.config.cjs` ist die einzige Quelle; `pr-auto-title.yml` und
`preflight-pr-scope.sh` laden daraus dynamisch (T001364, T002328). `ci.yml` erzwingt **keine**
Scopes — es hält das selbst fest ("Scopes are NOT enforced here"); die Durchsetzung passiert
über `validate-commit-msg.sh range` im commit-lint-Job.

Die erlaubte Liste vor dem ersten Commit ziehen: `bash scripts/validate-commit-msg.sh scopes`.

### PR-Body-Vorlage

```bash
gh pr create \
  --title "<type>(<scope>): <subject> [<TICKET_EXT_ID>]" \
  --body "$(cat <<'EOF'
## Summary
- <was wurde geändert>
- <warum>

## Test Plan
- [ ] <manuell überprüft / CI grün>

🤖 [T<TICKET_EXT_ID>]
EOF
)"
```

### Titel nachträglich editieren (REST-Fallback)

`gh pr edit --title` scheitert gelegentlich an einer Projects-Classic-GraphQL-Deprecation.
Stattdessen:

```bash
gh api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
```

## Quick-Reference

| Schritt | Was | Wann |
|---------|-----|------|
| 0 | `git pull --rebase` | Immer als erstes |
| 1 | `task freshness:regenerate` | Wenn Code-Dateien geändert wurden |
| 2 | Conventional Commit ≤100 Zeichen + Ticket-ID | Jeder Commit |
| 2 | Commit-Verifikation (`HEAD_SHA != BASE_SHA`) | Nach jedem Commit in Worktrees |
| 3 | `git push -u origin <branch>` | Einmalig, danach plain `git push` |
| 4 | `bash scripts/preflight-pr-scope.sh` + `gh pr create` | Einmal pro PR |
| 5 | CI Fix Loop | Bis alle Required Checks grün |
| 6 | `gh pr merge --auto --squash --delete-branch` | Wenn CI grün |
| 7 | `git worktree remove` + `agent-lock release` | Nur bei Worktree-Arbeit |

## Häufige Fehler

| Fehler | Diagnose | Fix |
|--------|----------|-----|
| Commit landet nicht (git-crypt) | `git rev-parse HEAD == BASE_SHA` | `git status`, dann erneut committen |
| CI startet nie | `gh pr view <n> --json mergeStateStatus` → `CONFLICTING` | `git rebase origin/main` |
| Stale artifact in CI | `task freshness:check` lokal rot | `task freshness:regenerate && git add && git commit` |
| S1 Ratchet über Budget | `task freshness:check` schlägt fehl | Datei wirklich verkleinern |
| PR-Scope invalid | `preflight-pr-scope.sh` Exit 1 | Scope korrigieren, neu prüfen |
| Falscher Cluster gedeployt | `ENV=` vergessen gesetzt | Immer `ENV=mentolder` / `ENV=korczewski` explizit |

## CI Watch Loop — leere gh-Antworten als Retry, nicht als Zustandswechsel [T002339]

Ein `gh pr view --json state -q .state` in einer CI-Watch-Schleife kann bei
Netzwerkfehlern ("error connecting to api.github.com") einen LEEREN String liefern.
Wird dieser gegen `"OPEN"` verglichen und als ungleich befunden, steigt die Schleife
mit `STATE=` aus — das sieht aus wie ein abgeschlossener Zustandswechsel, obwohl der
PR unverändert offen ist. Dasselbe Muster wie das "grün bei 0 Checks"-Falschpositiv:
das AUSBLEIBEN einer Antwort wird als Aussage interpretiert.

**Regel:** Jeder `gh`-Aufruf in einer Warteschleife muss gegen Transportfehler
abgesichert werden:

```bash
STATE=$(gh pr view --json state -q '.state' 2>/dev/null) || { sleep 30; continue; }
# Leerer String ist kein Zustandswechsel — weiterpollern
[ -z "$STATE" ] && { sleep 30; continue; }
# Erst ein nicht-leerer Wert ungleich "OPEN" beendet die Schleife
[ "$STATE" != "OPEN" ] && break
```

Dieselbe Logik gilt für `gh run watch` und andere Warteschleifen: das Ausbleiben
einer Antwort ist kein Signal, die Schleife zu beenden.

## Freshness-Auto-Regen-Race [T001395]

Bleibt ein PR über einen geplanten Freshness-Auto-Regen-Zyklus offen, committet der Scheduler
eigenständig Änderungen an generierten Artefakten (`docs/code-quality/repo-index.json` u. ä.) auf
`main` — der PR kippt dann auf `CONFLICTING`, ohne dass ein Mensch etwas geändert hat (beobachtet
in T001378). Das ist kein echter Merge-Konflikt: PRs zügig mergen minimiert das Risiko. Tritt es
trotzdem auf, den Rebase-Schritt um `task freshness:regenerate` ergänzen, **bevor** gepusht wird —
sonst rebased man gegen einen bereits wieder veralteten Artefaktstand:

```bash
git fetch origin main && git rebase origin/main && task freshness:regenerate \
  && git add <regenerierte Dateien> && git rebase --continue && git push --force-with-lease
```

Details: [dev-flow-gotchas T001395](dev-flow-gotchas.md).
