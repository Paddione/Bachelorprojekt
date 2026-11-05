# p3 — Taskfile Workspace-Tasks bereinigen

Ziel: Nextcloud-bezogene Workspace-Tasks entfernen (idempotente OCC-/Theme-/Setup-Tasks ohne Ziel).

## Vorgehen (`taskfiles/Taskfile.workspace.yml`)

- Tasks `workspace:theme:nextcloud` und Nextcloud-Setup/Hardening-Task (Z. ~53–93,
  `NC_EXEC ... deploy/nextcloud`) entfernen.
- Aufrufer prüfen: `grep -rn "workspace:theme:nextcloud\|<setup-task-name>" taskfiles/ Taskfile.yml
  docs/ scripts/` — alle Referenzen mit entfernen oder auf verbleibende Tasks umbiegen.
- Generische Files-Variablen (`FILES_HOST`-Ableitung) nur entfernen, wenn ungenutzt.

## Verify dieses Partials

`task --list` zeigt keine Nextcloud-Tasks mehr; `grep -rn "nextcloud" taskfiles/` trifft nur
noch begründete Reste (dann p6-Allowlist oder nachziehen).
