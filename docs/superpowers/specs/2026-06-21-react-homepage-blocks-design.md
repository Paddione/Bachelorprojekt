---
title: React Homepage Block-System (react.mentolder.de)
date: 2026-06-21
status: draft
domains: [website]
ticket_id:
plan_ref: openspec/changes/react-homepage-blocks/tasks.md
---

# React Homepage Block-System — Design Spec

> **Review-Status:** Diese Spec wurde adversarial gegen die Codebase geprüft (3 parallele
> Kritiker, 3 bestätigte Blocker eingearbeitet). Die P1-Architektur ist gegenüber dem
> Erstentwurf bewusst kleiner und ehrlicher: P1 ist ein **reiner `mentolder-web`-interner
> Refactor ohne DB/Endpoint/CI-Fetch**.

## 1. Kontext & Ziel

`mentolder-web/` ist ein bereits live deploytes Vite + React-19-SPA (`react.mentolder.de` /
`react.localhost`, statisch via nginx). Sein Content liegt teils in
`mentolder-web/src/content.ts` und **teils inline hartcodiert** in
`mentolder-web/src/pages/HomePage.tsx` (WhyMe-Punkte, Testimonial, Headlines, Process-Texte).
Kein DB-Anschluss, kein Editor.

Die Astro/Svelte-Hauptseite (`website/`, `mentolder.de`) besitzt einen flexiblen,
DB-getriebenen Content-Mechanismus (Zwei-Ebenen: statischer Fallback `BrandConfig.homepage`
+ DB-Override über Admin-API → `site_settings`-JSONB). Die Sektions-*Struktur* ist dort jedoch
fest verdrahtet.

**Endziel:** react.mentolder.de wird das **Migrationsziel** und löst die Astro/Svelte-Homepage
langfristig ab. Es soll **Felder *und* Strukturen** editierbar machen (Sektionen
hinzufügen/entfernen/umordnen, nicht nur Feldwerte) — über einen **visuellen Page-Builder**.
Interne Struktur darf divergieren („even if structured differently").

**Diese Iteration (P1)** legt das Fundament: das Block-Modell und block-getriebenes Rendering,
**ohne sichtbare Änderung** der Live-Seite.

## 2. Getroffene Grundsatz-Entscheidungen

| Weiche | Entscheidung | Begründung |
|---|---|---|
| **Zielbild** | React ersetzt Astro/Svelte langfristig (Migrationsziel) | Nutzer-Vorgabe |
| **Flexibilität** | Block-/Komposition-System (Felder **und** Struktur) | „Felder oder Strukturen" |
| **Content-SSOT** | Gemeinsames Backend (`site_settings` + Astro-Server-API, neuer Key) — **ab P2** | eine Quelle, keine Duplikate |
| **Editor** | Visueller Page-Builder (Live-Preview, Inline) — **ab P2** | Nutzer-Vorgabe (Premium-UX) |
| **Übergang** | Astro friert ein; neuer Block-Key nur von React gepflegt; Cutover per DNS/Ingress | kein Dual-Write |
| **Public-Rendering** | Build-Bake: Block-Content statisch ins Bundle gebacken. **P1 backt aus committetem Seed; live-DB-Bake folgt P2** | beste SEO/FCP; CI-Runner erreicht die interne DB-API nicht (s. §3.3/§8) |
| **P1-Parität** | **Reiner Refactor — react.mentolder.de sieht aus wie heute** (Null-Diff) | niedrigstes Risiko, klar testbar; Content-Angleichung an Astro = spätere Editor-Edits |

## 3. Architektur (Gesamtbild)

### 3.1 Content-Modell & Block-Schema
- Block-Dokument: `{ schemaVersion: number, blocks: Block[] }`.
- `Block = { id: string, type: BlockType, props: <typ-spezifisch> }` — diskriminierte Union,
  **Zod**-validiert (Zod ist in `mentolder-web` bereits Dependency, v3.24).
- `id` stabil (Reorder/Diff/Keying), `type` wählt das Schema, `props` ist die validierte Nutzlast.
- **Ablageort des Dokuments:** in P1 ein **committetes statisches Seed-Modul** im Repo
  (`mentolder-web/src/blocks/seed.ts`, exportiert ein `HomepageBlocksDocument`). Ab P2 wird die
  kanonische Quelle der DB-Key `site_settings[brand,'homepage_blocks']`; der Build holt ihn dann
  zur Build-Zeit (s. §6).

### 3.2 Backend & Auth-Topologie (ab P2 — hier zur Einordnung)
- Der **Astro-Node-Server** (`output:'server'`, node-standalone) bleibt während der Koexistenz
  Backend. **Freeze konkret:** keine Edits an `website/src/pages/index.astro` oder seinen
  Homepage-Komponenten; neue Routen leben in eigenen Dateien unter `website/src/pages/api/content/`
  und teilen **kein** Modul mit dem Homepage-Render-Pfad.
- Additive Routen (P2): `GET /api/content/homepage-blocks` (public, unauthentifiziert) und
  `POST /api/admin/homepage-blocks/save` (auth, CAS-Locking).
- **`CONTENT_REGISTRY`-Pflicht (P2):** `readContent`/`writeContent` werfen bei unbekanntem
  `contentKey` (`refFor` → undefined). `homepage_blocks` muss als Registry-Eintrag registriert
  werden (`contentType: 'site_setting'`, `storeKey: 'homepage_blocks'`), **bevor** der Save-Pfad
  benutzt wird.
- **Cross-Subdomain-Auth (P2):** `workspace_session`-Cookie auf Parent-Domain `.mentolder.de`
  (`Secure; SameSite=Lax`) + CORS-Allow-List für `https://react.mentolder.de` (credentials);
  Login per Redirect zum bestehenden Keycloak-Flow; `isAdmin`-Whitelist unverändert.

### 3.3 Public-Rendering & Publish-Pipeline
- **P1 — Build-Bake aus committetem Seed:** `HomePage` rendert über den `BlockRenderer` aus dem
  importierten Seed-Modul (`src/blocks/seed.ts`). Vite bäckt es statisch ins Bundle. SEO voll
  erhalten. **Kein** Netzwerk-/DB-Zugriff im Build — der heutige CI-Build läuft offline
  (`--frozen-lockfile`, nur typecheck + docker build).
- **P2 — live-DB-Bake (ehrlicher Pfad):** Der CI-Runner ist netz-isoliert vom Fleet-Cluster und
  erreicht die interne DB-API **nicht**. Daher braucht P2: (a) den **public, unauthentifizierten**
  Read-Endpoint, erreichbar vom GitHub-Runner über den `web.mentolder.de`-Ingress;
  (b) `react.mentolder.de` + den API-Host in `k3d/configmap-domains.yaml` (zentrale Domains-Regel);
  (c) einen `BUILD_CONTENT_API_BASE`-Build-Env mit der konkreten URL; (d) **fail-closed**-Semantik:
  erreichbarer Endpoint → Live-Snapshot wird gebacken; unerreichbarer Endpoint → **Build bricht
  hart ab** (kein stilles Backen veralteten Contents); das Repo-Seed dient nur dem allerersten
  Pre-Seed-Build.
- **Publish-Trigger (P2):** „Publish"-Button ruft serverseitig `workflow_dispatch` auf
  `build-mentolder-web.yml` → public live in ~1–3 Min. Editor-Vorschau bleibt sofort (in-memory).

### 3.4 Editor-Architektur (ab P2, hier zur Vollständigkeit)
- Block-Komponenten **rein präsentational** (props rein, kein Fetch) — dieselben Komponenten
  rendern Live-Seite **und** Editor. **Dieser Vertrag ist bereits in P1 bindend.**
- `<EditableBlock>`-Wrapper: Selektion, Toolbar (⚙ ↑ ↓ ✕), Inline-Edit; View-Modus ohne Wrapper.
- Reorder via **dnd-kit**; Add via „+"-Insert-Zonen → Typ-Picker; Remove via Toolbar.
- Inline-Editing hybrid: Textfelder inline (contentEditable); strukturierte Felder über Popover.
- State: In-Memory Working-Copy + Dirty-Tracking; Save mit `baseVersion` (CAS); 409 → Reload-Hinweis.
- Editor als geschützte Route (`/admin`); nur `isAdmin` lädt/speichert.

## 4. Block-Modell im Detail

### 4.1 Block-Katalog
Paritäts-Sektionen (Reihenfolge der heutigen React-Homepage):

| Block-Typ | Heutige React-Quelle | Props (Auszug) |
|---|---|---|
| `hero` | `HomePage.tsx` + `Hero.tsx` | `title`, `titleEmphasis`, `subtitle`, `tagline`, `avatarType:'initials'`, `avatarInitials`, `personName`, `personRole` |
| `stats` | `WhyMeStats.tsx` + `content.ts:stats` | `items: { value, target?, label }[]` |
| `services` | `ServiceRow.tsx` + `content.ts:services` (Loop) + Inline-Headlines | `headline`, `subheadline`, `items: { id, title, description, features[], price, priceUnit, href, icon }[]` |
| `whyMe` | **inline in `HomePage.tsx`** + Inline-Testimonial | `headline`, `intro`, `points: { title, text }[]`, `quote`, `quoteName`, `quoteRole` |
| `process` | `content.ts:processSteps` + Inline-Eyebrow/Headline | `eyebrow`, `headline`, `steps: { num, title, text }[]` |
| `faq` | `FAQ.tsx` + `content.ts:faqItems` | `title`, `items: { question, answer }[]` |
| `cta` | `CallToAction.tsx` | `eyebrow`, `title`, `titleEmphasis`, `subtitle`, `primaryText`, `primaryHref`, `secondaryText`, `secondaryHref` |

Generische Block-Typen (Struktur-Freiheit; Schema/Rendering in P1 erlaubt, Editor-UI erst P3):
`richText`, `image`, `spacer`.

**`services[].icon` ist ein geschlossener Enum**, nicht ein freier String: `z.enum([...])` mit
exakt den `iconRegistry`-Keys (`fuehrung | digitalisierung | team | strategie | kommunikation |
resilienz`, aus `mentolder-web/src/components/icons.ts`). Render-Fallback bei unbekanntem Wert:
**Icon weglassen** (kein Throw). Das Astro-`iconPath`/Emoji-Modell wird **nicht** übernommen.

**`hero.avatar` ist in P1 `initials`** (`GK`), passend zum Live-React-Hero. Bild-Avatar (das
Astro nutzt) ist **kein** P1-Scope — das Asset existiert in `mentolder-web` nicht und käme später
als Editor-Edit.

### 4.2 Schema-SSOT & Drift-Gate (P2)
- Zod-Block-Schemas in `mentolder-web` sind kanonisch (React ist die Zukunft).
- Wenn P2 die Astro-Save-Validierung spiegelt, hält ein **CI-Drift-Gate** (Muster wie
  `arena-proto-drift`) die gespiegelte Datei byte-gleich. In P1 existiert nur die React-Seite des
  Schemas (kein Save-Pfad) → kein Drift-Gate nötig.

### 4.3 Seed (Parität = heutiges React-Rendering)
- **Eine kanonische Quelle:** der **heute gerenderte React-Content** — d. h. `content.ts` **plus
  die in `HomePage.tsx` inline gehaltenen Felder**, per Hand in die Block-Liste übersetzt und als
  committetes Modul `mentolder-web/src/blocks/seed.ts` fixiert.
- **Tie-break-Regel:** Bei Konflikt gewinnt der **inline gerenderte** Wert über den (aktuell nicht
  gerenderten) `content.ts`-Wert — denn Parität ist mit der **gerenderten Seite**, nicht mit
  ungenutzten Exports.
- **Content-Extraktion (Pflicht-Teilaufgabe):** jede aktuell inline in `HomePage.tsx` gehaltene
  Literale enumerieren und einem Block-Prop zuordnen. Bekannt aus der Review:
  - WhyMe-Punkte (HomePage.tsx ~91–95), WhyMe-Headline/Intro (~59/63/87) — **nicht** die
    abweichenden `content.ts:whyMePoints`.
  - Testimonial `quote`/`quoteName`/`quoteRole` = inline „Gerald hat es geschafft…" / **Dr. M.
    Albers / CTO** (HomePage.tsx ~129–135) — mappt auf **kein** `content.ts`-Feld; darf nicht
    stillschweigend verloren gehen.
  - Services-Headline „Drei Wege, mit mir zu arbeiten." + Subheadline (~149).
  - Process-Eyebrow „So geht's los" + Headline „In vier Schritten…" (~156).

### 4.4 Schema-Versionierung
- `schemaVersion` ist eine Konstante; die **einzige Quelle** des aktuellen Werts ist der
  Seed-Import (nicht dupliziert).
- **Read-Zeit-Verhalten bei Mismatch:** Liest der Renderer ein Dokument mit unbekanntem/älterem
  `schemaVersion`, **fail-closed auf den committeten Seed** (kein Garbage, kein Crash). Eine echte
  `migrate(doc)`-Leiter ist erst nötig, wenn das Schema sich nach P2 ändert — out of P1-Scope,
  aber das fail-closed-Verhalten ist in P1 zu implementieren.

## 5. Scope dieser Iteration (P1 — Block-getriebenes Rendering, Null-Diff)

**Liefert:** react.mentolder.de rendert die Homepage **block-getrieben aus einem committeten
Seed**, **visuell identisch** zur heutigen React-Seite. Rein `mentolder-web`-intern.

In Scope:
1. **Block-Schema** (`mentolder-web/src/blocks/schema.ts`): Zod-Union aller Katalog-Typen
   (inkl. `services.icon` als Enum, generische Typen) + `HomepageBlocksDocument`-Typ + `schemaVersion`.
2. **Content-Extraktion** (§4.3): alle Inline-Literale aus `HomePage.tsx` enumerieren, Tie-break
   anwenden, Werte für den Seed festlegen.
3. **7 präsentationale Block-Komponenten** (`mentolder-web/src/blocks/<type>/`), props-getrieben,
   **kein** Import von `content.ts`. Bestehende Komponenten (Hero/ServiceRow/FAQ/WhyMeStats/
   CallToAction) werden eingebettet/zu props umgebaut; WhyMe & Process sind **net-new**
   (heute nur inline).
4. **`BlockRenderer`** (`mentolder-web/src/blocks/BlockRenderer.tsx`): mappt `type → Komponente`,
   Zod-validiert das Dokument, fail-closed-to-seed bei Mismatch, rendert die Liste.
5. **Committeter Seed** (`mentolder-web/src/blocks/seed.ts`): das `HomepageBlocksDocument` mit dem
   heutigen Content.
6. **`HomePage.tsx` rendert aus `BlockRenderer`+Seed** statt aus Ad-hoc-JSX/`content.ts`.
7. **Test-Stack einführen** (heute typecheck-only): vitest + React Testing Library; Zod-Round-Trip,
   **per-Block Render-Snapshots**, Seed-Validierungs-Test.

Akzeptanzkriterien (testbar):
- react.mentolder.de zeigt die 7 Sektionen **pixel-/DOM-identisch** zur heutigen React-Homepage
  (per-Block Snapshot-Tests, Null-Diff).
- Die Inhalte stammen aus dem committeten Block-Seed über den `BlockRenderer`; `HomePage.tsx`
  rendert **keinen** Homepage-Content mehr inline und importiert `content.ts`-Homepage-Felder nicht
  mehr direkt.
- `BlockRenderer` validiert mit Zod und fällt bei `schemaVersion`-Mismatch auf den Seed zurück.
- `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task test:openspec`
  grün; neue Tests im Inventar (`task test:inventory`).

**Explizit NICHT in P1:** DB-Persistenz, `site_settings`/`homepage_blocks`-Key, `CONTENT_REGISTRY`,
Astro-Endpoint, CI-Build-Fetch, `configmap-domains`-Änderung, Auth/CORS, Editor/EditableBlock,
dnd-kit, Publish-Trigger, generische Blöcke im UI, Bild-Avatar, Content-Angleichung an Astro.

> **Größen-Hinweis für den Plan:** Punkt 1–7 berühren mehrere Bausteine, aber alle in
> `mentolder-web/` (nicht in S1-`baseline.json`). Falls der PR zu groß wird, ist eine saubere
> Schnittstelle: PR-A = Schema + generische Typen + Seed + `BlockRenderer` + Tests; PR-B = die 7
> Block-Komponenten + `HomePage`-Umstellung. Der Plan darf das so schneiden.

## 6. Roadmap (Folge-Pläne, je eigener dev-flow-Plan/PR)
- **P2 — Persistenz + Editor (View & Feld-Edit):** `homepage_blocks`-Key + `CONTENT_REGISTRY`-Eintrag;
  public Read-Endpoint + `configmap-domains` + `BUILD_CONTENT_API_BASE` + fail-closed Build-Fetch
  (ersetzt committeten Seed als Quelle); `<EditableBlock>`, Feld-Editing (inline+Popover), Save mit
  CAS, Cross-Subdomain-Auth (Cookie-Parent-Domain + CORS), Publish-Button + `workflow_dispatch`;
  Seed-Idempotenz (`ON CONFLICT (brand,key) DO UPDATE`, brand-FK-Precondition); Schema-Drift-Gate.
- **P3 — Struktur-Flexibilität:** dnd-kit Reorder, Add/Remove, generische Blöcke
  (richText/image/spacer) im Typ-Picker.
- **P4 — Ablöse-Reife:** Globals-Editing (Nav/Footer/Stammdaten), Undo/Redo, Cutover-Runbook
  (DNS/Ingress-Flip) + Astro-Backend-Re-Homing.

## 7. Testing & Quality-Gates
- **React-Tests einführen** (heute typecheck-only): vitest + RTL — Zod-Round-Trips, per-Block
  Render-Snapshots (die testbare Parität-Assertion), Seed-Validierung.
- **Plan-Quality (S1–S4):** `mentolder-web/` ist **nicht** in `docs/code-quality/baseline.json`
  → neue Dateien frei; Komponenten klein/fokussiert halten. **S3 deckt `mentolder-web/` NICHT ab**
  (scope_dirs = `k3d/`, `prod*/`, `website/src/`) — Host-Hygiene dort ist **manuelle Konvention**,
  kein CI-Gate (`content.ts` enthält heute bereits ungeflaggt `https://mentolder.de`). Der neue
  Astro-Endpoint (P2, unter `website/src/pages/api/`) liegt **im** S3-Scope und muss Host-Literale
  vermeiden.
- **BATS:** `tests/spec/react-homepage-blocks.bats` (neue OpenSpec-Capability — Block-Katalog-
  Vollständigkeit, Seed-Schema-Kontrakt).
- **Final-Verifikations-Task im Plan:** `task test:changed` + `task freshness:regenerate` +
  `task freshness:check` + `task test:inventory` + `task test:openspec`.

## 8. Risiken & offene Punkte
- **CI-Netz-Isolation (gelöst durch Phasierung):** Der GitHub-Runner erreicht die interne DB-API
  nicht. P1 vermeidet das Problem (committeter Seed). P2 muss den public Ingress-Endpoint +
  `configmap-domains` + fail-closed Build-Fetch liefern, bevor „live-DB-Bake" real ist.
- **Astro-Backend-Lebensdauer:** Save-API + Auth + DB-Zugriff sind Astro-Server-Code; die volle
  Astro-Ablöse (P4) erfordert Backend-Re-Homing — bewusst außerhalb P1–P3.
- **Inline-Content-Drift:** `content.ts` enthält Homepage-Felder (whyMe…), die die Seite **nicht**
  rendert. Nach P1 sollte der Plan erwägen, diese toten Exports zu entfernen (Aufräum-Notiz, nicht
  P1-blockierend).

## 9. Nicht-Ziele (YAGNI)
- Kein Block-System für Nicht-Homepage-Seiten (Kontakt/Impressum/Datenschutz bleiben statisch).
- Kein korczewski-Brand (Timeline-Block bleibt korczewski-spezifisch, out of scope).
- Keine Migration der Astro-Seite auf Blöcke (Astro friert ein).
- Kein CMS-Rich-Editor (TipTap/Slate) in P1–P3; Inline-Text genügt.
- Keine Content-Angleichung an die Astro-Seite in P1 (reiner Refactor, Null-Diff).
