# p1 — svelte-check als CI-Gate

Target files: `.github/workflows/ci.yml`, `components/website/package.json`,
`components/website/pnpm-lock.yaml`.

Kontext: `design.md` D1, D2.

### Task 1: devDependency und Script

```bash
cd components/website && pnpm add -D svelte-check@^4.7.6
```

Kein `node_modules`-Symlink auf den Haupt-Checkout anlegen: pnpm bricht dann mit
„workspace hoist directory is not a real directory" ab. `pnpm install` im Worktree legt ein echtes
Verzeichnis an.

In `package.json` neben `"astro:check": "astro check",` ergänzen:

```json
"svelte:check": "svelte-check --threshold error",
```

### Task 2: CI-Schritt

In `.github/workflows/ci.yml`, Job `vitest-website`, Schritt mit `pnpm run astro:check &` den
Lauf parallel ergänzen und mitwarten:

```bash
          pnpm run astro:check &
          A=$!
          pnpm exec svelte-check --threshold error &
          S=$!
          ...
          wait $A || EXIT=$?
          wait $S || EXIT=$?
```

Der Kommentar über dem Schritt bekommt einen Satz: `astro check` prüft keine `.svelte`-Dateien,
deshalb läuft `svelte-check` zusätzlich (T900809).

### Task 3: Prüfen

```bash
bats tests/spec/website-svelte-check.bats
```

Test 2 ist jetzt grün. Test 1 läuft (kein Skip mehr) und bleibt rot, bis p2–p6 fertig sind.
