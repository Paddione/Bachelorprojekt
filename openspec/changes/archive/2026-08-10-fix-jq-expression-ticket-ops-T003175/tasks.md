# Tasks: Fix jq expression in ticket-ops-procedures.md

- [x] Zeile 79: `jq -r '.result[]'` → `jq -r '.[0].result'` mit Erklärung des doppelten Parse-Schritts
- [ ] Verifikation: `task freshness:check` + manuelle Sichtung der geänderten Zeile
