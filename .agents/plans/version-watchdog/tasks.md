---
title: version-watchdog — eigener Update-Watchdog (Issue statt Renovate)
ticket_id: none (Bachelorprojekt, repo.tickets none)
domains: [ci, deps, ops]
status: staged
goal: version-watchdog
---

# version-watchdog — Implementation Plan

Spec: `.agents/goals/version-watchdog/GOAL.md` (Dotfiles, Modell: Plan traegt Goal).
Base: `origin/main`, Branch `feature/version-watchdog`, Worktree
`~/.worktrees/Bachelorprojekt-37ac27be/feature/version-watchdog`.
Repo-Profil (`repo.yaml`): `main`, scopes aus `commitlint.config.cjs`,
keine Tickets, Task-Runner `taskfile`, generierte Artefakte `true`.

Entscheidungen (Eigner, 2026-11-01): D0 = **ergaenzen** (context7 wendet npm
weiter automatisch an; Watchdog meldet nur, deckt Images + Actions ab).
Timer **06:30 taeglich** (`Persistent=true`). Issue **`Version-Watchdog:
faellige Updates`**, Label `dependencies`, Body-Update.

Der Watchdog liest `origin/main` (kein Clone, kein Live-Checkout-Drift),
fragt Registries/APIs und pflegt genau ein Issue via Host-`gh`.
Modellfrei, wie `scripts/context7_updater.py` (Muster: Modul-Import in
`tests/py/scripts/test_context7_updater.py` wird uebernommen).

## File Structure

- `scripts/version_watchdog.py` (neu, Haupt-Skript)
- `tests/py/scripts/test_version_watchdog.py` (neu, Unit-Tests im c7-Stil)
- Dotfiles (eigener Commit dort): `.config/systemd/user/version-watchdog.{service,timer}`
- `components/website/src/data/test-inventory.json` (nur-wenn veraendert: Test-Inventory, wie dev-flow-e2e)

## Task 1 — RED: Failing-Test fuer Scan-Kern

- [ ] `tests/py/scripts/test_version_watchdog.py` anlegen: Fixture-Packuments
  (npm-Stil wie c7) plus Registry-/Action-Fixtures; Tests fuer
  `parse_image_ref`, `pick_image_update` (3-Tage-Regel, `age: ?` ohne Datum),
  `parse_action_ref`, `pick_action_update` (SHA-gepinnt bleibt, Tag-Update),
  `render_issue_body` (Marker `<!-- version-watchdog -->`, Abschnitte).
- [ ] `python3 -m pytest tests/py/scripts/test_version_watchdog.py -q` — expected: FAIL
  (Skript fehlt, Collection-Fehler).

Permitted files: `tests/py/scripts/test_version_watchdog.py`

## Task 2 — GREEN: `scripts/version_watchdog.py`

Portiert die c7-Bausteine (Spec-Parse, 3-Tage-Regel, `gh`-Helper, Exit-1-Alarm
fuer Audit), dazu:

- [ ] Image-Scan: `image:`-Refs aus `k3d/`, `prod*/`, `dev-local/` (analog
  `managerFilePatterns`-Baumliste alt: k3d, prod, prod-mentolder,
  prod-korczewski, prod-fleet + dev-local). Registry-Abfrage: Docker Hub
  (`registry.hub.docker.com`), ghcr (`gh api`, Host-Auth), Rest best-effort
  mit `age: ?`. Digest-Vergleich nur wo API-Digest verfuegbar.
- [ ] Action-Scan: `uses: owner/repo@ref` aus `.github/workflows/`; Aufloesung
  via `gh api repos/{repo}/git/matching-refs/tags` + Releases; unpinnt
  (kein SHA) separat listen.
- [ ] npm-Scan read-only: `parse_spec`/`pick_update`-Logik aus c7 wiederverwenden
  (Import, kein Copy-Paste); Ergebnis nur melden, nie anwenden.
- [ ] Issue-Handoff: offenes Issue per Titel+Marker suchen, sonst mit Label
  `dependencies` anlegen; Body idempotent ersetzen (Datum, Run-Link, Abschnitte
  Images/Actions/npm, 0.x-Hinweis wie c7).
- [ ] `--dry-run` gibt das Issue-Body auf stdout aus, schreibt nichts.
- [ ] `python3 -m pytest tests/py/scripts/test_version_watchdog.py -q` — expected: PASS.

Permitted files: `scripts/version_watchdog.py`, `tests/py/scripts/test_version_watchdog.py`

## Task 3 — Timer-Units (Dotfiles) + Install

- [ ] Dotfiles-Worktree: `.config/systemd/user/version-watchdog.service`
  (oneshot, `ExecStart=/usr/bin/python3 %h/Bachelorprojekt/scripts/version_watchdog.py`,
  Muster `context7-updater.service`) + `.timer` (`OnCalendar=*-*-* 06:30:00`,
  `Persistent=true`). Commit dort, FF-Merge nach `master` (kein Push).
- [ ] `systemctl --user daemon-reload && systemctl --user enable --now version-watchdog.timer`;
  `systemctl --user list-timers | grep version-watchdog` — expected: aktiv, naechster Lauf sichtbar.

Permitted files (Dotfiles): `.config/systemd/user/version-watchdog.service`, `.config/systemd/user/version-watchdog.timer`

## Task 4 — Dry-Run, Freshness, Stage

- [ ] `python3 scripts/version_watchdog.py --dry-run` vom Worktree-Root — expected: Exit 0,
  Body mit drei Abschnitten auf stdout, kein Issue geschrieben.
- [ ] `task test:changed` — expected: PASS (bzw. dokumentierter Ersatz).
- [ ] `task freshness:regenerate && git add <artefakte> && task freshness:check` — expected: PASS.
- [ ] `git status --short` zeigt nur gewollte Pfade; Commit
  `chore(deps): add version watchdog (issue instead of renovate)`;
  Push `-u origin feature/version-watchdog`. STOPP, kein PR von hier
  (PR-Erstellung und Merge folgen als naechster Schritt).

Permitted files: `scripts/version_watchdog.py`, `tests/py/scripts/test_version_watchdog.py`, generierte Artefakte laut `git status`
