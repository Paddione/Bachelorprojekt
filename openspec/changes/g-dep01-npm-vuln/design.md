## Context

Die `website/` nutzt pnpm als Paketmanager. `pnpm audit` meldet zwei CVEs in transitiven Abhängigkeiten:

- **js-yaml@4.1.1** (GHSA-h67p-54hq-rp68, moderate): ReDoS-ähnliche quadratische Komplexität bei Merge-Key-Handling. Transitive Dep von `@astrojs/internal-helpers@0.10.0` (aktuellste Version). Patched: `>=4.1.2`.
- **@babel/core@7.29.0** (GHSA-4x5r-pxfx-6jf8, low): Arbitrary File Read via sourceMappingURL-Kommentar. Transitive Dep von `@vitejs/plugin-react@5.2.0` via `@astrojs/react@6.0.0`. Patched: `>=7.29.1`.

Beide sind ausschließlich Build-/Dev-Zeit-Dependencies — kein direkter Laufzeit-Einfluss auf das deployierte Astro SSR Bundle.

## Goals / Non-Goals

**Goals:**
- `pnpm audit` meldet 0 Vulnerabilities nach der Fix-PR
- Minimale, rückwärtskompatible Änderung am Lockfile
- BATS-Gate der im CI läuft und `0 vulnerabilities` erzwingt
- Keine Breaking Changes an Astro, Svelte, oder React

**Non-Goals:**
- Upgrades nicht-verwundbarer Packages (separate chore/dependabot tickets)
- Upgrade von Astro, @astrojs/node, @astrojs/react auf neue Major-Versionen
- Vollständiger `pnpm outdated`-Sweep (das ist G-DEP02-Scope)
- Behebung von Vulnerabilities in anderen Repos als `website/`

## Decisions

### Entscheidung: pnpm.overrides statt direktem Dep-Upgrade

**Gewählt:** `overrides` in `website/pnpm-workspace.yaml` (pnpm 11+ liest `overrides` aus `pnpm-workspace.yaml`, nicht mehr aus `package.json`) pinnt die verwundbaren transitiven Packages auf sichere Patch-Versionen.

```yaml
overrides:
  js-yaml: "^4.1.2"
  "@babel/core": ">=7.29.1"
```

**Alternativen:**
- *Direktes Upgrade von Astro:* `@astrojs/internal-helpers@0.10.0` ist das aktuellste Release und verwendet weiterhin js-yaml@4.1.1. Ein Astro-Upgrade würde Breaking Changes riskieren.
- *pnpm update --recursive:* Kann unbeabsichtigt weitere Deps upgraden und CI-Instabilität erzeugen.
- *Abwarten auf upstream Fix:* Inakzeptabel für sicherheitskritische CVEs im CI-Scan.

**Rationale:** pnpm.overrides ist der idiomatische, minimal-invasive Mechanismus für transitive Dep-Fixes in pnpm-Projekten. Die Overrides überschreiben nur die spezifischen Sub-Dep-Versionen ohne die direkten Dep-Versionen zu ändern.

### Entscheidung: BATS-Gate statt Vitest-Gate

**Gewählt:** BATS-Test in `tests/spec/g-dep01-npm-vuln.bats` der `pnpm audit --json` im `website/`-Verzeichnis ausführt.

**Rationale:** `pnpm audit` ist ein Shell-Command. BATS ist der idiomatische Test-Rahmen für Shell-basierte CI-Gates in diesem Repo. Vitest wäre hier Overengineering (erfordert Node-Glue für Shell-Commands). Das BATS-Gate läuft via `./tests/runner.sh local` und `task test:all`.

## Risks / Trade-offs

- **[Risk] pnpm.overrides wird vom nächsten Renovate-Sweep überschrieben** → Mitigation: Override-Kommentar in `pnpm-workspace.yaml` dokumentiert CVE-Referenz. Renovate renoviert keine `overrides`-Blöcke (nur direkte deps). Beim nächsten Astro-Upstream-Fix wird Override entfernt.
- **[Risk] Override >=4.1.2 pulled eine inkompatible js-yaml-Version** → Mitigation: js-yaml 4.x ist SemVer-konform; Minor/Patch-Bumps innerhalb 4.x sind safe. Test: `task vitest` und `task website:build` nach dem Lockfile-Update.
- **[Risk] @babel/core >=7.29.1 ändert Build-Verhalten** → Mitigation: Babel@7.29.x-Changelog enthält keine Breaking Changes zwischen .0 und .1. Build-Smoke-Test als Verify-Step eingeplant.
