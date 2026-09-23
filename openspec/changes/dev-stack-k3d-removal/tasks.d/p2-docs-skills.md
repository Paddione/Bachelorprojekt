## p2 — Docs & Skills

Target files: `docs/dev-stack/README.md`, `.opencode/skills/references/deploy-routing.md`, `.opencode/skills/dev-flow-execute/SKILL.md`

- [ ] **docs/dev-stack/README.md aktualisieren.**
  Veraltete Referenzen auf `task dev:reset`, `dev:cluster:create`, `dev:cluster:status` und den lokalen k3d-Cluster entfernen und durch die Flux-basierte Dev-Umgebung (`workspace-dev`) ersetzen.

- [ ] **.opencode/skills/references/deploy-routing.md anpassen.**
  Die Zeile `full → task dev:deploy` entfernen; stattdessen dokumentieren, dass Deployments nach Merge auf `main` automatisch von Flux reconciliert werden.

- [ ] **.opencode/skills/dev-flow-execute/SKILL.md anpassen.**
  In Schritt 4 die Voraussetzung für `dev:redeploy:*` dokumentieren (CI-Build des `:dev`-Images).
