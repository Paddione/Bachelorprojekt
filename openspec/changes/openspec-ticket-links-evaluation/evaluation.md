# Bewertungsprotokoll: 41 `.ticket`-lose OpenSpec-Changes (T002573)

_Erstellt 2026-08-03. Deterministisches Bewertungsverfahren aus `tasks.md` (Index) angewendet._

**Legende:**
- **archiviert** — referenzierte Tickets alle terminal (`done`/`archived`), Change per `openspec.sh archive` abgeschlossen.
- **offen** — kein Ticket-Bezug im Inhalt, Abschluss maschinell nicht belegbar → mit begruendetem Vermerk belassen.
- **offen (Rest-Vermerk)** — als `abgeschlossen` klassifiziert (Tickets terminal), aber nicht in diesem PR archiviert (erfordert `--create-new`); Archivierung als Folgearbeit im Rest-Vermerk unten.
- **duplikat-entfernt** — obsoletes Duplikat mit Archiv-Gegenstueck, Live-Verzeichnis per `git rm` entfernt (kein Doppel-Archiv).

## Bewertung je Change

| # | Change | Ergebnis | Begruendung |
|---|--------|----------|-------------|
| 1 | admin-fundament-konsolidierung | offen (Rest-Vermerk) | T001784–T001789 (alle done/archived) — erfordert `--create-new` |
| 2 | brain-ingest-pruefen | duplikat-entfernt | Archiv-Gegenstueck `archive/brain-ingest-pruefen` existiert (Legacy-Layout) |
| 3 | coaching-studio-restore-or-remove | offen (Rest-Vermerk) | T001784, T001792 (archived) — erfordert `--create-new` |
| 4 | e2e-hydration-timeout | offen (Rest-Vermerk) | T001748, T001785 (archived) — erfordert `--create-new` |
| 5 | fix-e2e-auth-systemtest | offen (Rest-Vermerk) | T002103 (archived) — erfordert `--create-new` |
| 6 | fix-e2e-kontaktformular | offen (Rest-Vermerk) | T001956 (done) — erfordert `--create-new` |
| 7 | fix-e2e-test-ticket-generation | offen | keine Ticket-Referenz im Inhalt, Abschluss nicht belegbar |
| 8 | fix-fa-sf-20-pipeline-contract | archiviert | T001812, T002393, T002421 (alle done) |
| 9 | fix-llm-server-watchdog | archiviert | T002276, T002335 (done) |
| 10 | fix-mishap-subagent-ticket-mcp | offen | keine Ticket-Referenz im Inhalt, Abschluss nicht belegbar |
| 11 | fix-secrets-diff | offen (Rest-Vermerk) | T001610 (archived), T001961 (done) — erfordert `--create-new` |
| 12 | fix-studio-server-envsubst | offen (Rest-Vermerk) | T001799 (done) — erfordert `--create-new` |
| 13 | fix-t001935-brett-admin-session | offen | keine Ticket-Referenz im Inhalt, Abschluss nicht belegbar |
| 14 | fix-t001936-mishap-bundle | offen | keine Ticket-Referenz im Inhalt, Abschluss nicht belegbar |
| 15 | fix-t001939-portal-sidekick-hydration | offen | keine Ticket-Referenz im Inhalt, Abschluss nicht belegbar |
| 16 | fix-t001940-coaching-generate-502 | offen | keine Ticket-Referenz im Inhalt, Abschluss nicht belegbar |
| 17 | fix-t001948-unused-indexes | offen (Rest-Vermerk) | T001928, T001948 (done) — erfordert `--create-new` (capability.md) |
| 18 | fix-t001949-container-cves | offen (Rest-Vermerk) | T001949 (done) — erfordert `--create-new` (capability.md) |
| 19 | fix-t001951-brain-ingest | offen (Rest-Vermerk) | T001912, T001951 (done) — erfordert `--create-new` (capability.md) |
| 20 | fix-t001953-mishap-bundle | offen (Rest-Vermerk) | T001362 (archived), T001953 (done) — erfordert `--create-new` |
| 21 | k3d-dev-llm-bridge | offen | T001853, T002102, T002109 (alle done) — Delta zielt auf `LLM-PIPELINE-001`, das nie in `llm-pipeline.md`-SSOT existierte; Archivierung fail-closed (MODIFIED-Ziel fehlt) |
| 22 | mishap-10er-bundle | archiviert | T000123 (archived), T002452, T002454, T002469 (done) |
| 23 | mishap-agent-lock | archiviert | T002454 (done) |
| 24 | mishap-bundle-T002506 | offen (Rest-Vermerk) | T001092, T002448, T002459, T002486, T002492–T002494, T002501, T002503, T002506 (alle done/archived) — erfordert `--create-new` |
| 25 | mishap-bundle-dev-flow | offen (Rest-Vermerk) | T001304 (archived) — erfordert `--create-new` |
| 26 | mishap-devflow-queue-T002272 | offen | T001899, T002255, T002267, T002269, T002271, T002272 (alle done) — Delta zielt auf `dev-flow-execute activates auto-merge...`, das nie in `ci-cd.md`-SSOT existierte; Archivierung fail-closed (MODIFIED-Ziel fehlt) |
| 27 | mishap-t001969 | offen (Rest-Vermerk) | T001963, T001969 (done) — erfordert `--create-new` |
| 28 | mishap-t001972 | offen (Rest-Vermerk) | T001880, T001961, T001972 (done) — erfordert `--create-new` |
| 29 | mishap-t002408 | archiviert | T002286, T002370, T002408 (done) |
| 30 | mishap-t002424 | offen (Rest-Vermerk) | T000001, T002382, T002407, T002422, T002424 (alle done) — erfordert `--create-new` |
| 31 | mishap-test-repo-hygiene-T002347 | archiviert | T000001 (done), T001444 (archived) |
| 32 | release-notes-erden | duplikat-entfernt | Archiv-Gegenstueck `archive/release-notes-erden` existiert (Legacy-Layout) |
| 33 | remove-keycloak-sidecar | offen (Rest-Vermerk) | T002311 (done) — erfordert `--create-new` |
| 34 | renovate-app-token | archiviert | T000898 (archived), T002161 (done) |
| 35 | scout-llm-fallback-erden | offen (Rest-Vermerk) | T002397, T002400, T002401, T002404 (alle done) — erfordert `--create-new` |
| 36 | scout-prediction-quality | archiviert | T002003, T002241 (done) |
| 37 | sdlc-cockpit-design | archiviert | T002356, T002416, T002458–T002468 (alle done) |
| 38 | sdlc-cockpit-k2-daemon | archiviert | T000123 (archived), T002356, T002458, T002460, T002461 (done) |
| 39 | spec-bats-admin-ui | offen (Rest-Vermerk) | T002009 (done) — erfordert `--create-new` |
| 40 | unpinned-latest-images | offen (Rest-Vermerk) | T001790 (done) — erfordert `--create-new` |
| 41 | wakeup-dispatcher-bridge-wiring | archiviert | T001845 (done) |

## Zusammenfassung

- **archiviert:** 11 (in diesem PR) — `fix-fa-sf-20-pipeline-contract`, `fix-llm-server-watchdog`, `mishap-10er-bundle`, `mishap-agent-lock`, `mishap-t002408`, `mishap-test-repo-hygiene-T002347`, `renovate-app-token`, `scout-prediction-quality`, `sdlc-cockpit-design`, `sdlc-cockpit-k2-daemon`, `wakeup-dispatcher-bridge-wiring`
- **offen (mit Vermerk belassen):** 8 — `fix-e2e-test-ticket-generation`, `fix-mishap-subagent-ticket-mcp`, `fix-t001935-brett-admin-session`, `fix-t001936-mishap-bundle`, `fix-t001939-portal-sidekick-hydration`, `fix-t001940-coaching-generate-502` (keine Ticket-Referenz), `k3d-dev-llm-bridge`, `mishap-devflow-queue-T002272` (Delta zielt auf nie existierendes SSOT-Requirement)
- **offen (Rest-Vermerk):** 20 — als `abgeschlossen` klassifiziert, erfordern `--create-new`, Archivierung als Folgearbeit (Liste unten)
- **obsoletes Duplikat entfernt:** 2 — `brain-ingest-pruefen`, `release-notes-erden`

Alle referenzierten Tickets (87 eindeutige) sind `done` oder `archived` — reiner Vollzugs-Rueckstau, keine offene Arbeit.

## Rest-Vermerk (nicht in diesem PR archiviert)

Die folgenden 20 Changes sind als `abgeschlossen` klassifiziert (referenzierte Tickets alle terminal),
wurden aber **nicht** in diesem PR archiviert, weil sie `--create-new` erfordern (Ziel-SSOT existiert
nicht) und die Archivierung den Scope dieses Bewertungsverfahrens-PRs sprengen wuerde. Sie sind als
Folgearbeit zu archivieren (jeweils `bash scripts/openspec.sh archive <slug> --create-new`):

`admin-fundament-konsolidierung`, `coaching-studio-restore-or-remove`, `e2e-hydration-timeout`,
`fix-e2e-auth-systemtest`, `fix-e2e-kontaktformular`, `fix-secrets-diff`, `fix-studio-server-envsubst`,
`fix-t001948-unused-indexes`, `fix-t001949-container-cves`, `fix-t001951-brain-ingest`,
`fix-t001953-mishap-bundle`, `mishap-bundle-T002506`, `mishap-bundle-dev-flow`, `mishap-t001969`,
`mishap-t001972`, `mishap-t002424`, `remove-keycloak-sidecar`, `scout-llm-fallback-erden`,
`spec-bats-admin-ui`, `unpinned-latest-images`

Alle 20 haben `### Requirement:`-Blöcke in ihren Deltas (Voraussetzung fuer `--create-new` erfuellt)
und keiner matcht das `t[0-9]{6}`-Verweigerungsmuster in `openspec-merge.mjs` (Slugs beginnen mit
`mishap-`/`fix-`/`admin-`/`e2e-`/`coaching-`/`remove-`/`scout-`/`spec-`/`unpinned-`).
