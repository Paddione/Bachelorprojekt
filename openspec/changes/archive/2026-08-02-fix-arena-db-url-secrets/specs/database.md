## REMOVED Requirements

### Requirement: Arena DB Health Check Endpoint Returns OK

**Reason**: `arena-server` wurde am 2026-06-27 in PR #2093 (Commit `4c1d107f4`) vollständig
dekommissioniert — Source Code, Manifeste, DB-Schema, Secrets, CI/CD-Job und der zugehörige
E2E-Test `fa-39-arena-db.spec.ts` wurden entfernt. Diese SSOT-Requirement wurde beim
Decommission übersehen und blieb als Spec-Leiche zurück; sie beschreibt einen Endpoint, den
es nicht mehr gibt.

**Migration**: Keine — der beschriebene Endpoint existiert nicht mehr, es gibt keinen
Konsumenten der Requirement mehr.
