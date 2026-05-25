---
name: update-dependencies
description: Systematische Aktualisierung von Paketen und Frameworks: Deprecation-Audit, Major-Bumps und EOL-Check über alle Workspaces hinweg.
category: ops
---

# update-dependencies — Dependency Maintenance

## Wann diese Skill greift

Veraltete Pakete, Sicherheitswarnungen (npm audit/pnpm audit) oder Deprecation-Warnings treten auf und müssen strukturiert bereinigt werden.

---

## Workspaces & Tooling

| Pfad | Manager | Besonderheiten |
|---|---|---|
| `/` (root) | npm | Taskfile tooling |
| `website/` | pnpm | Astro + Svelte |
| `arena-server/` | pnpm | Drizzle + Socket.IO |
| `brett/` | npm | 3D-Board Backend |

---

## Phase 1 — Audit (Outdated & Deprecated)

1. Ermittle veraltete Pakete pro Workspace:
   ```bash
   # Root / brett
   npm outdated --long

   # website / arena-server
   pnpm outdated
   ```

2. Identifiziere Deprecations in der Tiefe:
   ```bash
   npm audit 2>&1 | grep -i deprecat
   ```

---

## Phase 2 — Safe Updates (Patch & Minor)

1. Nutze `npm-check-updates` für kontrollierte Updates:
   ```bash
   npx npm-check-updates --target minor -u && npm install
   ```

2. Führe nach jedem Workspace-Update die entsprechenden Tests aus.

---

## Phase 3 — Major Bumps (Breaking Changes)

Besondere Aufmerksamkeit bei:
- **Astro**: Integrations (`@astrojs/*`) müssen mitziehen.
- **Tailwind**: v4 Config-Migration.
- **Playwright**: Engine-Update erforderlich:
  ```bash
  npx playwright install
  ```

---

## Phase 4 — Verifizierung (Clean Output)

Stelle sicher, dass keine Deprecation-Warnings mehr auftreten:
```bash
npm install 2>&1 | grep -ic deprecat
```

---

## Häufige Fehler & Blockers

| Fehler | Ursache | Lösung |
|---|---|---|
| `npm install` in pnpm workspace | Nutzung des falschen Paketmanagers | `package-lock.json` löschen, `pnpm install` nutzen |
| Type-Errors nach Update | Veraltete Typdefinitionen | `@types/<pkg>` Version prüfen und ebenfalls upgraden |
| Transitive Deprecations | Deprecated dependency in einem Third-Party-Paket | Parent-Paket auf Updates prüfen oder via overrides/resolutions erzwingen |
