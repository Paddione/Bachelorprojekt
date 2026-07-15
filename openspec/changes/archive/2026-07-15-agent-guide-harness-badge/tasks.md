---
title: "agent-guide-harness-badge — Implementation Plan"
ticket_id: T001612
domains: [website, sidekick]
status: archived
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-guide-harness-badge — Implementation Plan

_Ticket: T001612_

Reicht das seit T001611 in der Registry (`docs/agent-guide/registry/tools.yaml`) gepflegte
`harness`-Feld (`claude`/`opencode`/`both`) bis in die Agent-Anleitung-Sidekick-UI durch:
Emitter → Typ → Suchindex → Badge + Filter, und macht die Init-Prompt-Sektion in
`GuideCard.svelte` harness-bewusst. Alle 9 Design-Entscheidungen der Spec
(`docs/superpowers/specs/2026-07-09-agent-guide-harness-badge-design.md`, Abschnitt
"Angenommene Entscheidungen") sind bindend — insbesondere: Badge nur bei `claude`/`opencode`
(nicht `both`), Filter set-basiert mit zwei Buttons, Harness ist ein reines Tool-Attribut
(Ziele bleiben ungefiltert).

## File Structure

```
scripts/agent-guide/emit-webapp.mjs                                  (geändert) — harness-Projektion in tools.map(), Fallback 'both'
scripts/agent-guide/emit-webapp.test.mjs                             (geändert) — 2 Tests: harness durchgereicht + Fallback 'both'
website/src/lib/agentGuide.ts                                        (geändert) — Tool-Interface: harness-Feld
website/src/lib/agentGuideSearch.ts                                  (geändert) — GuideEntry.harness (optional) + buildEntries() setzt es für Tools
website/src/lib/agentGuideSearch.test.ts                             (geändert) — Test: Tool-Entry trägt harness, Goal-Entry undefined
website/src/components/assistant/agent-guide/GuideFindBar.svelte     (geändert) — Harness-Filter-Rail + 3 neue Props
website/src/components/assistant/AgentGuideView.svelte               (geändert) — harnessFilter-State, harnessCounts, preFiltered-Prädikat, Wiring
website/src/components/assistant/agent-guide/GuideCard.svelte        (geändert) — Harness-Badge im Card-Head + harness-bewusstes Init-Prompt-Label
tests/e2e/specs/agent-guide-walkthrough.spec.ts                      (geändert) — 5 E2E-Szenarien: Badge (2), Filter (1), Label (2)
tests/e2e/lib/agent-guide.ts                                         (geändert) — Tool-Interface (E2E) um optionales harness ergänzen
```

### S1-Budget-Check (alle Dateien `nicht-baselined` → wirksame Schwelle = statisches Extension-Limit)

Restbudget = Ext-Limit − Ist-Zeilen. Alle Dateien liegen weit unter Limit; kein geschätzter
Zuwachs (max ~+45 Zeilen in der E2E-Spec) kommt einer Schwelle nahe.

| `Datei` | Ist | Restbudget |
|---|---|---|
| `scripts/agent-guide/emit-webapp.mjs` | 201 | 299 |
| `scripts/agent-guide/emit-webapp.test.mjs` | 334 | 166 |
| `website/src/lib/agentGuide.ts` | 184 | 416 |
| `website/src/lib/agentGuideSearch.ts` | 209 | 391 |
| `website/src/lib/agentGuideSearch.test.ts` | 165 | 435 |
| `website/src/components/assistant/agent-guide/GuideFindBar.svelte` | 94 | 406 |
| `website/src/components/assistant/AgentGuideView.svelte` | 367 | 133 |
| `website/src/components/assistant/agent-guide/GuideCard.svelte` | 344 | 156 |
| `tests/e2e/specs/agent-guide-walkthrough.spec.ts` | 193 | 407 |
| `tests/e2e/lib/agent-guide.ts` | 218 | 382 |

Ext-Limits: `.ts`/`.js`/`.mjs`-Regeln — `.mjs`/`.svelte`/`.sh` = 500, `.ts`/`.js` = 600
(`gates.yaml` → `s1.limits`). Die engste Datei ist `AgentGuideView.svelte` (Restbudget 133,
geschätzter Zuwachs ~+14 → ~381/500, unter 80 %) → kein Modul-Split eingeplant. Keine
Baseline-Einträge werden hinzugefügt (alle Dateien bleiben nicht-baselined, unter Limit).

### Weitere Gate-Bestätigungen (vorab)

- **S3 (Brand-Domains):** Dieser Change enthält keine `*.mentolder.de`/`*.korczewski.de`-Literale
  in `website/src/**` oder `k3d/`/`prod*/`. Bestätigt — kein Domain-String in irgendeinem Snippet.
- **CQ02 (`any`-Typen):** Kein neuer `: any`/`<any>`/`as any` wird eingeführt. Alle neuen Felder
  sind als String-Union (`'claude' | 'opencode' | 'both'`) typisiert.
- **S2 (Import-Zyklen):** Keine neuen Modul-Imports zwischen den Schichten — nur bestehende
  `agentGuide` → `agentGuideSearch`-Richtung, keine Rück-Importe.
- **S4 (Orphans):** Keine neuen Dateien; alle geänderten Dateien sind bereits verdrahtet.

---

## Task 1 — Emitter reicht `harness` mit Fallback `both` durch (RED → GREEN)

**Ziel:** `emit-webapp.mjs` projiziert `harness` in jedes Tool-Objekt der generierten JSON.
Deckt Delta-Scenarios _"Harness landet in der generierten Webapp-Datei"_ und
_"Fehlendes Harness-Feld fällt auf 'both' zurück"_ ab.

**Schritt 1.1 (RED) — Failing-Test zuerst.** Ergänze in `scripts/agent-guide/emit-webapp.test.mjs`
(im Task-2-Block, nach dem `kind_de`-Test um Zeile ~151, damit die geteilte Fixture
`__agFixtureRegistry` verfügbar ist) zwei Tests. Die geteilte Fixture setzt für
`agent-website` KEIN `harness`-Feld und für `dev-flow-plan` ebenfalls nicht — ergänze in
`fixtureRegistry()` (Datei-Kopf) für `dev-flow-plan` ein `  harness: opencode` (eine Zeile,
direkt vor `init_prompt_de:`), damit ein gesetzter und ein fehlender Fall existieren:

```js
test('buildWebappData: projiziert harness pro Tool (gesetzt) und faellt sonst auf "both" zurueck', () => {
  const data = buildWebappData(fixtureRegistry2());
  const byId = Object.fromEntries(data.tools.map(t => [t.id, t]));
  // dev-flow-plan hat harness: opencode in der Fixture → wird uebernommen
  assert.equal(byId['dev-flow-plan'].harness, 'opencode');
  // agent-website hat KEIN harness-Feld → Fallback 'both'
  assert.equal(byId['agent-website'].harness, 'both');
});
```

Lauf `node --test scripts/agent-guide/emit-webapp.test.mjs` → der neue Test schlägt fehl,
weil `emit-webapp.mjs` das Feld noch nicht projiziert (`byId['dev-flow-plan'].harness` ist
`undefined`). **expected: FAIL** (rot).

> Hinweis: Die `fixtureRegistryThemed()`-Neuautorisierung der Tools (ab Zeile ~183) überschreibt
> `tools.yaml` ohne `harness` → dort greift korrekt der `both`-Fallback für beide Tools; der
> Assertions-Block oben nutzt bewusst `fixtureRegistry2` (die Basis-Fixture mit dem gesetzten
> `harness: opencode` auf `dev-flow-plan`), damit beide Zweige geprüft werden.

**Schritt 1.2 (GREEN) — Projektion implementieren.** In `scripts/agent-guide/emit-webapp.mjs`,
`reg.tools.map(t => ({ … }))` (aktuell Zeile ~71–91), eine Zeile ergänzen — vor `stages`:

```js
    harness: t.harness ?? 'both',
```

`validate.mjs` erlaubt `harness` als optional; der Nullish-Fallback macht den Emitter robust
gegen künftig fehlende Felder (Design-Annahme #3). Test aus 1.1 wird grün.

**Assertion-Konsistenz-Check:** Der Test erwartet `'opencode'` für das Tool mit gesetztem Feld
und `'both'` für das ohne — exakt das Verhalten von `t.harness ?? 'both'`. ✔

---

## Task 2 — Typ + Suchindex: `harness` auf Tool-Entries

**Ziel:** `harness` im `Tool`-Typ verfügbar machen und im Suchindex nur für Tool-Entries setzen.
Deckt Delta-Scenario _"Ziel-Einträge tragen kein Harness-Attribut"_ (inkl. der `AND`-Klausel:
Tool-Entry trägt `harness: "claude"`) ab.

**Schritt 2.1 — `Tool`-Interface erweitern.** In `website/src/lib/agentGuide.ts`, im
`export interface Tool` (Zeile 63–83), nach `stages: string[];` ergänzen:

```ts
  harness: 'claude' | 'opencode' | 'both';
```

Nicht-optional, weil der Emitter (Task 1) das Feld für jedes Tool garantiert (Fallback `both`).

**Schritt 2.2 — `GuideEntry`-Interface + `buildEntries()`.** In
`website/src/lib/agentGuideSearch.ts`:

- Im `export interface GuideEntry` (Zeile 6–24), nach `stages: string[];` ergänzen:

```ts
  harness?: 'claude' | 'opencode' | 'both';   // nur auf Tool-Entries; undefined bei Goals
```

  Optional, weil Goal-Entries kein Harness tragen (Design-Annahme #2).

- In `buildEntries()`, im `toolEntries`-Map-Callback (Zeile 79–90), ins zurückgegebene Objekt
  (z.B. direkt nach `stages: t.stages ?? [],`) ergänzen:

```ts
      harness: t.harness,
```

  Der `goalEntries`-Zweig (Zeile 70–78) bleibt **unverändert** → Goal-Entries haben `harness`
  implizit `undefined`.

**Schritt 2.3 — Unit-Test erweitern.** In `website/src/lib/agentGuideSearch.test.ts`, im
bestehenden `describe('buildEntries', …)` (ab Zeile 21) einen Test ergänzen:

```ts
  it('setzt harness nur auf Tool-Entries, laesst es bei Goals undefined', () => {
    const goalE = ALL.find(e => e.kind === 'goal')!;
    const toolE = ALL.find(e => e.id === 'dev-flow-plan')!;   // harness: 'claude' in der Registry
    expect(goalE.harness).toBeUndefined();
    expect(toolE.harness).toBe('claude');
  });
```

`dev-flow-plan` ist in `tools.yaml` mit `harness: claude` getaggt → die Assertion `'claude'`
passt zum realen Registry-Wert (via `agent-guide.generated.json`, das nach Task 1 das Feld führt).

**Assertion-Konsistenz-Check:** `toolE.harness === 'claude'` setzt voraus, dass Task 1 die
Projektion liefert und `dev-flow-plan` `harness: claude` trägt (verifiziert in der Registry).
`goalE.harness` bleibt `undefined`, da `buildEntries()` das Feld im Goal-Zweig nicht setzt. ✔

<!-- vitest: agentGuide.ts-Änderung ist rein additiv am Interface (kein Laufzeit-Logik-Zweig),
     abgedeckt durch den bestehenden generated-json-Import + den neuen buildEntries-Test in
     agentGuideSearch.test.ts. -->

---

## Task 3 — `GuideFindBar.svelte`: Harness-Filter-Rail

**Ziel:** Zwei feste Toggle-Buttons ("Claude Code" / "opencode") analog zur Tier-Rail; drei neue
Props durchreichen. Keine dritte Achse, kein `both`-Button (Design-Annahmen #5, #6).

**Schritt 3.1 — Props ergänzen.** Im `$props()`-Block (Zeile 5–33) drei neue Props hinzufügen
(sowohl in der Destrukturierung als auch im Typ-Objekt):

```ts
    harnessFilter,
    harnessCounts,
    onToggleHarness,
```

im Typ-Objekt:

```ts
    harnessFilter: Set<string>;
    harnessCounts: Record<string, number>;
    onToggleHarness: (id: string) => void;
```

**Schritt 3.2 — Feste Harness-Liste.** Im `<script>` neben `AXES` (Zeile 35–39) ergänzen:

```ts
  const HARNESSES: { id: string; label: string }[] = [
    { id: 'claude', label: 'Claude Code' },
    { id: 'opencode', label: 'opencode' },
  ];
```

**Schritt 3.3 — Rail rendern.** Direkt nach der `ag-tier-rail`-`<ul>` (nach Zeile 61) eine
zweite Rail einfügen — analog aufgebaut, aber über `HARNESSES` iterierend statt über eine
Taxonomie:

```svelte
  <!-- Harness-filter rail: zwei feste Buttons (Claude Code / opencode) -->
  <ul class="ag-harness-rail" aria-label="Nach Werkzeugumgebung filtern">
    {#each HARNESSES as h (h.id)}
      <li>
        <button
          type="button"
          class="ag-harness-toggle"
          class:on={harnessFilter.has(h.id)}
          aria-pressed={harnessFilter.has(h.id)}
          onclick={() => onToggleHarness(h.id)}
        >
          <span class="ag-harness-toggle-label">{h.label}</span>
          <span class="ag-harness-toggle-count">{harnessCounts[h.id] ?? 0}</span>
        </button>
      </li>
    {/each}
  </ul>
```

**Schritt 3.4 — Styles.** Im `<style>`-Block (falls vorhanden; sonst am Dateiende) knappe
Regeln für `.ag-harness-rail` / `.ag-harness-toggle` / `.ag-harness-toggle.on` analog zu den
bestehenden `.ag-tier-*`-Regeln ergänzen (Flex-Row, Toggle-Optik, aktiver Zustand). Keine neuen
Farbvariablen nötig — neutraler Akzent genügt, da Harness keine Gefahrenstufe kodiert.

---

## Task 4 — `AgentGuideView.svelte`: State, Counts, Filter-Prädikat, Wiring

**Ziel:** `harnessFilter`-State, `harnessCounts`-Derivation, Einbindung ins `preFiltered`-Prädikat
und Weiterreichen an `GuideFindBar`. `both`-Tools bleiben bei jedem Filter sichtbar; Ziel-Karten
werden nie ausgeblendet.

**Schritt 4.1 — State.** Nach `tierFilter` (Zeile 77) ergänzen:

```ts
  let harnessFilter = $state(new Set<string>());        // empty = all (Claude + opencode)
```

**Schritt 4.2 — `preFiltered`-Prädikat.** Die `preFiltered`-Derivation (Zeile 128–134) um die
Harness-Klausel erweitern (als weitere `&&`-Bedingung im Filter-Prädikat):

```ts
  const preFiltered = $derived(
    ALL.filter(e =>
      (allowedByMap === null || allowedByMap.has(e.id)) &&
      (domainFilter === null || e.theme === domainFilter) &&
      (tierFilter.size === 0 || tierFilter.has(e.danger)) &&
      (harnessFilter.size === 0 || e.harness === undefined || e.harness === 'both' || harnessFilter.has(e.harness)),
    ),
  );
```

`e.harness === undefined` hält alle Ziel-Karten sichtbar; `e.harness === 'both'` hält
harness-übergreifende Tools bei jedem aktiven Filter sichtbar (Design-Annahme #5).

**Schritt 4.3 — `harnessCounts`-Derivation.** Analog zu `tierCounts` (Zeile 149–155), aber über
die zwei festen Werte; `both`-Tools zählen in BEIDE Counts, da sie bei jedem Filter sichtbar
bleiben:

```ts
  // Harness-Zaehlung ueber den domain+text-gefilterten Satz (unabhaengig vom Harness-Filter).
  const harnessCounts = $derived.by(() => {
    const base = filterEntries(ALL.filter(e => domainFilter === null || e.theme === domainFilter), query);
    const counts: Record<string, number> = { claude: 0, opencode: 0 };
    for (const e of base) {
      if (e.harness === 'claude' || e.harness === 'both') counts.claude++;
      if (e.harness === 'opencode' || e.harness === 'both') counts.opencode++;
    }
    return counts;
  });
```

Ziel-Entries (`harness === undefined`) zählen in keinen der beiden Werte — korrekt, da Ziele
nicht harness-gefiltert werden.

**Schritt 4.4 — Wiring.** Der `<GuideFindBar … />`-Aufruf (Zeile 278–285) bekommt die drei
neuen Props (Toggle-Handler analog zu `onToggleTier`, Zeile 283):

```svelte
  <GuideFindBar
    {taxonomy} {themes} {tierCounts} {query} {axis} {tierFilter} {domainFilter}
    {harnessFilter} {harnessCounts}
    {resultCount} {searching}
    onQuery={(v) => (query = v)}
    onAxis={(a) => (axis = a)}
    onToggleTier={(id) => { const n = new Set(tierFilter); if (n.has(id)) n.delete(id); else n.add(id); tierFilter = n; }}
    onToggleHarness={(id) => { const n = new Set(harnessFilter); if (n.has(id)) n.delete(id); else n.add(id); harnessFilter = n; }}
    onToggleDomain={(id) => (domainFilter = id)}
  />
```

Die Schnellstart-Leiste (Zeile 292–310) bleibt unverändert (Design-Annahme #7).

---

## Task 5 — `GuideCard.svelte`: Harness-Badge + harness-bewusstes Init-Prompt-Label

**Ziel:** Badge nur bei `claude`/`opencode` (nicht `both`) im Card-Head; Init-Prompt-Sektion
harness-bewusst beschriftet (Design-Annahme #8). Deckt E2E-Scenarios in Task 6 vor.

**Schritt 5.1 — Label-Helper.** Im `<script>` (nach den bestehenden `$derived`, um Zeile ~91)
eine reine Helper-Funktion ergänzen — keine tief verschachtelte Inline-Ternary im Template:

```ts
  function initPromptLabel(harness: string | undefined): string {
    if (harness === 'claude') return 'In Claude Code einfügen';
    if (harness === 'opencode') return 'In opencode einfügen';
    return 'Prompt einfügen';   // 'both' | undefined → harness-neutral
  }
```

**Schritt 5.2 — Badge im Card-Head.** Im `ag-card-head`-Button (Zeile 101–121), neben
`<span class="ag-meta">…</span>` (Zeile 118), ein Badge ergänzen — nur für Tool-Entries mit
genau einem Harness:

```svelte
    {#if tool && (tool.harness === 'claude' || tool.harness === 'opencode')}
      <span class="ag-harness-badge">{tool.harness === 'claude' ? 'Claude Code' : 'opencode'}</span>
    {/if}
```

Bei `tool.harness === 'both'` oder Ziel-Karten (`tool` ist `undefined`) rendert kein Badge
(Design-Annahme #4).

**Schritt 5.3 — Init-Prompt-Sektion harness-bewusst.** Im Tool-Zweig (Zeile 226–234) beide
hartcodierten `"In Claude Code einfügen"`-Strings (Zeile 227 Überschrift + Zeile 231
Button-Text) durch den Helper ersetzen:

```svelte
        {#if tool!.init_prompt_de}
          <p class="ag-label">{initPromptLabel(tool!.harness)}</p>
          <div class="ag-prompt ag-prompt-init">
            <code class="ag-prompt-text">{tool!.init_prompt_de}</code>
            <button class="ag-copy" onclick={() => onCopy(`${entry.id}::init`, tool!.init_prompt_de!)}>
              {copiedId === `${entry.id}::init` ? 'Kopiert ✓' : initPromptLabel(tool!.harness)}
            </button>
          </div>
        {/if}
```

Der Copy-Bestätigungstext (`Kopiert ✓`) bleibt kurz und harness-neutral (Design-Annahme #8).

**Schritt 5.4 — Badge-Styles.** Knappe `.ag-harness-badge`-Regel im `<style>` ergänzen (kleines
Pill neben `.ag-meta`, neutraler Rahmen/Hintergrund; kein tier-Farbcode).

**Assertion-Konsistenz-Check:** `initPromptLabel('claude')` → `"In Claude Code einfügen"`
(E2E-Scenario "Claude-Skill behält Beschriftung"); `('opencode')` → `"In opencode einfügen"`
(Scenario "opencode-Skill zeigt opencode-Label"); `('both')` → `"Prompt einfügen"` (Scenario
"Harness-übergreifendes Tool zeigt harness-neutrales Label"). ✔

---

## Task 6 — E2E: Badge-, Filter- und Label-Szenarien

**Ziel:** Die 5 mit `*(E2E)*` markierten Delta-Scenarios abdecken. Bestehende Spec-Datei
erweitern (keine neue E2E-Datei anlegen).

**Schritt 6.1 — E2E-Lib-Typ ergänzen.** In `tests/e2e/lib/agent-guide.ts`, im `Tool`-Interface
(Zeile 65–85) nach `init_prompt_de?: string;` ergänzen:

```ts
  harness?: 'claude' | 'opencode' | 'both';
```

Damit können die Specs `tools.find(...)` typsicher auf `harness` prüfen.

**Schritt 6.2 — Szenarien anhängen.** In `tests/e2e/specs/agent-guide-walkthrough.spec.ts` fünf
`test(...)`-Blöcke ergänzen (vor dem `if (FILM)`-Block). Reale Registry-IDs:
`opencode-flow-plan` (harness `opencode`), `dev-flow-plan` (harness `claude`),
`agent-website` (harness `both`). Selektoren: `.ag-harness-badge`, `.ag-harness-toggle`.

```ts
test('Harness-Badge: opencode-Tool zeigt Badge, both-Tool nicht', async ({ page }) => {
  await openAgentGuide(page);
  const oc = tools.find(t => t.id === 'opencode-flow-plan')!;
  const both = tools.find(t => t.id === 'agent-website')!;
  const ocCard = page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: oc.name_de }) }).first();
  await expect(ocCard.locator('.ag-harness-badge')).toHaveText('opencode');
  const bothCard = page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: both.name_de }) }).first();
  await expect(bothCard.locator('.ag-harness-badge')).toHaveCount(0);
});

test('Harness-Filter auf "opencode" versteckt Claude-Tools, laesst Ziele + both', async ({ page }) => {
  await openAgentGuide(page);
  const claudeTool = tools.find(t => t.id === 'dev-flow-plan')!;
  const ocTool = tools.find(t => t.id === 'opencode-flow-plan')!;
  const bothTool = tools.find(t => t.id === 'agent-website')!;
  await page.locator('.ag-harness-toggle', { hasText: 'opencode' }).click();
  await expect(page.locator('.ag-name', { hasText: claudeTool.name_de })).toHaveCount(0);
  await expect(page.locator('.ag-name', { hasText: ocTool.name_de }).first()).toBeVisible();
  await expect(page.locator('.ag-name', { hasText: bothTool.name_de }).first()).toBeVisible();
  // mindestens eine Ziel-Karte bleibt sichtbar
  await expect(page.locator('.ag-name', { hasText: goals[0].title_de }).first()).toBeVisible();
});

test('Init-Prompt-Label: opencode-Skill zeigt "In opencode einfügen"', async ({ page }) => {
  await openAgentGuide(page);
  const oc = tools.find(t => t.id === 'opencode-flow-plan')!;
  const card = await expandCardByTitle(page, oc.name_de);
  await expect(card.locator('.ag-prompt-init')).toContainText('In opencode einfügen');
  await expect(card.locator('.ag-prompt-init')).not.toContainText('In Claude Code einfügen');
});

test('Init-Prompt-Label: Claude-Skill behaelt "In Claude Code einfügen"', async ({ page }) => {
  await openAgentGuide(page);
  const cl = tools.find(t => t.id === 'dev-flow-plan')!;
  const card = await expandCardByTitle(page, cl.name_de);
  await expect(card.locator('.ag-prompt-init')).toContainText('In Claude Code einfügen');
});

test('Init-Prompt-Label: both-Tool zeigt harness-neutrales "Prompt einfügen"', async ({ page }) => {
  await openAgentGuide(page);
  const both = tools.find(t => t.id === 'agent-website')!;
  const card = await expandCardByTitle(page, both.name_de);
  await expect(card.locator('.ag-prompt-init')).toContainText('Prompt einfügen');
});
```

> **Risiko/Hinweis:** `agent-website` muss ein `init_prompt_de` tragen, damit die
> `.ag-prompt-init`-Sektion rendert. Falls das `both`-Tool ohne `init_prompt_de` gewählt wird,
> rendert die Sektion nicht → beim Ausführen ein `both`-Tool mit gesetztem `init_prompt_de`
> als Fixture wählen (in der Registry per
> `grep -B12 'init_prompt_de' docs/agent-guide/registry/tools.yaml | grep -E 'id:|harness:'`
> gegenchecken; sonst auf `task-oracle`/`factory` ausweichen). Playwright-Projektzuordnung
> (PR-Config) siehe `.claude/skills/references/dev-flow-gotchas.md`.

---

## Task 7 — Test-Inventar, OpenSpec-Validierung & finale Verifikation

**Schritt 7.1 — Test-Inventar regenerieren.** Nach den Test-Änderungen (Task 1, 2, 6):

```bash
task test:inventory
```

`website/src/data/test-inventory.json` mitcommitten (CI-Inventar-Check failt sonst).

**Schritt 7.2 — OpenSpec validieren.** Muss grün sein vor dem Commit:

```bash
task test:openspec   # bzw. bash scripts/openspec.sh validate
```

**Schritt 7.3 — Finale Verifikation.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`freshness:regenerate` aktualisiert die generierten Artefakte (u.a.
`website/src/lib/agent-guide.generated.json` via `emit-webapp.mjs`, sodass `harness` real in der
JSON landet — Voraussetzung für die E2E-Läufe und den `agentGuideSearch.test.ts`-Wert `'claude'`);
`freshness:check` fährt den S1–S4-Ratchet + Baseline-Key-Count-Assertion und muss grün sein.
