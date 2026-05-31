---
title: AI-Agent Guide Foundation + Hub-Enrichment (F+B) Implementation Plan
ticket_id: T000374
domains: [infra, db, test]
status: active
pr_number: null
---

# AI-Agent Guide Foundation + Hub-Enrichment (F+B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single-source-of-truth registries (goals/tools/components/taxonomy/guardrails) + danger taxonomy + guardrail catalog for the AI-Agent Operating Guide, and ship proper easy-German descriptions into the platform hub via the codebase's existing runtime-ensure pattern.

**Architecture:** Hybrid SSOT. Human-authored YAML registries under `docs/agent-guide/registry/` are validated by a zero-schema-lib Node validator (`yaml` parse + custom cross-ref checks, run via `node --test`, gated in CI through `task test:all`). The component descriptions flow `components.yaml` → a generator → `website/src/lib/platform-descriptions.generated.json` → a new `ensurePlatformSchema()` in `platform-db.ts` that idempotently creates the platform tables and sets German descriptions **only where they are still NULL or the known English placeholder** (never clobbering admin edits), wrapped in the existing `ensureSchemaOnce` run-once guard. Per-brand automatic: each website pod seeds its own `website` DB.

**Tech Stack:** Node ≥22.13 (root `node --test`), `yaml` (new root devDep), TypeScript/Astro + `pg` (website), `vitest` + `pg-mem` (website unit tests), go-task (`task test:all`), PostgreSQL 16.

---

## File structure

**Create:**
- `docs/agent-guide/README.md` — explains the registry, field contracts (the human-readable schema), how it's consumed downstream.
- `docs/agent-guide/registry/taxonomy.yaml` — 4 danger tiers.
- `docs/agent-guide/registry/guardrails.yaml` — named guardrail catalog.
- `docs/agent-guide/registry/components.yaml` — 28 software + 9 hardware entries (German + English-placeholder snapshot).
- `docs/agent-guide/registry/tools.yaml` — beginner-spine skills + 6 agents.
- `docs/agent-guide/registry/goals.yaml` — "Ich will …" intent catalog.
- `scripts/agent-guide/validate.mjs` — validator (library + CLI).
- `scripts/agent-guide/validate.test.mjs` — `node --test` unit tests with fixtures.
- `scripts/agent-guide/fixtures/` — good + broken fixture registries for the validator tests.
- `scripts/gen-platform-descriptions.mjs` — `components.yaml` → generated JSON.
- `scripts/agent-guide/gen.test.mjs` — `node --test` for the generator.
- `website/src/lib/platform-descriptions.generated.json` — generated; committed.
- `website/src/lib/platform-db.ensure.test.ts` — vitest + pg-mem for `ensurePlatformSchema`.

**Modify:**
- `package.json` (root) — add `yaml` devDep; add `test:agent-guide` script.
- `Taskfile.yml` — add `test:agent-guide` task; add it to `test:all` deps.
- `website/src/lib/platform-db.ts` — add `runPlatformSchema`/`ensurePlatformSchema`; call from `listSoftwareAssets`/`listHardwareAssets`.

---

## Task 1: Scaffolding — dirs, root `yaml` dep, README

**Files:**
- Create: `docs/agent-guide/README.md`, `docs/agent-guide/registry/.gitkeep`, `scripts/agent-guide/.gitkeep`
- Modify: `package.json` (root)

- [ ] **Step 1: Add the `yaml` dependency at the repo root**

Run (from repo root `/tmp/wt-agent-guide-foundation`):
```bash
npm install --save-dev yaml@^2.8.3
```
Expected: `package.json` gains `"yaml": "^2.8.3"` under `devDependencies` and `package-lock.json` updates. (CI runs `npm ci` at root, so this makes `yaml` available to the validator/generator there.)

- [ ] **Step 2: Create the registry + scripts directories**

```bash
mkdir -p docs/agent-guide/registry scripts/agent-guide/fixtures
touch docs/agent-guide/registry/.gitkeep scripts/agent-guide/.gitkeep
```

- [ ] **Step 3: Write `docs/agent-guide/README.md`**

````markdown
# AI-Agent Operating Guide — Registry (SSOT)

This directory is the **single source of truth** for the beginner-facing operating guide.
The YAML files here feed: the platform hub DB (component descriptions), the future docs-site /
in-app-help / repo-map surfaces, and the future enforcement layer. Edit the YAML, run the
validator, commit. Narrative teaching prose lives in the surfaces, not here.

## Files
- `taxonomy.yaml` — the 4 danger tiers. The `id` of each tier is the value other files put in
  their `danger` / `sensitivity` field, and the contract the enforcement layer consumes.
- `guardrails.yaml` — reusable named guardrails. Tools/goals reference these by `id`.
- `tools.yaml` — the beginner-spine skills + the 6 routing agents.
- `goals.yaml` — the "Ich will …" intent catalog; each goal's `flow` references tool `id`s.
- `components.yaml` — every platform component (matches `platform.software_assets` /
  `hardware_assets` by `slug`). `summary_de` is written into the hub `description` column.

## Validate
```bash
node scripts/agent-guide/validate.mjs      # validates the real registry, exit 1 on error
task test:agent-guide                      # validator unit tests + real-registry validation + gen check
```

## Field contracts
All `*_de` fields are German, Du-form, plain & friendly, every technical term explained in
parentheses on first use. Ids are kebab-case and stable.

- **taxonomy entry:** `id`, `label_de`, `emoji`, `meaning_de`, `doc_treatment`, `enforcement_default`
- **guardrail entry:** `id`, `name_de`, `rule_de`, `why_de`, `enforced_by`
- **tool entry:** `id`, `name_de`, `kind` (`skill|agent|task`), `summary_de`, `what_for_de`,
  `how_to_start_de`, `what_could_go_wrong_de`, `danger` (taxonomy id), `guardrails` (ids),
  `related` (tool ids), `links`
- **goal entry:** `id`, `title_de`, `when_de`, `flow` (list of `{tool, note_de}`),
  `example_prompt_de`, `danger` (taxonomy id), `guardrails` (ids), `related` (goal ids)
- **component entry:** `slug` (= DB slug), `kind` (`software|hardware`), `name`, `emoji`,
  `summary_de` (≤140 chars; → hub `description`), `what_for_de`, `placeholder_en` (verbatim
  current English DB value we are replacing), `sensitivity` (taxonomy id), `url`, `links`
````

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json docs/agent-guide scripts/agent-guide
git commit -m "feat(agent-guide): scaffold registry dirs, README, root yaml dep"
```

---

## Task 2: Registry validator (TDD, `node --test`)

**Files:**
- Create: `scripts/agent-guide/validate.mjs`, `scripts/agent-guide/validate.test.mjs`,
  `scripts/agent-guide/fixtures/good/*.yaml`, `scripts/agent-guide/fixtures/bad-danger-ref/*.yaml`
- Modify: `package.json` (root), `Taskfile.yml`

- [ ] **Step 1: Write good + broken fixtures**

Create a minimal **valid** registry in `scripts/agent-guide/fixtures/good/`:

`scripts/agent-guide/fixtures/good/taxonomy.yaml`
```yaml
- id: safe
  label_de: "🟢 Sicher"
  emoji: "🟢"
  meaning_de: "Selbst machen, keine Gefahr."
  doc_treatment: "green-badge"
  enforcement_default: "none"
- id: caution
  label_de: "🟡 Vorsicht"
  emoji: "🟡"
  meaning_de: "Checkliste abarbeiten, Agent bestätigt."
  doc_treatment: "yellow-badge"
  enforcement_default: "pre-flight-confirm"
- id: assisted
  label_de: "🟠 Nur mit Hilfe"
  emoji: "🟠"
  meaning_de: "Mit erfahrener Person."
  doc_treatment: "orange-warning"
  enforcement_default: "double-confirm"
- id: forbidden
  label_de: "🔴 Niemals allein"
  emoji: "🔴"
  meaning_de: "Von Enforcement blockiert."
  doc_treatment: "red-stop"
  enforcement_default: "hard-block"
```

`scripts/agent-guide/fixtures/good/guardrails.yaml`
```yaml
- id: G-ENV-EXPLICIT
  name_de: "ENV immer setzen"
  rule_de: "Setze bei jedem Deploy ENV= explizit."
  why_de: "Sonst trifft der Befehl die falsche Umgebung."
  enforced_by: docs-only
```

`scripts/agent-guide/fixtures/good/tools.yaml`
```yaml
- id: dev-flow-plan
  name_de: "Planungs-Skill"
  kind: skill
  summary_de: "Wählt den Pfad und schreibt den Plan."
  what_for_de: "Startpunkt für jede Änderung."
  how_to_start_de: "Beschreibe einfach, was du ändern willst."
  what_could_go_wrong_de: "Nichts — er stoppt vor der Umsetzung."
  danger: caution
  guardrails: [G-ENV-EXPLICIT]
  related: []
  links: []
```

`scripts/agent-guide/fixtures/good/goals.yaml`
```yaml
- id: bug-beheben
  title_de: "Ich will einen Fehler beheben"
  when_de: "Etwas funktioniert nicht wie erwartet."
  flow:
    - tool: dev-flow-plan
      note_de: "Beschreibe den Fehler."
  example_prompt_de: "Der Login-Button tut nichts. Bitte finde und behebe den Fehler."
  danger: caution
  guardrails: [G-ENV-EXPLICIT]
  related: []
```

`scripts/agent-guide/fixtures/good/components.yaml`
```yaml
- slug: keycloak
  kind: software
  name: "Keycloak"
  emoji: "🔑"
  summary_de: "Die zentrale Anmeldung für alle Dienste."
  what_for_de: "Ein Login (Single Sign-On) für die ganze Plattform."
  placeholder_en: "SSO / OIDC identity provider"
  sensitivity: forbidden
  url: null
  links: []
```

Create a **broken** copy in `scripts/agent-guide/fixtures/bad-danger-ref/` identical to `good/`
except `tools.yaml`'s `danger:` is `nonexistent-tier` (used to assert a dangling-danger error).
(Copy all five files; change only that one value.)

- [ ] **Step 2: Write the failing test `scripts/agent-guide/validate.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateRegistry } from './validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('good fixture validates with no errors', () => {
  const res = validateRegistry(join(here, 'fixtures', 'good'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  assert.equal(res.errors.length, 0);
});

test('dangling danger reference is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-danger-ref'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('danger') && e.includes('nonexistent-tier')),
    `expected a danger-ref error, got: ${JSON.stringify(res.errors)}`,
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test scripts/agent-guide/validate.test.mjs`
Expected: FAIL — `Cannot find module './validate.mjs'`.

- [ ] **Step 4: Implement `scripts/agent-guide/validate.mjs`**

```js
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const TAXONOMY_REQUIRED = ['safe', 'caution', 'assisted', 'forbidden'];
const TOOL_KINDS = ['skill', 'agent', 'task'];

function load(dir, file) {
  return parse(readFileSync(join(dir, file), 'utf8')) ?? [];
}

// Extract every asset slug seeded in the platform migrations, so components.yaml
// stays in lock-step with the DB. Matches lines like: ('keycloak', 'Keycloak', ...
function migrationSlugs(repoRoot) {
  const dir = join(repoRoot, 'website', 'src', 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.includes('platform_assets'));
  const slugs = new Set();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    for (const m of sql.matchAll(/^\s*\('([a-z0-9-]+)',/gm)) slugs.add(m[1]);
  }
  return slugs;
}

export function validateRegistry(dir, repoRoot = null) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  const taxonomy = load(dir, 'taxonomy.yaml');
  const guardrails = load(dir, 'guardrails.yaml');
  const tools = load(dir, 'tools.yaml');
  const goals = load(dir, 'goals.yaml');
  const components = load(dir, 'components.yaml');

  const taxIds = new Set(taxonomy.map((t) => t.id));
  const grIds = new Set(guardrails.map((g) => g.id));
  const toolIds = new Set(tools.map((t) => t.id));

  for (const id of TAXONOMY_REQUIRED) req(taxIds.has(id), `taxonomy: missing required tier '${id}'`);
  for (const t of taxonomy)
    for (const k of ['id', 'label_de', 'emoji', 'meaning_de', 'doc_treatment', 'enforcement_default'])
      req(t?.[k], `taxonomy[${t?.id}]: missing '${k}'`);

  for (const g of guardrails)
    for (const k of ['id', 'name_de', 'rule_de', 'why_de', 'enforced_by'])
      req(g?.[k], `guardrails[${g?.id}]: missing '${k}'`);

  for (const t of tools) {
    for (const k of ['id', 'name_de', 'kind', 'summary_de', 'what_for_de', 'how_to_start_de',
      'what_could_go_wrong_de', 'danger'])
      req(t?.[k], `tools[${t?.id}]: missing '${k}'`);
    req(TOOL_KINDS.includes(t?.kind), `tools[${t?.id}]: kind '${t?.kind}' not in ${TOOL_KINDS}`);
    req(taxIds.has(t?.danger), `tools[${t?.id}]: danger '${t?.danger}' not in taxonomy`);
    for (const gid of t?.guardrails ?? []) req(grIds.has(gid), `tools[${t?.id}]: guardrail '${gid}' unknown`);
    for (const rid of t?.related ?? []) req(toolIds.has(rid), `tools[${t?.id}]: related '${rid}' unknown`);
  }

  for (const g of goals) {
    for (const k of ['id', 'title_de', 'when_de', 'flow', 'example_prompt_de', 'danger'])
      req(g?.[k] !== undefined && g?.[k] !== null, `goals[${g?.id}]: missing '${k}'`);
    req(taxIds.has(g?.danger), `goals[${g?.id}]: danger '${g?.danger}' not in taxonomy`);
    for (const step of g?.flow ?? [])
      req(toolIds.has(step?.tool), `goals[${g?.id}]: flow tool '${step?.tool}' unknown`);
    for (const gid of g?.guardrails ?? []) req(grIds.has(gid), `goals[${g?.id}]: guardrail '${gid}' unknown`);
  }

  for (const c of components) {
    for (const k of ['slug', 'kind', 'name', 'emoji', 'summary_de', 'what_for_de', 'placeholder_en', 'sensitivity'])
      req(c?.[k] !== undefined && c?.[k] !== null, `components[${c?.slug}]: missing '${k}'`);
    req(['software', 'hardware'].includes(c?.kind), `components[${c?.slug}]: bad kind '${c?.kind}'`);
    req((c?.summary_de ?? '').length <= 140, `components[${c?.slug}]: summary_de > 140 chars`);
    req(taxIds.has(c?.sensitivity), `components[${c?.slug}]: sensitivity '${c?.sensitivity}' not in taxonomy`);
  }

  if (repoRoot) {
    const dbSlugs = migrationSlugs(repoRoot);
    const compSlugs = new Set(components.map((c) => c.slug));
    for (const s of dbSlugs) req(compSlugs.has(s), `components: DB slug '${s}' has no registry entry`);
    for (const s of compSlugs) req(dbSlugs.has(s), `components: registry slug '${s}' not in any migration`);
  }

  return { ok: errors.length === 0, errors };
}

// CLI: validate the real registry (with DB slug cross-check) and exit non-zero on failure.
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const res = validateRegistry(join(repoRoot, 'docs', 'agent-guide', 'registry'), repoRoot);
  if (!res.ok) { for (const e of res.errors) console.error('✗', e); process.exit(1); }
  console.log('✓ agent-guide registry valid');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test scripts/agent-guide/validate.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the `test:agent-guide` task + root script and wire into `test:all`**

In `package.json` (root) `scripts`, add:
```json
"test:agent-guide": "node --test scripts/agent-guide/*.test.mjs"
```

In `Taskfile.yml`, add a new task (place near `test:docs-gen` around line 345):
```yaml
  test:agent-guide:
    desc: "Validate the AI-agent guide registry (unit tests + real registry + generated JSON freshness)"
    cmds:
      - node --test scripts/agent-guide/*.test.mjs
      - node scripts/agent-guide/validate.mjs
      - node scripts/gen-platform-descriptions.mjs
      - |
        git diff --exit-code website/src/lib/platform-descriptions.generated.json \
          || (echo "ERROR: platform-descriptions.generated.json is stale — run node scripts/gen-platform-descriptions.mjs and commit"; exit 1)
```
And add `- test:agent-guide` to the `test:all` `deps:` list (line ~352).

> NOTE: the `node scripts/gen-platform-descriptions.mjs` + git-diff freshness check requires Task 7
> to exist. Until Task 7 lands, run only the first two cmds locally; the full task goes green after
> Task 7. (Subagent-driven execution does Tasks in order, so this resolves by Task 7's commit.)

- [ ] **Step 7: Run the validator unit tests via the task path & commit**

Run: `node --test scripts/agent-guide/*.test.mjs`
Expected: PASS.
```bash
git add scripts/agent-guide package.json Taskfile.yml
git commit -m "feat(agent-guide): registry validator with cross-ref + DB-slug checks"
```

---

## Task 3: taxonomy.yaml + guardrails.yaml (full content)

**Files:**
- Create: `docs/agent-guide/registry/taxonomy.yaml`, `docs/agent-guide/registry/guardrails.yaml`

- [ ] **Step 1: Write `docs/agent-guide/registry/taxonomy.yaml`** (use the four entries verbatim from the `good` fixture in Task 2 Step 1).

- [ ] **Step 2: Write `docs/agent-guide/registry/guardrails.yaml`**

```yaml
- id: G-ENV-EXPLICIT
  name_de: "ENV immer explizit setzen"
  rule_de: "Bei jedem Deploy/Cluster-Befehl ENV= ausdrücklich angeben (z. B. ENV=mentolder)."
  why_de: "Ohne ENV= wird 'dev' angenommen und der Befehl trifft heimlich die falsche Umgebung."
  enforced_by: hook-env-explicit
- id: G-CONTEXT-CHECK
  name_de: "Kubectl-Kontext prüfen"
  rule_de: "Vor jeder Cluster-Aktion prüfen, auf welchen Cluster (Kontext) du gerade zeigst."
  why_de: "Der aktive Kontext könnte ein anderer Cluster sein als gedacht."
  enforced_by: docs-only
- id: G-PULL-FIRST
  name_de: "Erst ziehen, dann arbeiten"
  rule_de: "Immer 'git pull --rebase origin main' bevor du etwas änderst."
  why_de: "Sonst arbeitest du auf einem veralteten Stand und bekommst Konflikte."
  enforced_by: docs-only
- id: G-PR-NOT-MAIN
  name_de: "Nie direkt auf main"
  rule_de: "Änderungen immer über einen Branch + Pull Request, niemals direkt nach main pushen."
  why_de: "main ist geschützt; direktes Pushen umgeht Review und CI."
  enforced_by: hook-no-push-main
- id: G-SECRET-ORDER
  name_de: "Geheimnis-Reihenfolge einhalten"
  rule_de: "Sealed-Secrets-Schritte in der vorgegebenen Reihenfolge ausführen (install → fetch-cert → seal → deploy)."
  why_de: "Falsche Reihenfolge überschreibt Produktiv-Zugangsdaten mit Platzhaltern."
  enforced_by: docs-only
- id: G-VALIDATE-FIRST
  name_de: "Erst prüfen, dann anwenden"
  rule_de: "Manifeste vor dem Anwenden validieren (task workspace:validate) / dry-run nutzen."
  why_de: "Fängt kaputte Konfiguration ab, bevor sie den Cluster erreicht."
  enforced_by: docs-only
- id: G-ASK-EXPERT
  name_de: "Bei Rot: stoppen und fragen"
  rule_de: "Bei 🔴-Aktionen nicht selbst handeln — Patrick fragen."
  why_de: "Diese Aktionen können die Plattform für alle lahmlegen."
  enforced_by: hook-forbidden-stop
```

- [ ] **Step 3: Validate & commit**

Run: `node scripts/agent-guide/validate.mjs`
Expected: it will report missing `tools.yaml`/`goals.yaml`/`components.yaml` (created in later tasks) — that's OK for now; confirm there are **no** taxonomy/guardrail errors. (If you want a clean pass now, run the validator against just these via the unit-test fixtures instead.)
```bash
git add docs/agent-guide/registry/taxonomy.yaml docs/agent-guide/registry/guardrails.yaml
git commit -m "feat(agent-guide): danger taxonomy + guardrail catalog"
```

---

## Task 4: components.yaml — full German content (28 software + 9 hardware)

**Files:**
- Create: `docs/agent-guide/registry/components.yaml`

- [ ] **Step 1: Write `docs/agent-guide/registry/components.yaml`** with EXACTLY these entries. `placeholder_en` is the verbatim current DB value (from `20260521`/`20260522`), used by the seed guard. `summary_de` ≤140 chars.

```yaml
# ── Software ──────────────────────────────────────────────────────────────────
- { slug: website,            kind: software, name: "Website",            emoji: "🌐", sensitivity: caution,   placeholder_en: "Astro + Svelte frontend",
    summary_de: "Die öffentliche Webseite und das Kundenportal. Hier ändert man Texte, Preise und sieht eigene Daten.",
    what_for_de: "Das mit Astro + Svelte gebaute Frontend (die Web-Oberfläche). Öffentliche Seite plus eingeloggtes Kundenportal.", url: null, links: [] }
- { slug: keycloak,           kind: software, name: "Keycloak",           emoji: "🔑", sensitivity: forbidden, placeholder_en: "SSO / OIDC identity provider",
    summary_de: "Die zentrale Anmeldung (Single Sign-On): ein Login für alle Dienste.",
    what_for_de: "Keycloak prüft, wer du bist (über OIDC) und meldet dich bei Nextcloud, Vaultwarden u. a. an. Herzstück der Sicherheit.", url: null, links: [] }
- { slug: nextcloud,          kind: software, name: "Nextcloud",          emoji: "☁️", sensitivity: assisted,  placeholder_en: "File storage + groupware",
    summary_de: "Deine private Cloud: Dateien, Kalender, Kontakte und Video-Telefonie (Talk).",
    what_for_de: "Wie eine eigene Dropbox + Office + Kalender, komplett auf eigenen Servern (DSGVO-konform).", url: null, links: [] }
- { slug: collabora,          kind: software, name: "Collabora",          emoji: "📄", sensitivity: caution,   placeholder_en: "Online office suite",
    summary_de: "Office im Browser: Dokumente, Tabellen und Präsentationen direkt in Nextcloud bearbeiten.",
    what_for_de: "Die Online-Office-Suite, die Nextcloud-Dateien bearbeitbar macht (vergleichbar mit Office im Web).", url: null, links: [] }
- { slug: vaultwarden,        kind: software, name: "Vaultwarden",        emoji: "🔒", sensitivity: forbidden, placeholder_en: "Password manager (Bitwarden-compat)",
    summary_de: "Der Passwort-Tresor (kompatibel mit Bitwarden). Speichert Passwörter sicher und verschlüsselt.",
    what_for_de: "Verwaltet Zugangsdaten zentral und verschlüsselt; per Bitwarden-Apps nutzbar.", url: null, links: [] }
- { slug: nextcloud-talk-hpb, kind: software, name: "Talk HPB",           emoji: "📡", sensitivity: caution,   placeholder_en: "Nextcloud Talk signaling server",
    summary_de: "Der Vermittlungs-Server (Signaling) für Nextcloud Talk – sorgt dafür, dass Video-Anrufe zueinander finden.",
    what_for_de: "High-Performance-Backend für Talk; ohne ihn brechen Gruppen-Videoanrufe zusammen.", url: null, links: [] }
- { slug: brett,              kind: software, name: "Brett",              emoji: "🧩", sensitivity: caution,   placeholder_en: "3D systemic-constellation board",
    summary_de: "Das 3D-Systembrett: ein digitales Aufstellungs-Board für systemische Arbeit im Browser.",
    what_for_de: "Interaktives 3D-Board (Systembrett) für Aufstellungen, im Browser bedienbar.", url: null, links: [] }
- { slug: mailpit,            kind: software, name: "Mailpit",            emoji: "📬", sensitivity: safe,      placeholder_en: "SMTP dev mailbox",
    summary_de: "Ein Test-Postfach für Entwickler: fängt E-Mails ab, statt sie echt zu verschicken.",
    what_for_de: "Nur zum Ausprobieren: zeigt verschickte Mails an, ohne sie an echte Empfänger zu senden.", url: null, links: [] }
- { slug: docuseal,           kind: software, name: "DocuSeal",           emoji: "📝", sensitivity: caution,   placeholder_en: "Document signing",
    summary_de: "Dokumente digital unterschreiben lassen (elektronische Signatur).",
    what_for_de: "Versendet Dokumente zur rechtssicheren elektronischen Unterschrift.", url: null, links: [] }
- { slug: whiteboard,         kind: software, name: "Whiteboard",         emoji: "🎨", sensitivity: safe,      placeholder_en: "Collaborative drawing",
    summary_de: "Eine gemeinsame Zeichen-Tafel zum Brainstormen, in Nextcloud eingebunden.",
    what_for_de: "Kollaboratives Whiteboard für Skizzen und Ideen, direkt in Nextcloud.", url: null, links: [] }
- { slug: arena,              kind: software, name: "Arena",              emoji: "🎮", sensitivity: caution,   placeholder_en: "Multiplayer game server",
    summary_de: "Der Mehrspieler-Spielserver (nur Marke korczewski).",
    what_for_de: "WebSocket-Spielserver für das 3D-Mehrspieler-Spiel der Marke korczewski.", url: null, links: [] }
- { slug: docs,               kind: software, name: "Documentation",      emoji: "📚", sensitivity: safe,      placeholder_en: "Platform documentation (Docsify)",
    summary_de: "Die Anleitungen und Handbücher der Plattform (die Doku-Seite).",
    what_for_de: "Statische Doku-Webseite mit Benutzer- und Admin-Handbuch.", url: null, links: [] }
- { slug: postgresql,         kind: software, name: "PostgreSQL 16",      emoji: "🐘", sensitivity: forbidden, placeholder_en: "Shared database server",
    summary_de: "Die zentrale Datenbank (PostgreSQL 16). Hier liegen fast alle Daten der Plattform.",
    what_for_de: "Gemeinsamer Datenbank-Server für Website, Keycloak, Nextcloud u. v. m. Pro Marke eigene Instanz.", url: null, links: [] }
- { slug: traefik,            kind: software, name: "Traefik",            emoji: "🔀", sensitivity: assisted,  placeholder_en: "Kubernetes ingress controller (k3s DaemonSet, kube-system)",
    summary_de: "Der Türsteher des Clusters: leitet jede Web-Anfrage an den richtigen Dienst und macht HTTPS.",
    what_for_de: "Ingress-Controller: verteilt eingehenden Verkehr (Routing) und terminiert TLS.", url: null, links: [] }
- { slug: sealed-secrets,     kind: software, name: "Sealed Secrets",     emoji: "🔐", sensitivity: forbidden, placeholder_en: "Bitnami Sealed Secrets controller — encrypts k8s Secrets at rest",
    summary_de: "Verschlüsselt geheime Zugangsdaten, damit sie sicher in Git liegen können.",
    what_for_de: "Wandelt Secrets in verschlüsselte 'SealedSecrets', die gefahrlos eingecheckt werden können.", url: null, links: [] }
- { slug: cert-manager,       kind: software, name: "cert-manager",       emoji: "📜", sensitivity: assisted,  placeholder_en: "cert-manager — ACME / DNS-01 TLS certificate automation",
    summary_de: "Holt und erneuert automatisch die HTTPS-Zertifikate (über Let's Encrypt / DNS-01).",
    what_for_de: "Automatisiert TLS-Zertifikate, damit alle Domains gültiges HTTPS haben.", url: null, links: [] }
- { slug: k3s,                kind: software, name: "k3s / k3d",          emoji: "☸️", sensitivity: forbidden, placeholder_en: "Lightweight Kubernetes distribution",
    summary_de: "Das schlanke Kubernetes, auf dem alle Dienste laufen. Das Fundament der Plattform.",
    what_for_de: "Leichtgewichtige Kubernetes-Variante (k3s in Prod, k3d lokal). Trägt alle Workloads.", url: null, links: [] }
- { slug: wireguard,          kind: software, name: "WireGuard (wg-mesh)", emoji: "🔗", sensitivity: assisted, placeholder_en: "VPN mesh overlay connecting all mentolder cluster nodes",
    summary_de: "Das verschlüsselte Netz (VPN-Mesh), das alle Server-Knoten privat verbindet.",
    what_for_de: "WireGuard-Overlay: sichere Pod-zu-Pod- und Knoten-zu-Knoten-Verbindung über das Internet.", url: null, links: [] }
- { slug: tei,                kind: software, name: "TEI (Text Embeddings)", emoji: "🦾", sensitivity: caution, placeholder_en: "Text Embeddings Inference — bge-m3 via GPU host on wg-mesh (llm-gateway-embed Service)",
    summary_de: "Wandelt Texte in Vektoren um (Embeddings, Modell bge-m3) für die KI-Suche – läuft auf dem GPU-Rechner.",
    what_for_de: "Erzeugt Embeddings für die semantische Suche; nur verfügbar, solange der GPU-Host läuft.", url: null, links: [] }
- { slug: openclaw,           kind: software, name: "OpenClaw",           emoji: "🦅", sensitivity: caution,   placeholder_en: "OpenClaw AI assistant daemon on WSL GPU host (talks to Ollama 10.10.0.3:11434/v1)",
    summary_de: "Ein lokaler KI-Assistent-Dienst auf dem GPU-Rechner (spricht direkt mit Ollama).",
    what_for_de: "Daemon auf dem WSL-GPU-Host; nutzt lokale Modelle über Ollama, ohne Cloud.", url: null, links: [] }
- { slug: livekit,            kind: software, name: "LiveKit Server",     emoji: "📡", sensitivity: assisted,  placeholder_en: "WebRTC server (hostNetwork, pinned to gekko-hetzner-3)",
    summary_de: "Der WebRTC-Server für Live-Video und Streaming (z. B. Bühnen-Übertragungen).",
    what_for_de: "Echtzeit-Video-Server; läuft im Host-Netz und ist an einen festen Knoten gebunden.", url: null, links: [] }
- { slug: livekit-ingress,    kind: software, name: "LiveKit Ingress",    emoji: "📺", sensitivity: caution,   placeholder_en: "RTMP ingest endpoint",
    summary_de: "Nimmt eingehende Video-Streams an (RTMP) und gibt sie an LiveKit weiter.",
    what_for_de: "Eingangstor für externe Streams (z. B. aus OBS) in eine LiveKit-Übertragung.", url: null, links: [] }
- { slug: livekit-egress,     kind: software, name: "LiveKit Egress",     emoji: "🔴", sensitivity: caution,   placeholder_en: "Stream recording",
    summary_de: "Nimmt Live-Streams auf und speichert sie als Aufzeichnung.",
    what_for_de: "Zeichnet LiveKit-Räume auf, damit sie später angesehen werden können.", url: null, links: [] }
- { slug: whisper,            kind: software, name: "Whisper",            emoji: "🎙️", sensitivity: caution,   placeholder_en: "OpenAI Whisper speech-to-text transcription",
    summary_de: "Wandelt gesprochene Sprache in Text um (Spracherkennung, OpenAI Whisper).",
    what_for_de: "Speech-to-Text-Modell; Grundlage für automatische Gesprächs-Mitschriften.", url: null, links: [] }
- { slug: talk-transcriber,   kind: software, name: "Talk Transcriber",   emoji: "📝", sensitivity: caution,   placeholder_en: "Nextcloud Talk auto-transcription bot",
    summary_de: "Schreibt Nextcloud-Talk-Gespräche automatisch mit (Transkription).",
    what_for_de: "Bot, der Talk-Anrufe live mitschreibt und als Text ablegt.", url: null, links: [] }
- { slug: mcp,                kind: software, name: "MCP Monolith",       emoji: "🤖", sensitivity: assisted,  placeholder_en: "Claude Code MCP proxy (auth + ops pods, mentolder only)",
    summary_de: "Die Brücke, über die Claude Code mit der Plattform arbeitet (MCP-Proxy, nur mentolder).",
    what_for_de: "Model-Context-Protocol-Proxy: gibt KI-Agenten kontrollierten Zugriff auf Cluster-Werkzeuge.", url: null, links: [] }
- { slug: brainstorm,         kind: software, name: "Brainstorm Sish",    emoji: "🌀", sensitivity: caution,   placeholder_en: "Reverse-SSH tunnel endpoint for brainstorm.mentolder.de",
    summary_de: "Ein sicherer Tunnel, der das lokale Brainstorming-Board unter brainstorm.mentolder.de erreichbar macht.",
    what_for_de: "Reverse-SSH-Tunnel (sish); macht das lokale Companion-Board von außen erreichbar.", url: null, links: [] }
- { slug: arena-server,       kind: software, name: "Arena Server",       emoji: "🎮", sensitivity: caution,   placeholder_en: "Multiplayer 3D game server (korczewski only) — JWT validated from both Keycloak realms",
    summary_de: "Der 3D-Mehrspieler-Spielserver (nur korczewski); prüft Logins aus beiden Keycloak-Welten.",
    what_for_de: "WebSocket-Spielserver der Marke korczewski; validiert JWTs aus beiden Keycloak-Realms.", url: null, links: [] }
# ── Hardware ──────────────────────────────────────────────────────────────────
# NOTE: roles below reflect the CURRENT fleet topology (pk-* = control-plane,
# gekko-* = workers). The DB rows' role/cluster columns are pre-consolidation and
# stale — see plan "Risks & data note". summary_de describes reality; column
# correction is a flagged follow-up.
- { slug: gekko-hetzner-2, kind: hardware, name: "Gekko CP 1",  emoji: "🖥️", sensitivity: assisted, placeholder_en: "Control-plane Helsinki",
    summary_de: "Fleet-Arbeitsknoten in Helsinki (Hetzner). Trägt Plattform-Workloads beider Marken.",
    what_for_de: "Einer der drei Worker-Knoten des Fleet-Clusters (gekko-Reihe), Standort Helsinki.", url: null, links: [] }
- { slug: gekko-hetzner-3, kind: hardware, name: "Gekko CP 2",  emoji: "🖥️", sensitivity: assisted, placeholder_en: "Control-plane Helsinki",
    summary_de: "Fleet-Arbeitsknoten in Helsinki. Beherbergt unter anderem den LiveKit-Server.",
    what_for_de: "Worker-Knoten des Fleet-Clusters; LiveKit ist hier per Node-Affinität verankert.", url: null, links: [] }
- { slug: gekko-hetzner-4, kind: hardware, name: "Gekko CP 3",  emoji: "🖥️", sensitivity: assisted, placeholder_en: "Control-plane Helsinki",
    summary_de: "Fleet-Arbeitsknoten in Helsinki (Hetzner).",
    what_for_de: "Dritter Worker-Knoten des Fleet-Clusters (gekko-Reihe).", url: null, links: [] }
- { slug: k3s-1, kind: hardware, name: "k3s-1", emoji: "🏠", sensitivity: assisted, placeholder_en: "Home Worker 1",
    summary_de: "Heim-Server (Proxmox-VM). Beherbergt die Dev-Umgebung dev.mentolder.de.",
    what_for_de: "Lokaler Knoten zuhause; trägt den Dev-k3d-Stack der Entwicklung.", url: null, links: [] }
- { slug: k3s-2, kind: hardware, name: "k3s-2", emoji: "🏠", sensitivity: assisted, placeholder_en: "Home Worker 2",
    summary_de: "Heim-Server (zuhause).",
    what_for_de: "Lokaler Knoten zuhause.", url: null, links: [] }
- { slug: k3s-3, kind: hardware, name: "k3s-3", emoji: "🏠", sensitivity: assisted, placeholder_en: "Home Worker 3",
    summary_de: "Heim-Server (zuhause).",
    what_for_de: "Lokaler Knoten zuhause.", url: null, links: [] }
- { slug: pk-hetzner-4, kind: hardware, name: "PK CP 1",     emoji: "🖥️", sensitivity: assisted, placeholder_en: "Control-plane Helsinki",
    summary_de: "Fleet-Steuerknoten (Control-Plane) in Helsinki. LiveKit-DNS zeigt hierhin.",
    what_for_de: "Einer der drei Steuer-Knoten des Fleet-Clusters (pk-Reihe), Standort Helsinki.", url: null, links: [] }
- { slug: pk-hetzner-6, kind: hardware, name: "PK Worker 1",  emoji: "🖥️", sensitivity: assisted, placeholder_en: "Worker Helsinki",
    summary_de: "Fleet-Steuerknoten (Control-Plane) in Helsinki (Hetzner).",
    what_for_de: "Steuer-Knoten des Fleet-Clusters (pk-Reihe), Helsinki.", url: null, links: [] }
- { slug: pk-hetzner-8, kind: hardware, name: "PK Worker 2",  emoji: "🖥️", sensitivity: assisted, placeholder_en: "Worker Helsinki",
    summary_de: "Fleet-Steuerknoten (Control-Plane) in Helsinki (Hetzner).",
    what_for_de: "Steuer-Knoten des Fleet-Clusters (pk-Reihe), Helsinki.", url: null, links: [] }
```

> NOTE: every `placeholder_en` above is the verbatim current DB value taken from
> `20260521`/`20260522`. The guard only replaces a description that exactly equals this string, so
> re-grep both migration files and re-confirm each `placeholder_en` matches **byte-for-byte** before
> committing (watch the em-dash `—` in `tei`, `sealed-secrets`, `cert-manager`, `arena-server`).

- [ ] **Step 2: Validate slug cross-check & commit**

Run: `node scripts/agent-guide/validate.mjs`
Expected: no `components:` slug-mismatch errors (every DB slug has an entry and vice-versa). Other
files may still be reported missing until Tasks 5–6.
```bash
git add docs/agent-guide/registry/components.yaml
git commit -m "feat(agent-guide): German component descriptions (hub content)"
```

---

## Task 5: tools.yaml — beginner-spine skills + 6 agents

**Files:**
- Create: `docs/agent-guide/registry/tools.yaml`

- [ ] **Step 1: Author `docs/agent-guide/registry/tools.yaml`** with one entry per item below.
Follow the worked exemplar exactly for tone/fields (Du-form, jargon in parentheses). Every entry
needs all required fields; `danger` ∈ taxonomy ids; `guardrails` ∈ guardrail ids.

**Tools to include (ids):** `dev-flow-plan`, `dev-flow-execute`, `dev-flow-iterate`, `dev-flow-e2e`,
`task-oracle` (kind: task), and the six agents `agent-website`, `agent-ops`, `agent-infra`,
`agent-test`, `agent-db`, `agent-security` (kind: agent).

Worked exemplars (use verbatim; author the remaining entries to the same standard):
```yaml
- id: dev-flow-plan
  name_de: "Planungs-Skill (dev-flow-plan)"
  kind: skill
  summary_de: "Der Startpunkt für jede Änderung: wählt den Pfad und schreibt einen Plan."
  what_for_de: "Hilft dir zu entscheiden, ob etwas ein Feature, ein Fix oder eine Wartung (Chore) ist, denkt das Vorhaben mit dir durch und schreibt einen Plan. Setzt nichts um."
  how_to_start_de: "Beschreibe einfach in eigenen Worten, was du ändern willst – der Skill startet von selbst."
  what_could_go_wrong_de: "Wenig: er stoppt bewusst, bevor Code geschrieben wird. Du bestätigst Design und Plan."
  danger: caution
  guardrails: [G-PULL-FIRST]
  related: [dev-flow-execute]
  links: []
- id: agent-ops
  name_de: "Betriebs-Agent (ops)"
  kind: agent
  summary_de: "Schaut nach, warum etwas nicht läuft – liest Logs und Status, ohne etwas zu verändern."
  what_for_de: "Für Fragen wie 'Warum ist Dienst X rot?' oder 'Läuft alles?'. Liest Pod-Status und Protokolle (Logs)."
  how_to_start_de: "Frag z. B.: 'Warum startet Nextcloud nicht?' oder 'Zeig mir den Status aller Dienste.'"
  what_could_go_wrong_de: "Beim reinen Nachschauen kaum etwas. Vorsicht erst, wenn er etwas neu startet (das ist 🟡)."
  danger: safe
  guardrails: [G-CONTEXT-CHECK]
  related: [agent-infra]
  links: []
```

For the dangerous-runbook awareness, the agents that can trigger destructive flows
(`agent-infra`, `agent-security`, `agent-db`) MUST carry `danger: assisted` and reference
`G-ENV-EXPLICIT` + `G-ASK-EXPERT`; their `what_could_go_wrong_de` must name the concrete footgun
(wrong-ENV deploy, secret overwrite, schema change on both brands).

- [ ] **Step 2: Validate & commit**

Run: `node scripts/agent-guide/validate.mjs`
Expected: no `tools[...]` errors.
```bash
git add docs/agent-guide/registry/tools.yaml
git commit -m "feat(agent-guide): tool + agent reference cards"
```

---

## Task 6: goals.yaml — the "Ich will …" catalog

**Files:**
- Create: `docs/agent-guide/registry/goals.yaml`

- [ ] **Step 1: Author `docs/agent-guide/registry/goals.yaml`.** One entry per intent below; every
`flow[].tool` MUST be a tool id from Task 5; `danger` from taxonomy; `guardrails` from the catalog.

**Goals to include (ids → tier):** `website-text-aendern` (safe), `dienst-status-pruefen` (safe),
`bug-beheben` (caution), `feature-bauen` (caution), `aenderung-ausrollen` (assisted),
`datenbank-aendern` (assisted), `secret-aendern` (forbidden), `cluster-neu-aufsetzen` (forbidden).

Worked exemplars (use verbatim; author the rest to the same standard):
```yaml
- id: bug-beheben
  title_de: "Ich will einen Fehler beheben"
  when_de: "Etwas funktioniert nicht so, wie es soll."
  flow:
    - tool: dev-flow-plan
      note_de: "Beschreibe den Fehler; der Skill legt einen Fix-Branch an und schreibt zuerst einen Test, der den Fehler zeigt."
    - tool: dev-flow-execute
      note_de: "Setzt den Plan um, öffnet einen Pull Request und bringt die Korrektur live."
  example_prompt_de: "Auf web.mentolder.de tut der Login-Knopf nichts. Bitte finde die Ursache und behebe sie."
  danger: caution
  guardrails: [G-PULL-FIRST, G-PR-NOT-MAIN]
  related: [feature-bauen]
- id: secret-aendern
  title_de: "Ich will ein Passwort oder Geheimnis ändern"
  when_de: "Ein Datenbank-Passwort, API-Schlüssel oder Zertifikat muss rotiert werden."
  flow:
    - tool: agent-security
      note_de: "🔴 Diese Aufgabe hat eine strenge Reihenfolge. Falsch gemacht, werden Produktiv-Zugangsdaten überschrieben."
  example_prompt_de: "Bitte NICHT allein ausführen – zuerst Patrick fragen. (Rotation des shared-db-Passworts.)"
  danger: forbidden
  guardrails: [G-SECRET-ORDER, G-ASK-EXPERT]
  related: []
```

- [ ] **Step 2: Validate the FULL registry & commit**

Run: `node scripts/agent-guide/validate.mjs`
Expected: `✓ agent-guide registry valid` (all five files now present; all cross-refs + DB slugs OK).
```bash
git add docs/agent-guide/registry/goals.yaml
git commit -m "feat(agent-guide): goal/intent catalog (Ich will ...)"
```

---

## Task 7: Generator — components.yaml → generated JSON (TDD)

**Files:**
- Create: `scripts/gen-platform-descriptions.mjs`, `scripts/agent-guide/gen.test.mjs`,
  `website/src/lib/platform-descriptions.generated.json`

- [ ] **Step 1: Write the failing test `scripts/agent-guide/gen.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDescriptions } from '../gen-platform-descriptions.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('buildDescriptions maps every component slug to {de, en} by kind', () => {
  const out = buildDescriptions(join(repoRoot, 'docs', 'agent-guide', 'registry', 'components.yaml'));
  assert.ok(out.software.keycloak, 'keycloak present in software');
  assert.equal(typeof out.software.keycloak.de, 'string');
  assert.equal(out.software.keycloak.en, 'SSO / OIDC identity provider');
  assert.ok(out.hardware['pk-hetzner-4'], 'pk-hetzner-4 present in hardware');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/agent-guide/gen.test.mjs`
Expected: FAIL — `Cannot find module '../gen-platform-descriptions.mjs'`.

- [ ] **Step 3: Implement `scripts/gen-platform-descriptions.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export function buildDescriptions(componentsPath) {
  const components = parse(readFileSync(componentsPath, 'utf8')) ?? [];
  const out = { software: {}, hardware: {} };
  for (const c of components) {
    out[c.kind][c.slug] = { de: c.summary_de, en: c.placeholder_en };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const out = buildDescriptions(join(repoRoot, 'docs', 'agent-guide', 'registry', 'components.yaml'));
  const target = join(repoRoot, 'website', 'src', 'lib', 'platform-descriptions.generated.json');
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`✓ wrote ${target}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/agent-guide/gen.test.mjs`
Expected: PASS.

- [ ] **Step 5: Generate the committed JSON & run the full guide task**

```bash
node scripts/gen-platform-descriptions.mjs
task test:agent-guide
```
Expected: `task test:agent-guide` PASSES end-to-end (unit tests + real-registry validate + generated-JSON freshness git-diff clean).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-platform-descriptions.mjs scripts/agent-guide/gen.test.mjs website/src/lib/platform-descriptions.generated.json
git commit -m "feat(agent-guide): generator + generated platform descriptions JSON"
```

---

## Task 8: ensurePlatformSchema + guarded German seed (TDD, vitest + pg-mem)

**Files:**
- Create: `website/src/lib/platform-db.ensure.test.ts`
- Modify: `website/src/lib/platform-db.ts`

- [ ] **Step 1: Write the failing test `website/src/lib/platform-db.ensure.test.ts`**

Mirrors the harness in `website/src/lib/website-db-init-hotpath.test.ts` (pg-mem via `vi.mock('pg')`,
swallow + count the production CREATE DDL pg-mem can't run, execute the UPDATEs for real).

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('pg', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();
  // Simplified platform tables (pg-mem can't do uuid/array/timestamptz DDL); seed
  // one English-placeholder row and one admin-customised row per table.
  mem.public.none(`
    CREATE SCHEMA platform;
    CREATE TABLE platform.software_assets (slug text PRIMARY KEY, name text, description text, updated_at timestamptz);
    CREATE TABLE platform.hardware_assets (slug text PRIMARY KEY, name text, description text);
    INSERT INTO platform.software_assets (slug, name, description) VALUES
      ('keycloak', 'Keycloak', 'SSO / OIDC identity provider'),
      ('website',  'Website',  'Mein eigener Text');
    INSERT INTO platform.hardware_assets (slug, name, description) VALUES
      ('pk-hetzner-4', 'PK CP 1', NULL);
  `);
  const { Pool: MemPool } = mem.adapters.createPg();
  function isPlatformCreateDdl(sql: string): boolean {
    const s = sql.toLowerCase();
    return s.includes('create') && (s.includes('platform.software_assets') || s.includes('platform.hardware_assets') || s.includes('schema platform') || s.includes('schema if not exists platform'));
  }
  class CountingPool extends (MemPool as unknown as new (...a: unknown[]) => { query(t: unknown, v?: unknown): Promise<unknown> }) {
    static platformCreateDdlCount = 0;
    async query(textOrConfig: unknown, values?: unknown): Promise<unknown> {
      const sql = typeof textOrConfig === 'string' ? textOrConfig : (textOrConfig as { text?: string })?.text ?? '';
      if (isPlatformCreateDdl(sql)) { CountingPool.platformCreateDdlCount += 1; return { rows: [], rowCount: 0 }; }
      return super.query(textOrConfig, values);
    }
  }
  return { default: { Pool: CountingPool }, Pool: CountingPool };
});
vi.mock('./tickets-db', () => ({ initTicketsSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./tickets/transition', () => ({ transitionTicket: vi.fn().mockResolvedValue(undefined) }));

import { listSoftwareAssets, listHardwareAssets } from './platform-db';
import { pool, __resetSchemaInitCacheForTests } from './website-db';
const CountingPool = (pool as unknown as { constructor: { platformCreateDdlCount: number } }).constructor;

describe('ensurePlatformSchema seeds German descriptions safely', () => {
  beforeEach(() => { CountingPool.platformCreateDdlCount = 0; __resetSchemaInitCacheForTests(); });

  it('replaces the English placeholder with German but never an admin edit', async () => {
    const sw = await listSoftwareAssets();
    const byslug = Object.fromEntries(sw.map((r) => [r.slug, r.description]));
    expect(byslug.keycloak).toMatch(/Anmeldung/);          // placeholder → German
    expect(byslug.website).toBe('Mein eigener Text');       // admin edit untouched
  });

  it('fills NULL hardware descriptions with German', async () => {
    const hw = await listHardwareAssets();
    expect(hw.find((r) => r.slug === 'pk-hetzner-4')?.description).toMatch(/Fleet/);
  });

  it('runs the platform CREATE DDL only on the first call, not on subsequent ones', async () => {
    await listSoftwareAssets();
    const afterFirst = CountingPool.platformCreateDdlCount; // the single ensure run emits its CREATEs once
    expect(afterFirst).toBeGreaterThan(0);
    await listHardwareAssets();
    await listSoftwareAssets();
    expect(CountingPool.platformCreateDdlCount).toBe(afterFirst); // ensureSchemaOnce → no re-run
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd website && npm run test:unit -- platform-db.ensure`
Expected: FAIL — descriptions unchanged (no `ensurePlatformSchema` yet); German assertions fail.

- [ ] **Step 3: Implement in `website/src/lib/platform-db.ts`**

At the top, after the existing `import { pool } from './website-db';`:
```ts
import { ensureSchemaOnce } from './website-db';
import platformDescriptions from './platform-descriptions.generated.json';
```

Add before `listSoftwareAssets`:
```ts
// Idempotent platform-schema bootstrap + guarded German description seed.
// DDL mirrors website/src/db/migrations/20260521_create_platform_assets.sql so the
// tables are reproducible on a fresh DB. Descriptions are set ONLY where still NULL
// or the known English placeholder — never overwriting an admin edit. Wrapped in
// ensureSchemaOnce so it runs at most once per process (see website-db.ts T000304).
export async function runPlatformSchema(db: { query: typeof pool.query } = pool): Promise<void> {
  await db.query(`CREATE SCHEMA IF NOT EXISTS platform`);
  await db.query(`CREATE TABLE IF NOT EXISTS platform.software_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    description TEXT, category TEXT NOT NULL DEFAULT 'other', emoji TEXT NOT NULL DEFAULT '📦',
    clusters TEXT[] NOT NULL DEFAULT '{}', namespace TEXT, deployment_name TEXT, image_tag TEXT,
    url TEXT, base_status TEXT NOT NULL DEFAULT 'live', sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS platform.hardware_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    description TEXT, role TEXT NOT NULL DEFAULT 'unknown', cluster TEXT NOT NULL DEFAULT 'both',
    location TEXT, ip TEXT, os TEXT, k8s_node_name TEXT NOT NULL DEFAULT '', sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  for (const [slug, { de, en }] of Object.entries(platformDescriptions.software)) {
    await db.query(
      `UPDATE platform.software_assets SET description = $1, updated_at = now()
       WHERE slug = $2 AND (description IS NULL OR description = $3)`,
      [de, slug, en],
    );
  }
  for (const [slug, { de, en }] of Object.entries(platformDescriptions.hardware)) {
    await db.query(
      `UPDATE platform.hardware_assets SET description = $1
       WHERE slug = $2 AND (description IS NULL OR description = $3)`,
      [de, slug, en],
    );
  }
}

export function ensurePlatformSchema(): Promise<void> {
  return ensureSchemaOnce('platform-schema', () => runPlatformSchema(pool));
}
```

Then prepend `await ensurePlatformSchema();` as the first line of BOTH `listSoftwareAssets()` and
`listHardwareAssets()` (before their existing `pool.query`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd website && npm run test:unit -- platform-db.ensure`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check & commit**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | tail -5` (JSON import must resolve;
`tsconfig`/Astro support default JSON imports — if it complains about the import, add
`"resolveJsonModule": true` to `website/tsconfig.json` `compilerOptions`).
```bash
git add website/src/lib/platform-db.ts website/src/lib/platform-db.ensure.test.ts website/tsconfig.json
git commit -m "feat(agent-guide): ensurePlatformSchema runtime seed of German hub descriptions"
```

---

## Task 9: Full verification

- [ ] **Step 1: Offline suite (gates in CI)**

Run (repo root): `task test:agent-guide && task test:all`
Expected: both PASS. (`test:all` now includes `test:agent-guide`.)

- [ ] **Step 2: Website unit tests (local; mirrors existing un-CI-gated website tests)**

Run: `cd website && npm run test:unit`
Expected: the new `platform-db.ensure` tests PASS (pre-existing website tests unaffected).

- [ ] **Step 3: Validate the real registry one more time**

Run: `node scripts/agent-guide/validate.mjs`
Expected: `✓ agent-guide registry valid`.

- [ ] **Step 4: Final commit (if anything pending)**

```bash
git add -A && git commit -m "chore(agent-guide): F+B verification pass" --allow-empty
```

---

## Risks & data note (read before executing)

1. **Website vitest is NOT in CI's offline-tests job.** `task test:all` runs only BATS + manifest +
   docs-gen, not `vitest`. The Task 8 test therefore runs locally / via `npm run test:unit`, exactly
   like the existing `website-db-init-hotpath.test.ts`. CI gating for F+B comes from `test:agent-guide`
   (validator + generator freshness). Wiring website vitest into CI is out of scope — flag as a
   follow-up chore.
2. **Hardware seed data is stale.** The migration rows label `gekko-*` as mentolder control-plane and
   `pk-*` as korczewski — pre-consolidation. Current fleet truth (CLAUDE.md): `pk-4/6/8` = control-plane,
   `gekko-2/3/4` = workers; `livekit` is pinned to `pk-hetzner-4` (not `gekko-hetzner-3` as `20260522`
   says). `components.yaml.summary_de` describes the CURRENT reality. We only own the `description`
   column in F+B; correcting the stale `role`/`cluster`/livekit-pin columns is a flagged follow-up
   (do NOT silently change non-description columns here).
3. **`placeholder_en` must match the DB verbatim.** The guard only replaces a description equal to the
   exact current English. Re-grep `20260521`/`20260522` and confirm every `placeholder_en` before
   committing Task 4 (especially `arena-server`, whose seed description differs from `mcp`).
4. **pg-mem DDL limits.** The Task 8 harness pre-creates simplified tables and swallows the real CREATE
   DDL (uuid/array/timestamptz) — identical strategy to the existing hotpath test. The UPDATE guard is
   what we behaviorally assert.
