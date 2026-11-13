# Goal: Fällige Updates aus Version-Watchdog #7257 nachziehen (deps-7257-nachziehen)

## Objective

Die in [Paddione/Bachelorprojekt#7257](https://github.com/Paddione/Bachelorprojekt/issues/7257)
(Stand 2026-11-09) als fällig gemeldeten npm-Updates auf die dort genannten
Zielstände anheben — abzüglich dessen, was der gemergte
[PR #7256](https://github.com/Paddione/Bachelorprojekt/pull/7256)
(`c1a19dc`, Context7-Updates 2026-11-08) bereits erledigt hat.

## Erfolgskriterien

1. Die nach dem #7256-Merge verbleibenden Deltas stehen auf den
   #7257-Zielständen (package.json + Lockfiles): VideoVault
   `@tanstack/react-query` → ^5.106.1, `react-resizable-panels` (bereits
   ^4.18.1, verifizieren); studio-server + website `openai` → ^7.52.0;
   website `@anthropic-ai/sdk` → ^1.6.0; VideoVault `@hookform/resolvers`
   → ^7.0.3, `lucide-react` → ^1.69.0; website `@astrojs/node` → ^11.1.11,
   `@astrojs/react` → ^7.1.4, `astro` → ^7.4.7, `playwright` → ^1.64.1 → ^1.65.0.
2. Die Repo-Suites der drei betroffenen Workspaces (VideoVault, studio-server,
   website: Tests + Typecheck gemäß `Taskfile.yml`) sind grün.
3. Kein Paket aus der Zu-jung-Liste von #7257 wurde vorgezogen; der
   Watchdog-Bericht danach zeigt null fällige Zeilen für diese Workspaces
   (ausgenommen neue Fälligkeiten durch Zeitablauf).
4. Der PR referenziert `Closes #7257` (ganz oder Rest-Delta) und baut per
   Rebase auf #7256 auf — kein Doppel-Update.

## Nicht-Ziele

- Keine Image- und keine GitHub-Actions-Updates (in #7257 keine fällig).
- Keine Pakete aus der Zu-jung-Liste (< 3 Tage) vorziehen.
- Keine manuellen Versionssprünge über die #7257-Zielstände hinaus.
- Keine Änderung am Watchdog-Mechanismus selbst (dafür: Goal `version-watchdog`).

## Abhängigkeiten

- `Paddione/Bachelorprojekt#7256` (gemergt als `c1a19dc`) — Basis, Rebase-Ziel.
- `Paddione/Bachelorprojekt#7257` — Quelle der Zielstände, zu schließen.
- Repo-Profil (`repo.yaml`): `main`, keine Tickets, Task-Runner `taskfile`.

## plan_refs

- (kein Plan — per `dev-flow-plan`-Pfadwahl als Chore direkt via
  `dev-flow-chore` umgesetzt, PR #7259)
