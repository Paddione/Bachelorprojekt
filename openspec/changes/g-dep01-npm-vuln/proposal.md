## Why

Die `website/`-Abhängigkeiten enthalten zwei bekannte CVEs in transitiven Dependencies: `js-yaml@4.1.1` (moderate, GHSA-h67p-54hq-rp68, quadratische DoS-Komplexität) und `@babel/core@7.29.0` (low, GHSA-4x5r-pxfx-6jf8, Arbitrary File Read via sourceMappingURL). Beide werden von `pnpm audit` gemeldet und müssen vor dem nächsten Release bereinigt werden.

## What Changes

- `pnpm.overrides` in `website/package.json` pinnt `js-yaml` auf `>=4.1.2` (patched) und `@babel/core` auf `>=7.29.1` (patched)
- `website/pnpm-lock.yaml` wird mit gepinnten, sicheren Versionen neu generiert
- Ein BATS-Test in `tests/spec/g-dep01-npm-vuln.bats` verifiziert `pnpm audit --json` meldet 0 Vulnerabilities (rot→grün-Gate)
- Keine direkten Dependency-Upgrades (package.json `dependencies`/`devDependencies` unverändert)
- Kein Breaking-Change — es handelt sich um reine Patch-Level-Overrides transitiver Deps

## Capabilities

### New Capabilities

- `npm-audit-clean`: BATS-Gate das `pnpm audit` ausführt und sicherstellt, dass 0 Vulnerabilities gemeldet werden — läuft im CI als Teil von `task test:all`

### Modified Capabilities

- `website-core`: Die Dependency-Lock-Policy wird um eine Override-Konvention für transitive CVEs ergänzt (kein Spec-Level-Verhaltenswechsel, nur Lock-File-Hygiene)

## Impact

- `website/package.json`: neues `pnpm.overrides`-Feld
- `website/pnpm-lock.yaml`: Lockfile-Änderungen für `js-yaml` und `@babel/core`
- `tests/spec/g-dep01-npm-vuln.bats`: neuer BATS-Test
- `openspec/specs/website-core.md`: optionaler Delta-Eintrag für Override-Konvention
- Kein Einfluss auf Kubernetes-Manifeste, Keycloak, oder andere Services
