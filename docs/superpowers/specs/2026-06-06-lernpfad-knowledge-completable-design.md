---
ticket_id: null
---

# Lernpfad & Agent-Anleitung — durchspielbar + sidekick-natives Nudging

**Datum:** 2026-06-06
**Branch:** `feature/lernpfad-knowledge-completable`
**Status:** Spec (brainstormed, vom Owner freigegeben)

## Problem

Das Wissenssystem des Portals (28 abschließbare Items = 13 Goals + 15 Tools aus
`agent-guide.generated.json`, gruppiert in 8 Themen) ist heute **nicht end-to-end
durchspielbar**, und die vorhandene Onboarding-Funnel, die User ins System führen
soll, ist **faktisch tot**. Konkret (durch Code-Recon belegt):

1. **Lernpfad-CTA ist eine Sackgasse.** Jeder „weiter lernen →"-Link auf
   `/portal/loslernen` zeigt auf `/portal/arena?jumpTo=<id>`, aber `arena.astro`
   liest ausschließlich `?lobby=` und ignoriert `jumpTo` vollständig → der User
   landet in einer leeren Spiel-Lobby ohne Lerninhalt. Die einzige Vorwärts-Aktion
   des Dashboards führt ins Nichts.
2. **Notiz speichern setzt „erledigt" zurück (stiller Datenverlust).**
   `GuideCard.svelte#saveNote()` postet die Notiz **ohne** `status`. In
   `learning-db.ts#upsertLearningItem` wird ein fehlender Status zu `'todo'`
   (`opts.status || 'todo'`), und die `ON CONFLICT`-UPDATE schreibt
   `status = $5` und `completed_at = $8` (null) bedingungslos. Folge: eine Notiz
   an einem bereits abgeschlossenen Item **de-completed es** (status → todo,
   completed_at → null).
3. **`getLearningSummary` kann `done > total` / `pct > 100 %` liefern**, weil die
   `done`/`in_progress`-Counts nicht gegen die kanonischen 28 Guide-IDs gefiltert
   sind (Alt-Zeilen entfernter Items zählen weiter mit).
4. **Onboarding-Sequenz hängt ewig auf Schritt 1.** `markOnboardingStep` wird von
   **keinem** Client jemals aufgerufen (`/api/portal/onboarding/mark-step` hat
   null Aufrufer). `isOnboardingStepComplete('sidekick-intro')` bleibt für immer
   `false`, daher feuern Schritt 2 (`agent-guide-intro`) und 3 (`loslernen-intro`)
   — genau die, die in Agent-Anleitung + Lernpfad nudgen — **nie**.
5. **Tote Kickoff-Navigation.** Die Primary-Action eines Nudges legt einen Prompt
   in `sessionStorage['assistant.kickoff']` ab, den **niemand** liest → der Klick
   bringt den User nirgendwohin.
6. **Nudges sind in der falschen Oberfläche.** Nudges rendern nur in der alten,
   feature-flag-gated `AssistantWidget`/`AssistantBubble`-Blase, **nicht** im
   `PortalSidekick`, den der User tatsächlich öffnet und der die Agent-Anleitung +
   den Lernpfad-Link hostet. Der Sidekick kennt weder Nudges noch Lernstand
   (kein Badge, kein Banner, kein Auto-Open).

## Ziel

- Das 28-Item-Wissenssystem ist **end-to-end durchspielbar**: vom Lernpfad-Dashboard
  in genau die passende Guide-Karte, dort abschließen, ohne dass irgendeine Aktion
  den Fortschritt stillschweigend zerstört, mit einem sichtbaren **Fertig-Zustand**
  bei 100 %.
- **Jeder** eingeloggte Portal-User (inkl. gekko/`quamain` & paddione, die realen
  Nutzer) wird **im Sidekick** sichtbar und funktionierend ins System geführt.

## Nicht-Ziele (bewusst ausgeschlossen)

- Content-Erweiterung: verwaiste Tools (`agent-test`, `task-oracle`) in Goal-Flows
  einhängen, Territory-Map-Abdeckung (12/37 Komponenten), Hardware-/Topologie-Blurbs.
- Migration der **operativen** Bubble-Nudges (Unterschriften, Termine, Coach-Nachrichten)
  in den Sidekick — diese bleiben unangetastet auf der Bubble.
- M5 (persistenter Cluster-Brainstorm-Companion).
- Umbau des Item-Modells (kein Quiz/Gating/Prerequisites; Abschluss bleibt
  selbst-attestiert per Status-Toggle).

## Gewählter Ansatz fürs Nudging: **Summary-getrieben (Ansatz A)**

Der Sidekick leitet den „nächsten Schritt" aus dem **echten Lernfortschritt**
(`/api/portal/learning/summary`) ab — nicht aus der separaten, aktuell toten
`onboarding_state`-Sequenz. Vorteile: immer an (kein Feature-Flag), in Dev testbar,
self-contained, direkt an die Realität gekoppelt. Die alte
`portal-onboarding-sequence` (Bubble) wird dadurch **abgelöst**.

---

## Arbeits-Units

### Unit 1 — Abschluss-Schleife: DML-Fixes (`website/src/lib/learning-db.ts`)

**1a. Notiz-only-Save darf den Status nicht anfassen.**
- `upsertLearningItem` muss zwischen „Status explizit gesetzt" und „undefined" unterscheiden.
- Bei `opts.status === undefined` (Notiz-only): `status`, `started_at`, `completed_at`
  der bestehenden Zeile **bleiben unverändert**; nur `note` + `updated_at` werden geschrieben.
- Bei explizitem Status: Verhalten wie heute — `started_at` ist „sticky" (erste
  Nicht-todo-Zeit gewinnt, via `COALESCE`), `completed_at = now()` bei `'done'` und
  `NULL` bei `'todo'`/`'in_progress'`.
- **Zusatz (Politur):** `completed_at` wird bei wiederholtem `'done'` „sticky"
  (`COALESCE(existing.completed_at, now())`), damit die ursprüngliche Abschlusszeit
  erhalten bleibt.
- Implementierungshinweis: `status` als nullable Parameter durchreichen; die
  `ON CONFLICT … DO UPDATE`-Klausel via `CASE`/`COALESCE` konditional auf NULL
  reagieren lassen. Der INSERT-Pfad (neue Notiz-only-Zeile ohne je gesetzten Status)
  defaultet weiterhin auf `status='todo'`.

**1b. Summary gegen die kanonischen IDs deckeln.**
- `getLearningSummary` zählt `done`/`in_progress` nur für Items, deren `(item_type, item_id)`
  im kanonischen Guide-Set (`guideItemsCache`) liegen. Garantie: `done ≤ total`,
  `0 ≤ pct ≤ 100`.

**1c. Brand konsequent aus der Session.**
- Keine **neuen** stillen `'mentolder'`-Defaults für eingeloggte User; `track.ts`,
  `summary.ts`, `mark-step.ts` und der Meilenstein-Write leiten `brand` aus
  `session.brand` ab (bestehender `?? 'mentolder'`-Last-Resort darf bleiben, wird aber
  nicht ausgeweitet). Der hartcodierte `brand='mentolder'` in der abgelösten
  `portal-onboarding-sequence` verschwindet mit dem Trigger (siehe Unit 3c).

### Unit 2 — Lernpfad-CTA → Guide-Karte (Cross-Component Open+Scroll)

**2a. `website/src/pages/portal/loslernen.astro`:**
- Den `<a href="/portal/arena?jumpTo=…">`-CTA ersetzen durch eine **In-Page-Aktion**
  (kein Seitenwechsel — der Sidekick ist auf derselben Seite via `PortalLayout` gemountet).
- Items tragen `data-jump-domid="ag-<goal|tool>-<id>"`. Ein kleines inline-`<script type="module">`
  hängt einen Click-Handler an, der
  `window.dispatchEvent(new CustomEvent('sidekick:navigate', { detail: { view: 'agent-guide', jumpTo: '<domId>' } }))` feuert.

**2b. `website/src/components/PortalSidekick.svelte`:**
- Auf `window`-Event `sidekick:navigate` hören: Drawer öffnen (`open=true`),
  `view = detail.view`, `detail.jumpTo` als `pendingJump` speichern und an
  `AgentGuideView` als Prop reichen. Listener in `onMount` registrieren + in der
  Teardown-Funktion entfernen.

**2c. `website/src/components/assistant/AgentGuideView.svelte`:**
- Neuer optionaler Prop `jumpTo: string | null`. Ein `$effect` ruft — nach Hydration
  (`hydrated`) und nach dem Summary-Load — die **vorhandene** `jumpTo(domId)`-Funktion
  (expand + scrollIntoView + flash). Kein duplizierter Scroll-Code. Der Prop wird nach
  Verarbeitung „verbraucht" (Guard gegen Re-Trigger; analog zum bestehenden
  `untrack`-Muster).

### Unit 3 — Sidekick-natives Nudging (Ansatz A)

**3a. FAB-Aufmerksamkeitssignal (`PortalSidekick.svelte`):**
- Beim Mount zusätzlich `/api/portal/learning/summary` laden (fail-soft, wie die
  bestehenden Fetches). Solange `done < total` (Portal-Kontext, eingeloggt): ein
  dezenter Aufmerksamkeitspunkt auf dem FAB. Verschwindet bei `done === total`.

**3b. Fortschritt + Banner in `SidekickHome.svelte`:**
- Summary als Prop in `SidekickHome` reichen.
- Zeilen „Agent-Anleitung" und „Lernpfad" bekommen einen Fortschritts-Hinweis
  (`done/total`) als Sub-/Badge. **`total` immer live aus der Summary**, nie als
  Literal `28` hartcodiert.
- Über der Liste ein Banner:
  - `done === 0` → „Starte deinen Lernpfad" → `onNavigate('agent-guide')`.
  - `0 < done < total` → „Weiter lernen · done/total" → `onNavigate('agent-guide')`.
  - `done === total` → dezenter „✓ Lernpfad abgeschlossen"-Hinweis (kein CTA).

**3c. Tote Funnel ablösen (`website/src/lib/assistant/triggers/portal.ts`):**
- Den Trigger `portal-onboarding-sequence` (3 tote Schritte) **entfernen** inkl.
  `ONBOARDING_STEPS`-Konstante und des `isOnboardingStepComplete`-Imports, falls
  sonst ungenutzt. Die übrigen Portal-Trigger (first-login, signature, session-24h/1h,
  coach-message, fragebogen) bleiben unverändert.
- Damit verschwindet auch der ewig-hängende „Willkommen bei deinem Sidekick"-Toast in Prod.

### Unit 4 — Fertig-Zustand (Politur)

**4a. `loslernen.astro`:**
- Bei `summary.done === summary.total && summary.total > 0`: eine
  **„🎉 Geschafft"-Karte** oben (statt/über der Themenliste): „Du hast alle
  {total} Bausteine gelernt."
- **Meilenstein persistieren (idempotent, keine Schema-Migration):** wenn die
  Summary erstmals 100 % erreicht, postet der Client einmalig
  `POST /api/portal/onboarding/mark-step { stepId: 'learning-complete' }`
  (Upsert → idempotent). Das macht den Abschluss in der Admin-Member-Ansicht sichtbar.

**4b. `AgentGuideView.svelte`:**
- Im Fortschrittsbereich bei `pct === 100` einen sichtbaren Fertig-Zustand
  („🎉 Alle {total} gelernt") statt nur „100 % — N/N erledigt".

---

## Daten & Schnittstellen

- **Keine Schema-Migration.** Tabellen `learning_progress` + `onboarding_state`
  (`k3d/website-schema.yaml`) unverändert. Der 100-%-Meilenstein renutzt
  `onboarding_state` mit `step_id = 'learning-complete'`.
- Neues Window-Event-Kontrakt: `CustomEvent('sidekick:navigate', { detail: { view, jumpTo } })`.
- Bestehende APIs unverändert in der Signatur:
  `/api/portal/learning/summary` (GET), `/api/portal/learning/track` (POST),
  `/api/portal/onboarding/mark-step` (POST).

## Fehlerbehandlung

- Alle neuen Client-Fetches im Sidekick sind fail-soft (Banner/Badge erscheinen
  schlicht nicht, wenn die Summary nicht lädt) — analog zum bestehenden Muster.
- Event-Listener defensiv (Guard auf `detail`, unbekannte `view` ignorieren).
- `mark-step('learning-complete')` schlägt still fehl, ohne den Fertig-Zustand zu blockieren.

## Akzeptanzkriterien

1. Klick auf „weiter lernen →" eines Items auf `/portal/loslernen` öffnet den
   Sidekick auf „Agent-Anleitung" und scrollt/expandiert genau die zugehörige
   Karte (`ag-<type>-<id>`). `/portal/arena?jumpTo=` wird nicht mehr verlinkt.
2. Eine Notiz an einem bereits auf „● erledigt" gesetzten Item ändert dessen Status
   **nicht** und löscht `completed_at` **nicht**.
3. `getLearningSummary` liefert nie `done > total` oder `pct > 100`, auch wenn
   verwaiste `learning_progress`-Zeilen existieren.
4. Ein eingeloggter Portal-User mit `done === 0` sieht beim Öffnen des Sidekicks
   ein Banner „Starte deinen Lernpfad" und einen FAB-Aufmerksamkeitspunkt; beides
   führt in die Agent-Anleitung. Bei `0 < done < total` zeigt das Banner „Weiter lernen · N/28".
5. Bei `done === total`: Fertig-Karte auf `/portal/loslernen`, kein FAB-Punkt,
   und ein `onboarding_state`-Eintrag `learning-complete` existiert.
6. Der tote `portal-onboarding-sequence`-Trigger ist entfernt; keine hängende
   „Willkommen bei deinem Sidekick"-Schleife mehr.
7. Funktioniert für **beide** Brands (mentolder + korczewski) — Brand kommt aus der Session.

## Testplan (TDD)

- **Vitest (`learning-db`):**
  - Notiz-only-Save erhält `status='done'` + `completed_at`.
  - Statuswechsel `todo→in_progress→done→todo` setzt `started_at`/`completed_at` korrekt;
    erneutes `done` behält ursprüngliches `completed_at`.
  - `getLearningSummary` deckelt `done`/`pct` bei verwaisten IDs.
- **Svelte-Komponententests:**
  - `sidekick:navigate`-Event → `PortalSidekick` öffnet, setzt view, reicht `jumpTo`;
    `AgentGuideView` ruft `jumpTo` (gemockt/observiert).
  - `SidekickHome`-Banner-Logik: done=0 / 0<done<total / done=total.
- **Playwright-E2E (neu — Lernpfad hat heute keinen E2E):**
  - Eingeloggt auf `/portal/loslernen`: Klick „weiter lernen →" öffnet den Sidekick
    mit der passenden Karte (assert sichtbar/expandiert). Projekt-Zuordnung gemäß
    dev-flow-gotchas (portal/authentifiziertes Projekt).
- **CI-Pflicht:** `website/src/data/test-inventory.json` nach Test-Ergänzungen
  via `task test:inventory` regenerieren und mitcommitten.

## Betroffene Dateien (Touch-Liste)

- `website/src/lib/learning-db.ts` (1a, 1b)
- `website/src/pages/api/portal/learning/track.ts` (1c, ggf.)
- `website/src/pages/api/portal/learning/summary.ts` (1c, ggf.)
- `website/src/pages/portal/loslernen.astro` (2a, 4a)
- `website/src/components/PortalSidekick.svelte` (2b, 3a)
- `website/src/components/assistant/AgentGuideView.svelte` (2c, 4b)
- `website/src/components/assistant/SidekickHome.svelte` (3b)
- `website/src/lib/assistant/triggers/portal.ts` (3c)
- Tests: `website/src/lib/learning-db.test.ts`, neue Komponententests, neuer Playwright-Spec,
  `website/src/data/test-inventory.json`
