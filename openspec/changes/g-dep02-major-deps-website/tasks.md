---
title: "G-DEP02: Veraltete Major-Deps (website) 9 → ≤3"
ticket_id: T001209
domains: [dep, dependencies, website, renovate]
status: plan_staged
file_locks: []
shared_changes: false
---

# Tasks: g-dep02-major-deps-website (T001209)

- [ ] Task 0: Failing-Gate `website/tests/major-deps.test.ts` (vitest, offline) — RED bei 9 behind > 3
- [ ] Task 1: Major-Drift inventarisieren (`npx npm-check-updates`) und die 9 bestätigen
- [ ] Task 2: Low-Risk-Updates — `pino` 9→10, `signature_pad` 4→5
- [ ] Task 3: Astro-Stack koordiniert — `astro` 6→7 + `@astrojs/node`/`@astrojs/react`/`@astrojs/svelte` + `@sveltejs/vite-plugin-svelte`
- [ ] Task 4: High-Risk / Alpha — `rrweb` + `rrweb-player` alpha → 2.0.1 (migrieren oder als Ausnahme dokumentieren)
- [ ] Task 5: Verifikation + Commit + Push + PR

---

# G-DEP02 — Veraltete Major-Deps (website) 9 → ≤3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Die Anzahl Major-Version-behind Deps im `website/`-Paket von **9 auf ≤ 3**
senken (mindestens 6 aktualisieren). Erfolg ist messbar über ein offline-vitest-Gate,
das `website/package.json` gegen 9 dokumentierte Ziel-Majors prüft.

**Architecture:** Drei Risiko-Schichten, eine Mess-Schicht. (1) Mess-Gate: ein
reiner Datei-Lese-Test (vitest, node-Projekt) zählt, wie viele der 9 getrackten Deps
noch unter ihrer Ziel-Major liegen, und failt bei > 3 — kein Registry-Netz, läuft im
"Vitest (website)"-CI-Job. (2) Low-Risk: zwei standalone Libs mit je einer zentralen
Nutzungsstelle. (3) Astro-Stack: vier peer-hart-gekoppelte Pakete (müssen zusammen
springen) plus das Svelte-Vite-Plugin (an die Astro-7-Vite-Major gekoppelt). (4)
High-Risk: das Alpha-`rrweb`-Paar mit breiter Nutzung im Systemtest-/Fragebogen-Feature.

**Garantierter Floor:** Astro-Kern (4) + `pino` + `signature_pad` = 6 Updates ⇒
≤ 3 verbleibend ⇒ Gate grün, selbst wenn `rrweb`/`rrweb-player` als Ausnahme bleiben.

**Tech Stack:** pnpm, vitest (node-Projekt, `tests/**/*.test.ts`), Astro 7
Migrationsguide, `npx npm-check-updates`, `astro check`.

## File Structure

```
website/tests/major-deps.test.ts        ← NEU: offline vitest-Gate (≈55 Zeilen)
website/package.json                     ← MODIFY: 6–9 Dep-Versionen anheben
website/pnpm-lock.yaml                   ← REGENERATED via pnpm install
website/astro.config.mjs                 ← ggf. MODIFY: Astro-7-Migration (Config-API)
openspec/changes/g-dep02-major-deps-website/  ← proposal.md + tasks.md + specs/
```

**Nur lesend / berührt durch Lib-Migration (kein eigener Edit-Plan, je nach Breaking Change):**

- `website/src/lib/logger.ts` — einzige `pino`-Nutzung.
- `website/src/lib/systemtest/recorder.ts` — `rrweb`-Recorder.
- `website/src/components/SystemtestReplayDrawer.svelte` — `rrweb-player`-Einbindung.
- `website/src/components/portal/QuestionnaireWizard.svelte` — `rrweb`-Aufzeichnung.

## Task 0 — Failing-Gate (vitest, offline) — RED

Neue Datei `website/tests/major-deps.test.ts`. Sie liest `website/package.json`,
definiert die 9 Ziel-Majors (Baseline 2026-06-27) und zählt, wie viele Deps noch
darunter liegen. Pre-Releases (z. B. `2.0.0-alpha.4`) gelten gegenüber ihrem Stable-
Ziel immer als „behind". Schwelle: `≤ 3`.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// G-DEP02: latest stable major at ticket baseline (2026-06-27, verified via ncu).
const TARGETS: Record<string, string> = {
  astro: '7.0.0',
  '@astrojs/node': '11.0.0',
  '@astrojs/react': '6.0.0',
  '@astrojs/svelte': '9.0.0',
  '@sveltejs/vite-plugin-svelte': '7.0.0',
  pino: '10.0.0',
  signature_pad: '5.0.0',
  rrweb: '2.0.1',
  'rrweb-player': '2.0.1',
};
const MAX_BEHIND = 3;

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);
const ranges: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

const core = (v: string): number[] => {
  const p = v.replace(/^[^0-9]*/, '').split('-')[0].split('.').map(Number);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
};
const cmp = (a: number[], b: number[]): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const isBehind = (cur: string, target: string): boolean => {
  const diff = cmp(core(cur), core(target));
  if (diff < 0) return true;
  if (diff > 0) return false;
  return /-/.test(cur.replace(/^[^0-9]*/, '')); // same core but pre-release → behind
};

describe('G-DEP02 major-dep drift', () => {
  const behind = Object.entries(TARGETS)
    .filter(([name, target]) => ranges[name] && isBehind(ranges[name], target))
    .map(([name]) => name)
    .sort();
  it(`keeps website major-version-behind deps <= ${MAX_BEHIND}`, () => {
    expect(behind.length, `still behind: ${behind.join(', ')}`).toBeLessThanOrEqual(
      MAX_BEHIND,
    );
  });
});
```

**RED-Step:** Vor jedem Update den Test laufen lassen — er ist so geschrieben, dass
er beim Ist-Stand (9 behind) **expected: fail** liefert. So ist der RED-Zustand
reproduzierbar; nach den Updates muss er grün werden (RED → GREEN).

```bash
cd /tmp/wt-major-deps-website/website
pnpm exec vitest run tests/major-deps.test.ts
# Erwartung JETZT: 1 failed — "still behind: 9 deps", AssertionError 9 <= 3
```

**Akzeptanz:** Der vitest-Output zeigt genau 9 behind-Deps und schlägt fehl — das ist
die expected-fail-Phase. Nach Task 2–4 zeigt derselbe Test ≤ 3 behind und ist grün.

## Task 1 — Major-Drift inventarisieren

Reproduzierbare Bestandsaufnahme; bestätigt die 9 aus dem Proposal und liefert die
exakten Zielversionen für den Bump.

```bash
cd /tmp/wt-major-deps-website/website
npx --yes npm-check-updates --jsonUpgraded
# Major-behind herausfiltern (Major-Ziffer steigt bzw. alpha → stable):
npm outdated || true
```

**Akzeptanz:** Liste der 9 Major-behind Deps deckt sich mit der Proposal-Tabelle
(`astro`, `@astrojs/node`, `@astrojs/react`, `@astrojs/svelte`,
`@sveltejs/vite-plugin-svelte`, `pino`, `signature_pad`, `rrweb`, `rrweb-player`).
Abweichungen (neue Releases seit Baseline) werden notiert und die `TARGETS` im Gate
entsprechend angepasst.

## Task 2 — Low-Risk-Updates (`pino`, `signature_pad`)

Zwei standalone Libs, je eine zentrale Nutzungsstelle, geringe Blast-Radius.

```bash
cd /tmp/wt-major-deps-website/website
pnpm add pino@^10 signature_pad@^5
```

- **`pino` 9→10:** Breaking v10 betrifft v. a. abgekündigte Node-Versionen
  (wir laufen Node ≥ 22) und Transport-Details. CHANGELOG prüfen; `src/lib/logger.ts`
  nutzt die Basis-API (`pino({...})`) — auf Konstruktor-/Transport-Signatur achten.
- **`signature_pad` 4→5:** ESM-only, kleinere API-Anpassungen. Nutzung in
  `src/pages/portal/sign/[assignmentId].astro` (Konstruktor + `toDataURL`).

**Verifikation:**

```bash
pnpm exec vitest run
pnpm build   # SSR-Build muss durchlaufen
```

**Akzeptanz:** Build grün, vitest grün, Gate aus Task 0 zeigt 7 behind (9 − 2).
Smoke-Check: Signatur-Seite rendert, Logger schreibt strukturierte Logs.

## Task 3 — Astro-Stack koordiniert (4 + Vite-Plugin)

Astro 7 ist peer-hart an seine Adapter gekoppelt — `astro`, `@astrojs/node`,
`@astrojs/react`, `@astrojs/svelte` **müssen in einem Schritt** springen.
`@sveltejs/vite-plugin-svelte` 7 folgt der von Astro 7 gebündelten Vite-Major.

```bash
cd /tmp/wt-major-deps-website/website
pnpm add astro@^7 @astrojs/node@^11 @astrojs/react@^6 @astrojs/svelte@^9
pnpm add -D @sveltejs/vite-plugin-svelte@^7
```

- Astro-6→7-Migrationsguide abarbeiten: Config-API-Änderungen in
  `astro.config.mjs`, evtl. Content-Collections / Middleware / SSR-Adapter-Optionen.
- Peer-Warnungen aus `pnpm install` prüfen — bei Konflikt die jeweilige Adapter-
  Version exakt auf die von Astro 7 geforderte Range setzen.

**Verifikation:**

```bash
pnpm exec astro check
pnpm exec vitest run
pnpm build
```

**Akzeptanz:** `astro check`, vitest und Build grün; Gate zeigt nun ≤ 3 behind (bei
6 Updates exakt 3, bei 7 Updates 2). Damit ist das ≤ 3-Budget bereits erreicht.

## Task 4 — High-Risk / Alpha (`rrweb`, `rrweb-player`)

Stabile Versionen existieren (`2.0.1`), daher Migration **versuchen** statt sofort als
Ausnahme zu führen. Breiteste Nutzung: Systemtest-Recorder/-Player + Fragebogen-Wizard.

```bash
cd /tmp/wt-major-deps-website/website
pnpm add rrweb@^2.0.1 rrweb-player@^2.0.1
```

- `rrweb` 2.0.0-alpha.4 → 2.0.1: Import-Pfade / `record`/`pack`-Optionen prüfen
  (`src/lib/systemtest/recorder.ts`, `QuestionnaireWizard.svelte`,
  `evidence/upload.ts`).
- `rrweb-player` 1.0.0-alpha.4 → 2.0.1: größter API-Sprung — Player-Konstruktor /
  Props in `SystemtestReplayDrawer.svelte` an die v2-API anpassen.

**Verifikation:**

```bash
pnpm exec vitest run
pnpm build
```

**Entscheidung (fail-safe):** Lässt sich die `rrweb-player`-v2-Migration im Slice nicht
ohne Replay-Regression abschließen, beide Deps auf den Alpha-Pins belassen und als
**akzeptierte Ausnahme** dokumentieren — das ≤ 3-Budget ist durch Task 2+3 bereits
erfüllt (höchstens `rrweb` + `rrweb-player` verbleiben = 2 behind). Die Ausnahme wird
im PR-Body und in der Spec-Scenario "Alpha-pinned session-replay deps" festgehalten.

**Akzeptanz:** Entweder beide auf `2.0.1` (Gate: 0–1 behind) **oder** dokumentierte
Ausnahme mit Gate ≤ 3 behind. In beiden Fällen ist der Test aus Task 0 grün.

## Task 5 — Verifikation + Commit + Push + PR (Final)

```bash
cd /tmp/wt-major-deps-website
# Mess-Gate grün (RED → GREEN abgeschlossen)
( cd website && pnpm exec vitest run tests/major-deps.test.ts )
# Repo-Gates
task test:changed
task freshness:regenerate
task freshness:check
# OpenSpec
bash scripts/openspec.sh validate g-dep02-major-deps-website
```

Danach Commit (Conventional Commit, Ticket-Tag) und PR:

```bash
git add website/package.json website/pnpm-lock.yaml website/tests/major-deps.test.ts \
        website/astro.config.mjs openspec/changes/g-dep02-major-deps-website/
git commit -m "chore(website): major-deps 9 -> <=3 (astro 7 stack, pino 10, signature_pad 5) [T001209]"
git push
gh-axi pr create --fill --base main
gh-axi pr merge --squash --auto
```

**Akzeptanz:** `task test:changed` grün, `task freshness:check` 0 neue Violations,
`bash scripts/openspec.sh validate` ohne Errors, vitest-Gate grün (≤ 3 behind), PR
mit Auto-Merge gequeued. Falls `rrweb`/`rrweb-player` deferred: Ausnahme im PR-Body
benannt.
