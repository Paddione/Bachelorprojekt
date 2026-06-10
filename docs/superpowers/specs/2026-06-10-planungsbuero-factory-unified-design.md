# Unified Dev-Status: Planungsbüro + Factory Integration

**Datum:** 2026-06-10
**Status:** spec
**Ticket:** (wird vergeben)

## Überblick

`/dev-status` und `/admin/planungsbuero` sind heute isolierte Inseln. Ein Ticket verschwindet aus dem Planungsbüro und taucht erst nach einem manuellen Seitenwechsel im Factory Floor auf — der vollständige Lebenszyklus `planning → staged → backlog → in_progress → qa → done` ist nirgends in einem Blick sichtbar.

Diese Spec unifies beide Seiten zu einer tab-basierten Ansicht an `/dev-status`, vollständig im mentolder Brand-System, mit einer mobil-tauglichen Fokus-Ansicht für den Kanban. Die QS-Spalte (T000581) wird als Platzhalter-Container vorbereitet; ihre Befüllung erfolgt durch den separaten QS-Plan.

## Entscheidungen

| Frage | Entscheidung |
|-------|--------------|
| Architektur | Tab-basiert — `?tab=factory` / `?tab=planung` |
| Planungsbüro-URL | `/admin/planungsbuero` → Redirect zu `/dev-status?tab=planung` |
| Mobile Kanban | Fokus-Ansicht: eine Spalte voll-breit, Pfeile + Swipe, Fortschritts-Pips |
| Visueller Stil | mentolder Brand: Ink-Navy, Brass-Akzent, Geist/Newsreader, `admin-premium.css` |
| SSE-Badges | `planning_count` im bestehenden Stream-Payload ergänzt |
| QS-Spalte | Platzhalter-Container in Factory-Tab — Implementierung via T000581 |
| Admin-Sidebar | Ein Eintrag „Dev Status" mit aktiven Tab-Badges |
| Neue Komponente | `DevStatusTabs.svelte` als Tab-Wrapper |

## Architektur

### URL-Strategie

```
/dev-status              → Factory-Tab (default)
/dev-status?tab=factory  → Factory-Tab
/dev-status?tab=planung  → Planungsbüro-Tab
/admin/planungsbuero     → HTTP 302 → /dev-status?tab=planung
```

Tab-Zustand wird per `URLSearchParams` gelesen und per `history.pushState` geschrieben — damit funktionieren Deep-Links und Browser-Back korrekt. Kein Page-Reload beim Tab-Wechsel.

### Komponenten-Hierarchie

```
dev-status.astro
  └── DevStatusTabs.svelte          (NEU)
        ├── Tab-Bar mit Live-Badges
        ├── [tab=factory] FactoryFloor.svelte  (unverändert)
        └── [tab=planung] PlanningOffice.svelte (unverändert)
```

`DevStatusTabs.svelte` hält ausschließlich Tab-Zustand + Badge-Counts. Die bestehenden Komponenten werden **nicht modifiziert** — nur eingebettet. Das minimiert Regressions-Risiko.

### SSE-Payload-Erweiterung

`/api/factory-floor/stream.ts` und `/api/factory-floor.ts` erhalten ein neues Feld im Payload:

```ts
interface PlanningCount {
  total: number;      // Tickets mit status IN ('planning','plan_staged')
  ready: number;      // davon DoR 4/4 (alle vier dor_*-Flags true)
}

// FloorPayload bekommt:
planningCount: PlanningCount;
```

Query (in `factory-floor-dal.ts` oder inline):
```sql
SELECT
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (
    WHERE (readiness->>'spec_skizziert')::bool
      AND (readiness->>'offene_fragen_geklaert')::bool
      AND (readiness->>'abhaengigkeiten_klar')::bool
      AND (readiness->>'aufwand_geschaetzt')::bool
  )                                                     AS ready
FROM tickets.tickets
WHERE status IN ('planning','plan_staged')
  AND brand = $1;
```

Tab-Badges werden daraus abgeleitet:
- Factory: `hall.length` (aktiv laufende Tickets)
- Planung: `planningCount.ready` wenn > 0, sonst `planningCount.total`

## DevStatusTabs.svelte

```ts
interface Props {
  initial: FloorPayload | null;
  initialTab: 'factory' | 'planung';  // aus URL-Param, gesetzt von dev-status.astro
}
```

Verhaltens-Spec:
- Initialer Tab aus `?tab=` URL-Param (Astro liest `Astro.url.searchParams` und gibt ihn als Prop)
- Tab-Wechsel: `history.pushState({}, '', '/dev-status?tab=<name>')`
- SSE-Verbindung wird von `DevStatusTabs` gehalten und als `floorData`-Prop an `FactoryFloor` weitergegeben (statt dass FactoryFloor selbst die SSE-Verbindung öffnet)
- Badge-Counts aus `floorData.planningCount` + `floorData.hall.length`

## Mobiler Kanban — Fokus-Ansicht

### Breakpoint

`< 768px` aktiviert die Fokus-Ansicht. Desktop (≥ 768px) bleibt unverändert — horizontaler Scroll, alle Spalten sichtbar.

### Spalten-Reihenfolge (10 Pips)

`Staged → Backlog → Scout → Design → Plan → Implement → Verify → Deploy → QS → Done`

Pips: aktive Spalte in `--brass`, abgeschlossene Spalten (links) in gedämpftem Weiß, zukünftige in `--ink-750`.

### Navigation

```svelte
let mobileColIndex = $state(0);
const COLS = ['staged','backlog','scout','design','implement','verify','deploy','qs','done'];

// Swipe-Erkennung
let touchStartX = 0;
function onTouchStart(e) { touchStartX = e.touches[0].clientX; }
function onTouchEnd(e) {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (delta < -40 && mobileColIndex < COLS.length - 1) mobileColIndex++;
  if (delta >  40 && mobileColIndex > 0)               mobileColIndex--;
}
```

Pfeil-Buttons sind zusätzlich vorhanden (Accessibility, keine Swipe-Unterstützung auf Desktop).

### Mobiler Planungsbüro-Tab

Die bestehenden Planungsbüro-Cards sind bereits `flex-col`-kompatibel. Einzige Änderung: max-width auf 100% setzen und horizontalen Padding reduzieren (`px-4` statt `px-6`). Kein Layout-Umbau nötig.

## Redirect `/admin/planungsbuero`

`website/src/pages/admin/planungsbuero.astro` wird zu einer reinen Redirect-Seite:

```astro
---
return Astro.redirect('/dev-status?tab=planung', 302);
---
```

Auth-Guard entfällt (dev-status ist bereits auth-geschützt). Bestehende Bookmarks und Links funktionieren weiter.

## Admin-Sidebar

Ein Eintrag statt zwei:

```ts
// In der Sidebar-Konfiguration (AdminLayout.astro oder ähnlich):
{
  href: '/dev-status',
  label: 'Dev Status',
  icon: '⬡',
  // Badge zeigt "Factory [2] · Planung [3]" als Sub-Label
  // Wird via SSE-Daten im PageLayout oder via <meta>-Tag befüllt
}
```

In `website/src/layouts/AdminLayout.astro` (Zeilen ~151–152) existieren aktuell zwei Einträge:
- `{ href: '/dev-status', label: 'Factory Status', … }`
- `{ href: '/admin/planungsbuero', label: 'Planungsbüro', … }`

Der `Factory Status`-Eintrag wird zu **„Dev Status"** umbenannt (href bleibt `/dev-status`). Der `Planungsbüro`-Eintrag wird entfernt.

Der Badge-Sub-Text im Sidebar-Eintrag wird client-seitig via `localStorage`-Cache der letzten SSE-Payload befüllt (kein Extra-Fetch beim Laden der Sidebar).

## QS-Spalte Platzhalter

`FactoryFloor.svelte` erhält eine neue, leere Spalte nach `deploy` mit dem Label `QS`:

```svelte
<!-- QS-Spalte: Platzhalter — Implementierung via T000581 -->
<div class="col col-qa">
  <div class="col-head">
    <span class="col-label" style="color: var(--color-accent-indigo)">QS</span>
    <span class="col-count">{data?.qaQueue?.length ?? 0}</span>
  </div>
  <div class="col-body">
    {#each data?.qaQueue ?? [] as item}
      <!-- T000581 befüllt diesen Block -->
    {/each}
  </div>
</div>
```

`FloorPayload` bekommt `qaQueue: QaItem[]` (leer-Array als Default). Keine Logik hier — nur der Container.

## Datenbankänderungen

Keine Schema-Änderungen. Nur eine neue Query für `planningCount` (pure SELECT, kein DDL).

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/pages/dev-status.astro` | `initialTab` aus URL lesen, `DevStatusTabs` einbinden |
| `website/src/pages/admin/planungsbuero.astro` | → Redirect zu `/dev-status?tab=planung` |
| `website/src/components/DevStatusTabs.svelte` | NEU — Tab-Wrapper, SSE-Owner, Badge-Counts |
| `website/src/components/FactoryFloor.svelte` | Mobile Fokus-Ansicht + QS-Platzhalter-Spalte |
| `website/src/pages/api/factory-floor.ts` | `planningCount` + `qaQueue: []` im Payload |
| `website/src/pages/api/factory-floor/stream.ts` | `planningCount` in SSE-Events |
| `website/src/components/admin/AdminLayout.astro` (o.ä.) | Sidebar: ein Eintrag „Dev Status" |

## Testing

### E2E (Playwright — `website` Projekt)

| Test-ID | Beschreibung |
|---------|--------------|
| FA-UNIF-01 | `/dev-status` öffnet Factory-Tab als Default |
| FA-UNIF-02 | `?tab=planung` öffnet Planungsbüro-Tab |
| FA-UNIF-03 | Tab-Wechsel via Klick aktualisiert URL (`pushState`) |
| FA-UNIF-04 | `/admin/planungsbuero` redirectet zu `/dev-status?tab=planung` |
| FA-UNIF-05 | Tab-Badges zeigen korrekte Counts (Mock-Daten) |
| FA-UNIF-06 | Mobile (390px viewport): Kanban zeigt Fokus-Ansicht |
| FA-UNIF-07 | Mobile: Pfeil-Buttons wechseln Spalte, Pips aktualisieren |
| FA-UNIF-08 | Admin-Sidebar hat genau einen „Dev Status"-Eintrag |

### Unit / Integrationstest

- `planningCount`-Query: korrekte Counts für `ready` (alle 4 DoR-Flags gesetzt)
- SSE-Payload enthält `planningCount`-Feld

## Nicht in Scope

- QS-Modal, QS-Checkliste, `qa_reviews`-Tabelle → T000581
- Planungsbüro-Kartendesign-Änderungen (bestehende Implementierung bleibt)
- Factory-Dispatcher-Logik
- Brett / andere Admin-Seiten
