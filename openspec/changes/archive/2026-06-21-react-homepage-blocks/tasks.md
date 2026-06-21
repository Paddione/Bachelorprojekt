---
title: "React Homepage Block-System (P1 — block-getriebenes Rendering, Null-Diff)"
ticket_id: T001056
domains: [website]
status: completed
---

# react-homepage-blocks — Implementation Plan

## File Structure

```
mentolder-web/
  package.json                              # ändern: vitest/RTL devDeps + "test"-Script
  vitest.config.ts                          # neu: vitest-Config (jsdom, @-Alias, svgr-Mock)
  tsconfig.app.json                         # ändern: vitest/jest-dom Typen + setup-Include
  src/
    test/
      setup.ts                              # neu: RTL jest-dom matchers + svgr/?react-Mock
      smoke.test.tsx                        # neu (T1): erster roter Smoke-Test
    blocks/
      schema.ts                             # neu (T2): Zod-Union + HomepageBlocksDocument + SCHEMA_VERSION
      schema.test.ts                        # neu (T2): Zod-Round-Trip (rot zuerst)
      seed.ts                               # neu (T3): committetes HomepageBlocksDocument (heutiger Content)
      seed.test.ts                          # neu (T3): Seed-validiert-gegen-Schema (rot zuerst)
      BlockRenderer.tsx                     # neu (T5): type→Komponente, Zod-Validierung, fail-closed-to-seed
      BlockRenderer.test.tsx                # neu (T5): Mismatch→Seed-Fallback (rot zuerst)
      hero/HeroBlock.tsx                    # neu (T4): präsentational, props-only
      hero/HeroBlock.test.tsx               # neu (T4): Render-Snapshot (rot zuerst)
      stats/StatsBlock.tsx                  # neu (T4)
      stats/StatsBlock.test.tsx             # neu (T4)
      services/ServicesBlock.tsx            # neu (T4): headline/subheadline + ServiceRow
      services/ServicesBlock.test.tsx       # neu (T4)
      whyMe/WhyMeBlock.tsx                  # neu (T4): NET-NEW (heute nur inline)
      whyMe/WhyMeBlock.test.tsx             # neu (T4)
      process/ProcessBlock.tsx             # neu (T4): NET-NEW (heute nur inline)
      process/ProcessBlock.test.tsx         # neu (T4)
      faq/FaqBlock.tsx                      # neu (T4): eyebrow/headline + FAQ
      faq/FaqBlock.test.tsx                 # neu (T4)
      cta/CtaBlock.tsx                      # neu (T4): CallToAction-Hülle
      cta/CtaBlock.test.tsx                 # neu (T4)
    pages/
      HomePage.tsx                          # ändern (T6): rendert via BlockRenderer+Seed, Inline raus
      HomePage.test.tsx                     # neu (T6): Null-Diff-Snapshot der ganzen Seite
tests/spec/react-homepage-blocks.bats       # neu (T7): OpenSpec-Capability-Kontrakt-Smoke
openspec/changes/react-homepage-blocks/
  proposal.md                               # neu: Why/What (knapp) — Skeleton-Pflicht für openspec:apply/archive
  tasks.md                                  # neu: = dieser committete Plan (plan_ref der Spec zeigt hierher)
  .ticket                                   # neu: enthält T001056
  specs/react-homepage-blocks.md            # neu: OpenSpec-Delta (ADDED Requirements)
website/src/data/test-inventory.json        # ändern (T7): regeneriert nach Test-Zuwachs
```

**Hinweis zum OpenSpec-Change-Verzeichnis:** `scripts/openspec.sh validate` verlangt nur
`specs/*.md` mit `## ADDED Requirements` + H3-Requirements. Trotzdem werden `proposal.md`,
`tasks.md` und `.ticket` mitcommittet, weil (a) der Skeleton-Generator
(`task openspec:propose`) sie anlegt, (b) `task openspec:apply <slug>` **hart abbricht**,
wenn `tasks.md` fehlt („not implementable"), und (c) ein fehlendes `.ticket` eine
Validator-WARN auslöst. **`tasks.md` IST dieser committete Plan** — der `plan_ref` der Spec
zeigt genau auf `openspec/changes/react-homepage-blocks/tasks.md`. `proposal.md` darf knapp
sein (Why/What); ohne diese Dateien scheitert späteres `openspec:apply`/`openspec:archive`.

## Übersicht

P1 ist ein **reiner `mentolder-web`-interner Refactor ohne sichtbare Änderung** der
Live-Seite `react.mentolder.de` (Null-Diff, vgl. Spec §5). Die heute teils in `content.ts`,
teils **inline in `HomePage.tsx`** gehaltene Homepage wird auf ein **block-getriebenes**
Render-Modell umgestellt: ein Zod-validiertes Block-Dokument (`schemaVersion` + `blocks[]`),
ein committeter Seed mit dem **heute gerenderten** Content, sieben präsentationale
Block-Komponenten und ein `BlockRenderer`, der `type → Komponente` mappt und bei
`schemaVersion`-Mismatch **fail-closed auf den Seed** fällt. DB, Editor, Astro-Endpoint,
CI-Build-Fetch und `configmap-domains` sind **explizit out of P1-Scope** (Spec §5 letzter
Absatz).

Treibendes Detail aus der Codebase: `mentolder-web` hat **heute keinen Test-Runner** —
`package.json` exponiert nur `dev`/`build`/`preview`/`typecheck`. P1 führt vitest + React
Testing Library erstmals ein (T1), damit die Parität als **per-Block Render-Snapshots** und
ein **Null-Diff-Seiten-Snapshot** überhaupt testbar wird. Der Plan ist strikt **test-first**
(TDD, rot → grün): jede Komponente/Schema-Einheit bekommt zuerst einen fehlschlagenden Test.

**Komplexität:** mittel. Keine neue Fachlogik — die sieben Sektionen existieren bereits
visuell. Der Aufwand liegt in (a) der **exakten Content-Extraktion** der Inline-Literale aus
`HomePage.tsx` (Tie-break: inline gewinnt über `content.ts`, Spec §4.3), (b) dem Aufsetzen
des Test-Stacks inkl. svgr-Mock (`?react`-SVG-Importe), (c) zwei **net-new** Komponenten
(WhyMe, Process — heute nur inline) und (d) der `BlockRenderer`-Versionslogik.

**Risiken (Kurz):**
1. **Stiller Content-Verlust bei der Extraktion.** Das inline Testimonial
   („Gerald hat es geschafft…" / **Dr. M. Albers** / **CTO · mittelständisches
   SaaS-Unternehmen**, `HomePage.tsx` Zeilen 129–135) mappt auf **kein** `content.ts`-Feld;
   ebenso die abweichenden WhyMe-Punkte (`HomePage.tsx` 91–95, **nicht** `content.ts:whyMePoints`).
   Gegenmaßnahme: Content-Extraktion ist eine Pflicht-Teilaufgabe in T3 mit vollständiger
   Enumeration (s. unten), und der Null-Diff-Snapshot (T6) fängt jede Abweichung.
2. **Svgr-Import bricht den Test-Runner.** `icons.ts` importiert SVGs als React-Komponenten
   (`?react`); unter vitest/jsdom fehlt das Vite-svgr-Plugin → Modul-Resolve-Fehler.
   Gegenmaßnahme: in T1 ein `setup.ts`/Vitest-`server.deps`/`vi.mock`-Stub für `*.svg?react`,
   verifiziert durch den grünen Smoke-Test, **bevor** ServiceRow-Tests geschrieben werden.
3. **`services[].icon` als geschlossener Enum.** Muss exakt die `iconRegistry`-Keys
   (`fuehrung | digitalisierung | team | strategie | kommunikation | resilienz`,
   `mentolder-web/src/components/icons.ts`) als `z.enum([...])` abbilden; Render-Fallback bei
   unbekanntem Wert = **Icon weglassen, kein Throw** (Spec §4.1). Falsch modelliert → Schema
   akzeptiert Garbage oder lehnt den Seed ab.

**Quality-Gate-Vorabprüfung (S1–S4):**
- **S1 (Zeilenlimits):** `mentolder-web/` ist **nicht** in `docs/code-quality/baseline.json`
  (Spec §7) → neue Dateien unterliegen **keinem Ratchet**, nur dem statischen Extension-Limit
  (`.tsx`=400, `.ts`=600). Alle neuen Block-Komponenten und Schema/Seed-Module sind klein und
  fokussiert (eine Sektion bzw. ein Schema pro Datei) und bleiben mit großer Reserve unter
  Limit. Die **einzige existierende** Datei, die ich ändere, ist `HomePage.tsx` — heute
  **196 Zeilen** (verifiziert via `wc -l`); durch das Entfernen der Inline-WhyMe-/Process-/
  Testimonial-JSX **schrumpft** sie deutlich (Render läuft dann über `BlockRenderer`+Seed) →
  S1-Budget für diese Datei ist **unkritisch** (sinkende Zeilenzahl, kein Ratchet-Risiko).
  Ich notiere die S1-Budgets bewusst in Prosa und verzichte auf die 3-Spalten-Budget-Tabelle.
- **S3 (Host-Literal-Scan):** `scope_dirs` = `k3d/`, `prod*/`, `website/src/` — `mentolder-web/`
  liegt **außerhalb** (Spec §7). Kein CI-Gate; `SITE.url` (`https://mentolder.de`) bleibt
  unverändert. P1 fügt keinen Code unter `website/src/` hinzu.
- **S4 (Orphan):** Jede neue Block-Komponente wird vom `BlockRenderer` referenziert; der
  `BlockRenderer` + `seed.ts` werden von `HomePage.tsx` (T6) importiert; Schema von Seed +
  Renderer. Tests werden von vitest erfasst. Kein Orphan.

---

## Task 1: vitest + React Testing Library einführen (Test-Stack, heute typecheck-only)

### Requirement
`mentolder-web` erhält einen lauffähigen Test-Runner (vitest + RTL, jsdom), inklusive
`@`-Alias-Auflösung und einem Mock für `*.svg?react`-Importe, plus ein `test`-Script in
`package.json`. Ein erster Smoke-Test beweist, dass das Setup greift (rot → grün).

### target_files
- `mentolder-web/package.json` (ändern: devDeps `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `jsdom`; Script `"test": "vitest run"`)
- `mentolder-web/vitest.config.ts` (neu)
- `mentolder-web/src/test/setup.ts` (neu)
- `mentolder-web/src/test/smoke.test.tsx` (neu)
- `mentolder-web/tsconfig.app.json` (ändern: `@testing-library/jest-dom` + `vitest/globals`
  Typen, `src/test/setup.ts` im Include)
- Referenz (read-only): `mentolder-web/vite.config.ts` (Alias + svgr-Plugin-Vorbild)

### Steps
- [ ] devDeps ergänzen: `vitest@^2`, `@testing-library/react@^16`,
      `@testing-library/jest-dom@^6`, `jsdom@^25` (Versionen gegen React-19-Kompat prüfen:
      `@testing-library/react` ≥16 unterstützt React 19). `pnpm install` im
      `mentolder-web`-Workspace.
- [ ] `package.json`-Script `"test": "vitest run"` (CI-tauglich, non-watch) hinzufügen.
- [ ] `vitest.config.ts`: `environment: 'jsdom'`, `globals: true`,
      `setupFiles: ['./src/test/setup.ts']`, `resolve.alias` `'@' → ./src` (gespiegelt von
      `vite.config.ts`). Für `*.svg?react`: einen Alias/`vi.mock`-Stub einrichten, der eine
      triviale Stub-Komponente liefert (svgr läuft im Test nicht).
- [ ] `src/test/setup.ts`: `import '@testing-library/jest-dom'`; ggf. `vi.mock`-Glue für
      SVG-`?react`-Importe, falls nicht über Alias gelöst.
- [ ] `tsconfig.app.json`: `compilerOptions.types` um `vitest/globals` und
      `@testing-library/jest-dom` ergänzen; `src/test/setup.ts` in `include` aufnehmen, damit
      `typecheck` die Test-Typen kennt.
- [ ] `src/test/smoke.test.tsx`: ein Test, der eine triviale Komponente rendert und
      `expect(screen.getByText(...)).toBeInTheDocument()` prüft.
- [ ] **Roter Lauf zuerst:** `pnpm test` ausführen, **bevor** `vitest`/Config installiert
      bzw. fertig verdrahtet sind — Expected: FAIL (rot, da kein `test`-Script/kein Runner
      existiert). Erst nach diesem bestätigten Rot-Zustand die Config fertigstellen (grün).

### Acceptance Criteria
- [ ] `pnpm --filter mentolder-web test` läuft den Smoke-Test grün durch.
- [ ] `*.svg?react`-Importe brechen den Test-Runner nicht (ServiceRow/Hero importierbar im Test).
- [ ] `pnpm typecheck` bleibt grün (Test-Typen aufgelöst, keine `noUnusedLocals`-Fehler).
- [ ] `package.json` exponiert `test`; `vitest run` ist non-watch (CI-tauglich).

---

## Task 2: Block-Schema (Zod-Union aller 7 Katalog-Typen + generische + Document)

### Requirement
`mentolder-web/src/blocks/schema.ts` definiert eine **diskriminierte Zod-Union** über `type`
mit allen sieben Paritäts-Block-Typen (`hero`, `stats`, `services`, `whyMe`, `process`,
`faq`, `cta`) **plus** den generischen Typen (`richText`, `image`, `spacer`, Spec §4.1).
Jeder Block ist `{ id: string, type, props }`. `services.props.items[].icon` ist `z.enum([...])`
mit **exakt** den `iconRegistry`-Keys. Exportiert werden ein `HomepageBlocksDocument`-Typ
(`{ schemaVersion: number, blocks: Block[] }`) und die Konstante `SCHEMA_VERSION` (einzige
Quelle des aktuellen Werts, Spec §4.4). `zod@^3.24` ist bereits Dependency — keine neue
Top-Level-Abhängigkeit nötig.

### target_files
- `mentolder-web/src/blocks/schema.ts` (neu)
- `mentolder-web/src/blocks/schema.test.ts` (neu)
- Referenz (read-only): `mentolder-web/src/components/icons.ts` (Enum-Keys),
  `mentolder-web/src/components/{Hero,ServiceRow,FAQ,WhyMeStats,CallToAction}.tsx` (Prop-Formen)

### Steps
- [ ] Pro Block-Typ ein Zod-`object`-Schema für `props`, das die heutigen Komponenten-Props
      spiegelt:
      - `hero`: `title, titleEmphasis, subtitle, tagline, avatarType: z.literal('initials'),
        avatarInitials, personName, personRole` (P1 nur `initials`, Spec §4.1).
      - `stats`: `items: { value: string, target?: number, label: string }[]` (vgl. `Stat`).
      - `services`: `headline, subheadline, items: { id, title, description,
        features: string[], price, priceUnit?, meta?, href,
        icon: z.enum(['fuehrung','digitalisierung','team','strategie','kommunikation','resilienz']) }[]`.
        Das reale `interface Service` (ServiceRow.tsx) trägt zusätzlich ein optionales
        `meta?: string` (ServiceRow.tsx Zeile 15, heute im Seed-Content **ungenutzt**) — das
        Schema modelliert es als `meta: z.string().optional()`, damit das Schema nicht schmaler
        als das Komponenten-Interface ist; der Seed setzt es nicht (kein Null-Diff-Effekt).
      - `whyMe`: `headline, intro, points: { title, text }[], quote, quoteName, quoteRole`.
        `intro` ist **strukturiert** als `{ prefix: string, emphasis: string, suffix: string }`
        (drei Teile), damit `WhyMeBlock` das `<em>` deterministisch an exakt der Stelle rendert
        wie heute (`HomePage.tsx` Zeile 87: `Ich <em>verbinde</em> …`). So bleibt der
        Null-Diff-Snapshot byte-genau; ein freier Roh-String mit eingebettetem `<em>` ist
        ausdrücklich **nicht** das gewählte Format.
      - `process`: `eyebrow, headline, steps: { num, title, text }[]`.
      - `faq`: `title, items: { question, answer }[]`.
      - `cta`: `eyebrow, title, titleEmphasis, subtitle, primaryText, primaryHref,
        secondaryText, secondaryHref`.
      - generisch: `richText: { html: string }`, `image: { src, alt }`,
        `spacer: { size: number }` (Schema/Rendering erlaubt; Editor-UI erst P3).
- [ ] `Block` = `z.discriminatedUnion('type', [...])`; jedes Mitglied trägt
      `id: z.string()`, `type: z.literal('<typ>')`, `props: <typschema>`.
- [ ] `HomepageBlocksDocument = z.object({ schemaVersion: z.number(), blocks: z.array(Block) })`;
      TS-Typen via `z.infer`. `export const SCHEMA_VERSION = 1` als **einzige** Quelle.
- [ ] Icon-Enum **nicht** als freien String und **nicht** als Emoji/iconPath (Astro-Modell)
      modellieren — geschlossener Enum exakt = `iconRegistry`-Keys (Spec §4.1).
- [ ] **Roter Test zuerst** (`schema.test.ts`): ein gültiges Beispiel-Dokument je Block-Typ
      durch `HomepageBlocksDocument.parse(...)` schicken (Round-Trip: parse → re-parse identisch)
      und ein Dokument mit unbekanntem `services.icon` als `parse`-Fehler erwarten —
      Expected: FAIL (rot, da `schema.ts` noch nicht existiert). Danach Schema implementieren (grün).

### Acceptance Criteria
- [ ] `HomepageBlocksDocument.parse` akzeptiert je ein gültiges Beispiel aller 10 Typen
      (7 Katalog + 3 generisch) und liefert beim Round-Trip strukturgleiche Daten.
- [ ] Ein `services`-Block mit `icon: 'unbekannt'` schlägt bei `parse` fehl (Enum erzwungen).
- [ ] `services.props.items[].meta` ist optional und wird ohne Fehler akzeptiert/weggelassen.
- [ ] `whyMe.props.intro` ist `{ prefix, emphasis, suffix }` (drei String-Teile).
- [ ] `SCHEMA_VERSION` ist eine einzelne exportierte Konstante (nicht dupliziert).
- [ ] `pnpm typecheck` grün; `z.infer`-Typen sind importierbar.

---

## Task 3: Content-Extraktion + committeter Seed (`seed.ts`)

### Requirement
`mentolder-web/src/blocks/seed.ts` exportiert ein `HomepageBlocksDocument`
(`schemaVersion: SCHEMA_VERSION`, `blocks` in der **heutigen Render-Reihenfolge**), das den
**heute gerenderten** Content reproduziert. Quelle = `content.ts` **plus** die Inline-Literale
aus `HomePage.tsx`; bei Konflikt **gewinnt der inline gerenderte Wert** (Spec §4.3 Tie-break).

### target_files
- `mentolder-web/src/blocks/seed.ts` (neu)
- `mentolder-web/src/blocks/seed.test.ts` (neu)
- Referenz (read-only): `mentolder-web/src/pages/HomePage.tsx`,
  `mentolder-web/src/content.ts`

### Steps
- [ ] **Content-Extraktion (Pflicht — vollständige Enumeration der Inline-Literale aus
      `HomePage.tsx`):**
      - **hero** (aus `content.ts:heroContent` + `SITE.person`): `title="Menschen, Prozesse
        und Technik"`, `titleEmphasis="der Mensch und Technologie wieder verbindet."`,
        `subtitle` (30+ Jahre…), `tagline="Digital Coach · Führungskräfte-Mentor"`,
        `avatarType='initials'`, `avatarInitials='GK'`, `personName='Gerald Korczewski'`,
        `personRole='Digital Coach & Mentor'`.
      - **stats** (aus `content.ts:stats`): `30+`/target 30/„Jahre Führung"; `KI`/„Schwerpunkt";
        `K8s`/„Cloud-Native"; `B.Sc.`/„Wirtschaftsinformatik".
      - **services**: Inline-Headline `headline="Drei Wege, mit mir zu arbeiten."`
        (`HomePage.tsx` Zeile 59) + `subheadline="Vom Coaching über Transformation bis zum
        Workshop — wählen Sie das Format, das zu Ihrer Situation passt."` (Zeile 63); `items`
        = `content.ts:services` (3 Einträge mit `icon` `fuehrung`/`digitalisierung`/`team`).
        `meta` wird **nicht** gesetzt (heutiger Service-Content nutzt kein `meta` → Null-Diff).
      - **whyMe** (alle **inline** in `HomePage.tsx`, **Tie-break: inline gewinnt**, NICHT
        `content.ts:whyMePoints`/`whyMeHeadline`/`whyMeIntro`):
        `headline="Warum mit mir?"` (Zeile 77),
        `intro` = strukturiert `{ prefix: 'Ich ', emphasis: 'verbinde', suffix: ' technische
        Tiefe mit menschlicher Klarheit.' }` (entspricht dem inline `<em>verbinde</em>`-Markup,
        `HomePage.tsx` Zeile 87) — der abweichende `content.ts:whyMeIntro`-Text (mit Sternchen
        und Zusatzsatz „— und arbeite mit Menschen, die Verantwortung tragen.") bleibt
        **ungenutzt**, da inline gewinnt,
        `points` = die 4 inline Objekte (Zeilen 91–95):
        „30+ Jahre Führungserfahrung", „Technik trifft Empathie", „Pragmatismus statt Hype",
        „Diskretion ist selbstverständlich" (jeweils mit dem inline `d`-Text),
        Testimonial (Zeilen 129–135, mappt auf **kein** `content.ts`-Feld, darf **nicht**
        verloren gehen): `quote="Gerald hat es geschafft, technische Tiefe und menschliche
        Wärme in jeden Termin zu bringen. Selten so klar gefragt, so präzise geantwortet."`,
        `quoteName="Dr. M. Albers"`, `quoteRole="CTO · mittelständisches SaaS-Unternehmen"`.
      - **process**: Inline `eyebrow="So geht's los"` (Zeile 149) +
        `headline="In vier Schritten zu mehr Klarheit."` (Zeile 156); `steps`
        = `content.ts:processSteps` (4 Schritte 01–04 Kennenlernen/Klärung/Umsetzung/Transfer).
      - **faq**: `title="Häufige Fragen"` (`HomePage.tsx` Zeile 182 `title`-Prop) + `items`
        = `content.ts:faqItems` (5 Q/A).
      - **cta** (alle inline `HomePage.tsx` Zeilen 184–192): `eyebrow="Bereit?"`,
        `title="Lassen Sie uns"`, `titleEmphasis="herausfinden, ob es passt."`,
        `subtitle="30 Minuten, kostenlos, unverbindlich. Antwort innerhalb von 48 Stunden."`,
        `primaryText="Termin vereinbaren"`, `primaryHref="/kontakt"`,
        `secondaryText=SITE.email` (`mail@mentolder.de`), `secondaryHref="mailto:..."`.
- [ ] Jeder Block erhält eine **stabile `id`** (z.B. `'hero'`, `'stats'`, … — schlicht, da
      Reorder erst P3). Reihenfolge: hero → stats → services → whyMe → process → faq → cta.
- [ ] `schemaVersion: SCHEMA_VERSION` (Import aus `schema.ts`, nicht dupliziert).
- [ ] **Roter Test zuerst** (`seed.test.ts`):
      `HomepageBlocksDocument.parse(homepageSeed)` aufrufen und erwarten, dass die 7
      Katalog-Blöcke in dieser Reihenfolge vorhanden sind — Expected: FAIL (rot, da `seed.ts`
      noch nicht existiert). Danach Seed befüllen (grün).

### Acceptance Criteria
- [ ] `HomepageBlocksDocument.parse(homepageSeed)` ist erfolgreich (Seed validiert gegen Schema).
- [ ] Der Seed enthält genau die 7 Katalog-Sektionen in heutiger Reihenfolge.
- [ ] Das Testimonial (Dr. M. Albers / CTO …) und die inline WhyMe-Punkte sind im Seed
      enthalten (kein stiller Verlust; Tie-break inline > `content.ts`).
- [ ] `whyMe.intro` ist als `{ prefix:'Ich ', emphasis:'verbinde', suffix:' technische Tiefe
      mit menschlicher Klarheit.' }` hinterlegt (Emphasis an exakt der heutigen Stelle).
- [ ] Kein Import aus `content.ts:whyMePoints`/`whyMeHeadline`/`whyMeIntro` (tote, nicht
      gerenderte Exports werden bewusst nicht als Quelle benutzt).

---

## Task 4: Sieben präsentationale Block-Komponenten (props-only, kein content.ts)

### Requirement
Sieben Block-Komponenten unter `mentolder-web/src/blocks/<type>/`, jede **rein
präsentational** (props rein, **kein** Import von `content.ts`, kein Fetch — Vertrag aus
Spec §3.4, in P1 bindend). Hero/Services/FAQ/Stats/CTA betten die bestehenden Komponenten
ein bzw. reichen Props durch; **WhyMe und Process sind net-new** (heute nur inline in
`HomePage.tsx`) und müssen das inline JSX 1:1 reproduzieren (inkl. `framer-motion`-Animation,
Klassen, `<em>` in der WhyMe-Intro, Testimonial-Figure).

### target_files
- `mentolder-web/src/blocks/hero/HeroBlock.tsx` + `.test.tsx` (neu)
- `mentolder-web/src/blocks/stats/StatsBlock.tsx` + `.test.tsx` (neu)
- `mentolder-web/src/blocks/services/ServicesBlock.tsx` + `.test.tsx` (neu)
- `mentolder-web/src/blocks/whyMe/WhyMeBlock.tsx` + `.test.tsx` (neu — NET-NEW)
- `mentolder-web/src/blocks/process/ProcessBlock.tsx` + `.test.tsx` (neu — NET-NEW)
- `mentolder-web/src/blocks/faq/FaqBlock.tsx` + `.test.tsx` (neu)
- `mentolder-web/src/blocks/cta/CtaBlock.tsx` + `.test.tsx` (neu)
- Referenz (read-only): die fünf bestehenden Komponenten + `HomePage.tsx` (Zeilen 39–193 für
  Services-Section-Hülle, WhyMe-Section 71–141, Process-Section 143–180)

### Steps
- [ ] **HeroBlock:** nimmt `props` vom `hero`-Schema, rendert `<Hero ... />` mit den
      durchgereichten Props (`avatarType="initials"`, `avatarInitials`, `personName`,
      `personRole`).
- [ ] **StatsBlock:** rendert `<WhyMeStats stats={props.items} />`.
- [ ] **ServicesBlock:** reproduziert die `<section id="angebote">`-Hülle aus `HomePage.tsx`
      (Eyebrow „Meine Angebote", `headline`, `subheadline`) + `<ServiceRow services={props.items} />`.
      Hinweis: das Eyebrow „Meine Angebote" ist inline-Markup, nicht im Service-Item — als
      konstantes Layout-Element in der Komponente belassen (kein neues Prop nötig, da Null-Diff
      gegen heutiges Markup; falls als Prop gewünscht, im Seed mitgeben — Entscheidung:
      konstantes Layout, da nicht editierbar in P1).
- [ ] **WhyMeBlock (net-new):** das inline JSX aus `HomePage.tsx` 71–141 1:1 nachbauen,
      props-getrieben: Eyebrow „Warum mit mir?", `headline`-`<em>`-Markup deterministisch aus
      `intro = { prefix, emphasis, suffix }` (rendert `{prefix}<em>{emphasis}</em>{suffix}`,
      Emphasis an exakt der heutigen Stelle), `points`-`<ol>` mit `framer-motion`-`motion.li`
      (gleiche Transition/Klassen), Testimonial-`<figure>` mit `quote`/`quoteName`/`quoteRole`.
- [ ] **ProcessBlock (net-new):** das inline JSX aus `HomePage.tsx` 143–180 1:1 nachbauen:
      Eyebrow (`eyebrow`), `headline`, `steps`-`<ol>` mit `motion.li` (gleiche Klassen).
- [ ] **FaqBlock:** rendert `<FAQ items={props.items} title={props.title} />`.
- [ ] **CtaBlock:** rendert `<CallToAction ...props />`.
- [ ] Keine Komponente importiert `content.ts` (Vertrag); Daten kommen ausschließlich über Props.
- [ ] **Rote Tests zuerst** (per Block ein `.test.tsx`): jede Komponente mit Seed-Props
      rendern und einen Render-Snapshot (`toMatchSnapshot`) bzw. Schlüsseltexte
      (`getByText('Dr. M. Albers')`, `getByText("So geht's los")` …) prüfen — Expected: FAIL
      (rot, da die Block-Komponenten noch nicht existieren). Danach Komponenten implementieren (grün).

### Acceptance Criteria
- [ ] Alle sieben Block-Komponenten rendern aus reinen Props; `grep` findet **keinen**
      `content.ts`-Import in `src/blocks/`.
- [ ] WhyMe- und Process-Snapshots enthalten das inline-Markup (Testimonial, Eyebrows,
      `<em>`-Emphasis) byte-treu zum heutigen `HomePage.tsx`.
- [ ] Per-Block-Snapshots sind stabil und grün.
- [ ] `pnpm typecheck` grün (Props-Typen aus `schema.ts`).

---

## Task 5: BlockRenderer (type→Komponente, Zod-Validierung, fail-closed-to-seed)

### Requirement
`mentolder-web/src/blocks/BlockRenderer.tsx` nimmt ein `HomepageBlocksDocument`, **validiert
es mit Zod**, mappt jeden `block.type` auf die zugehörige Block-Komponente und rendert die
Liste in Reihenfolge. Bei `schemaVersion`-Mismatch (≠ `SCHEMA_VERSION`) oder fehlgeschlagener
Validierung **fällt der Renderer fail-closed auf den committeten Seed** (kein Garbage, kein
Crash — Spec §4.4).

### target_files
- `mentolder-web/src/blocks/BlockRenderer.tsx` (neu)
- `mentolder-web/src/blocks/BlockRenderer.test.tsx` (neu)
- Referenz (read-only): `schema.ts`, `seed.ts`, alle sieben Block-Komponenten

### Steps
- [ ] `BLOCK_COMPONENTS`-Map `type → Komponente` für alle sieben Katalog-Typen (generische
      Typen `richText`/`image`/`spacer` dürfen gerendert werden, falls vorhanden — minimal
      präsentational; kein Editor-UI in P1).
- [ ] Eingangs-Dokument durch `HomepageBlocksDocument.safeParse` schicken. Bei
      `success === false` **oder** `doc.schemaVersion !== SCHEMA_VERSION` → `homepageSeed`
      verwenden (fail-closed). Sonst die validierten `blocks` rendern.
- [ ] Pro Block: Komponente aus der Map; `key={block.id}`; bei unbekanntem `type`
      (sollte durch Zod ausgeschlossen sein) Block überspringen (kein Throw).
- [ ] Default-Prop: `document = homepageSeed`, damit `HomePage.tsx` ohne Argument den Seed rendert.
- [ ] **Roter Test zuerst** (`BlockRenderer.test.tsx`): ein Dokument mit
      `schemaVersion: 999` (Mismatch) übergeben und erwarten, dass der **Seed-Content**
      gerendert wird (z.B. `getByText('Dr. M. Albers')`) — Expected: FAIL (rot, da
      `BlockRenderer` noch nicht existiert). Danach Renderer implementieren (grün). Zweiter
      Test: gültiger Seed → alle 7 Sektionen present.

### Acceptance Criteria
- [ ] Gültiges Seed-Dokument → alle 7 Sektionen werden in Reihenfolge gerendert.
- [ ] `schemaVersion`-Mismatch → fail-closed auf Seed (Seed-Texte sichtbar, kein Crash).
- [ ] Validierungsfehler (`safeParse` false) → ebenfalls Seed-Fallback.
- [ ] `pnpm typecheck` grün.

---

## Task 6: HomePage.tsx auf BlockRenderer+Seed umstellen (Inline + content.ts-Importe raus)

### Requirement
`mentolder-web/src/pages/HomePage.tsx` rendert die Homepage **ausschließlich** über
`<BlockRenderer document={homepageSeed} />` (bzw. den Default-Seed). Sämtlicher
Homepage-Inline-Content (WhyMe-Section, Process-Section, Services-Hülle, CTA-Literale,
Testimonial) und die direkten `content.ts`-Homepage-Importe werden entfernt. `PageMeta`
(SEO) bleibt erhalten. Ein **Null-Diff-Snapshot** der ganzen Seite beweist Parität.

### target_files
- `mentolder-web/src/pages/HomePage.tsx` (ändern — heute 196 Zeilen, schrumpft)
- `mentolder-web/src/pages/HomePage.test.tsx` (neu)
- Referenz (read-only): `BlockRenderer.tsx`, `seed.ts`

### Steps
- [ ] **Snapshot des Ist-Zustands zuerst aufnehmen:** vor dem Umbau einen
      Full-Page-Render-Snapshot der heutigen `HomePage` erzeugen und committen (Baseline der
      Parität). Dieser Snapshot ist der Null-Diff-Anker.
- [ ] `HomePage.tsx` umbauen: `PageMeta` behalten; statt der sieben Inline-/Komponenten-Blöcke
      `<BlockRenderer document={homepageSeed} />` rendern.
- [ ] **Inline-Content entfernen:** WhyMe-Section (Zeilen 71–141), Process-Section (143–180),
      Services-Section-Hülle (39–69), CTA-Literale (184–193), Hero-Inline-Props — alles wandert
      in Seed/Komponenten und wird aus `HomePage.tsx` entfernt.
- [ ] **Importe bereinigen:** `import { ... } from '@/content'` für Homepage-Felder
      (`heroContent, stats, services, faqItems, processSteps`) entfernen; nur noch das behalten,
      was `PageMeta` braucht (`SITE.url`, `SITE.ogImage`) — `SITE` bleibt zulässig (nicht
      Homepage-Block-Content, sondern Seiten-Metadaten).
- [ ] `framer-motion`-Import und die inline `motion.*`-Nutzung aus `HomePage.tsx` entfernen
      (wandert in WhyMe-/Process-Block).
- [ ] **Null-Diff-Test** (`HomePage.test.tsx`): den nach dem Umbau erzeugten Full-Page-Snapshot
      gegen den in Schritt 1 committeten Baseline-Snapshot prüfen — er muss **identisch**
      bleiben (Null-Diff). Abweichung = Paritätsbruch → Fix in Seed/Komponente, nicht im Snapshot.
- [ ] `wc -l src/pages/HomePage.tsx` nach dem Umbau notieren — Erwartung: deutlich **unter**
      196 (Inline-JSX entfernt), S1-Budget unkritisch.

### Acceptance Criteria
- [ ] `HomePage.tsx` rendert **keinen** Homepage-Content mehr inline und importiert keine
      `content.ts`-Homepage-Felder mehr direkt (`grep` bestätigt).
- [ ] Der Full-Page-Snapshot nach dem Umbau ist identisch zum Vor-Umbau-Snapshot (Null-Diff).
- [ ] `PageMeta`/SEO unverändert.
- [ ] `HomePage.tsx` ist kleiner als 196 Zeilen; S1-Limit (.tsx=400) mit großer Reserve gewahrt.
- [ ] `pnpm build` (`tsc -b && vite build`) grün.

---

## Task 7: Verifikation (Tests, Inventar, OpenSpec, Freshness)

### Requirement
Vollständige Parität und grüne Quality-Gates nachweisen; neue Tests im Inventar registrieren;
OpenSpec-Delta validieren.

### target_files
- `tests/spec/react-homepage-blocks.bats` (neu — OpenSpec-Capability-Smoke: Block-Katalog-
  Vollständigkeit + Seed-Schema-Kontrakt; **keine** ticket-nummerierte Datei)
- `website/src/data/test-inventory.json` (ändern — regeneriert)
- `openspec/changes/react-homepage-blocks/specs/react-homepage-blocks.md` (Referenz, validiert)

### Wichtig — `task test:changed` deckt `mentolder-web` NICHT ab (Pflicht-Hinweis)
Die Smart-Selection in `Taskfile.yml` (`test:changed`) matcht ausschließlich `^website/`,
`^k3d/|prod*`, `^scripts/`, `^scripts/factory/` und `^(tests/unit/|\.bats)`. Ein PR, der nur
`mentolder-web/` + `openspec/` + `tests/spec/*.bats` + `website/src/data/test-inventory.json`
berührt, fällt **nicht** in einen `mentolder-web`-Zweig: `tests/spec/*.bats` triggert über
`\.bats` zwar `RUN_UNIT` (die BATS-Capability läuft), aber **niemals**
`pnpm --filter mentolder-web test`. Stattdessen greift entweder der `RUN_UNIT`-Zweig
(`task test:unit`) und/oder — falls kein Domain-Match — der „no domain-specific changes"-Zweig,
der die **website**-vitest-Suite (`cd website && pnpm vitest run`) + `test:code-quality` fährt.
**Konsequenz:** Das STRUCT3-Pflicht-Gate `task test:changed` sichert die mentolder-web-Parität
**nicht** ab. Die eigentliche Paritäts-Assertion sind die separat ausgeführten
mentolder-web-Schritte unten (`pnpm --filter mentolder-web test` + `typecheck` + `build`) —
diese MÜSSEN als eigener Pflicht-Schritt laufen. Optionale Aufräum-Notiz (separates
Chore-Ticket, **nicht** P1-blockierend): `test:changed` um ein `^mentolder-web/`-Muster
erweitern, das `pnpm --filter mentolder-web test` auslöst.

### Steps
- [ ] **Failing-Test zuerst (red) für die BATS-Capability:** `tests/spec/react-homepage-blocks.bats`
      mit einem `@test` anlegen, der vor Existenz von `seed.ts`/`schema.ts` läuft — z.B. prüft,
      dass `mentolder-web/src/blocks/seed.ts` die 7 Katalog-Block-`type`-Literale enthält.
      Diesen Test **vor** der Implementierung ausführen, um zu verify it fails:
      `./tests/runner.sh local react-homepage-blocks 2>&1 | grep -i fail` — Expected: FAIL
      (rot, da `seed.ts`/`schema.ts` noch nicht existieren). Danach grün.
      (In dieser Plan-Reihenfolge ist der Inhalt bereits da; bei echter Ausführung wird der
      BATS-Test als erster Schritt rot geschrieben, dann grün.)
- [ ] **mentolder-web-Tests (DIE eigentliche Paritäts-Assertion — Pflicht, separat zu
      `test:changed`):** `pnpm --filter mentolder-web test` — alle Schema-/Seed-/Block-/
      Renderer-/HomePage-Snapshots grün; `pnpm --filter mentolder-web typecheck` grün;
      `pnpm --filter mentolder-web build` grün.
- [ ] **BATS grün:** `./tests/runner.sh local react-homepage-blocks` grün.
- [ ] **Pflicht-CI-Gates (in dieser Reihenfolge — Literale wörtlich):**
  - [ ] `task test:changed` (führt die mentolder-web-Suite **nicht** aus — siehe Hinweis oben;
        deckt website-vitest + BATS + code-quality ab)
  - [ ] `task freshness:regenerate`
  - [ ] `task freshness:check`
- [ ] **Test-Inventar:** `task test:inventory` ausführen und das aktualisierte
      `website/src/data/test-inventory.json` mitcommitten (CI failt sonst).
- [ ] **OpenSpec:** `task test:openspec` (bzw. `task openspec:validate`) — das Delta unter
      `openspec/changes/react-homepage-blocks/specs/react-homepage-blocks.md` validiert
      fehlerfrei (jede Requirement hat ≥1 Scenario).

### Acceptance Criteria
- [ ] `pnpm --filter mentolder-web test` + `typecheck` + `build` grün (Pflicht-Paritäts-Gate,
      separat von `task test:changed`).
- [ ] `tests/spec/react-homepage-blocks.bats` grün; Inventar enthält die neuen Tests.
- [ ] `task test:changed`, `task freshness:regenerate`, `task freshness:check`,
      `task test:inventory`, `task test:openspec` ohne Fehler.
- [ ] Null-Diff bestätigt: react.mentolder.de rendert visuell/DOM-identisch zur heutigen Seite.
- [ ] S1–S4 sauber (kein Orphan, kein Host-Literal unter `website/src/`, kein Baseline-Wachstum;
      `HomePage.tsx` geschrumpft).

