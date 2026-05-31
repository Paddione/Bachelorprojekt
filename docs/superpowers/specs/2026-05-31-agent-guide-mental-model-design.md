# Agent-Anleitung — „Mental-Model" Einstieg (Design Spec)

- **Datum:** 2026-05-31
- **Branch:** `feature/agent-guide-mental-model`
- **Status:** approved (brainstorming)
- **Vorgänger:** `2026-05-31-agent-guide-sidekick-ux-design.md` (UX-Basis), `2026-05-31-docs-sidekick-refresh-design.md` (Init-Prompts/Reskin), `2026-05-31-agent-guide-inapp-help-design.md` (In-App-Surface)

## Problem & Ziel

Die Agent-Anleitung im Sidekick ist heute ein **Katalog für Profis**: ein:e Kenner:in tippt einen Suchbegriff und landet auf der richtigen Karte. Für die eigentliche Zielgruppe — **Mitstreiter:innen und Future-Patrick, die die Plattform *nicht* kennen** — fehlt das Davor: ein mentales Modell davon, *wie* die Plattform funktioniert und *wie* eine Änderung sicher von der Idee bis live reist.

Ziel: Die Anleitung beginnt mit einer **lehrenden Landkarte** und lässt von dort in den vorhandenen Katalog drillen. Sie soll **onboarden, nicht nur routen** — und dabei die heutige schnelle Referenz für Profis erhalten (Karte ist wegklappbar).

Dieser Spec adressiert die vier vom User benannten Lücken in einem kohärenten Umbau:
- **Content coverage** — jede Flow-Station und jeder Plattform-Baustein bekommt erklärenden Inhalt; fehlende Szenarien werden ergänzt.
- **Findability & navigation** — die Karte ist ein neuer, visueller Einstiegs-Filter neben Suche/Thema/Gefahr/Art.
- **Actionability** — Stationen/Bausteine führen direkt zu den passenden Karten mit Schritten und Copy-Prompts.
- **Onboarding & polish** — die Karte ist der First-Run-Einstieg mit Lese-Hinweis; passt in den Dark-Reskin; farbblind-sicher.

## Gewählter Ansatz (aus Brainstorming)

- **Variante C** — „Concept-first / Mental-Model"-Einstieg (statt Katalog-zuerst).
- **Geschichtete Karte (Variante 3):** Fluss-Band oben **+** Gebietskarte darunter.
- **Gebietskarte = „Both, infra as backdrop":** die echte Plattform-Topologie (Brands → `fleet`-Cluster mit Dienst-Bausteinen → Secrets/Backups), jeder Knoten **eingefärbt nach zuständiger Domäne/Agent** und mit Gefahrenstufe badged.

## Die Erfahrung (UX)

Beim Öffnen der Agent-Anleitung erscheint **oberhalb** des heutigen Find-Bars eine ein-/ausklappbare Karte **„🧭 So funktioniert die Plattform"** mit zwei Ebenen:

1. **Fluss-Band** (lehrt „wie reist ein Change sicher"):
   `💡 Idee → 🧠 Brainstorm → 📋 Plan → 💻 Code+TDD → 🔀 PR+CI → 🚀 Deploy → 🌍 Live`
   Jede Station ist nach ihrer **Gefahrenstufe** eingefärbt (Rand/Emoji-Punkt) und anklickbar.

2. **Gebietskarte** (lehrt „was läuft wo"):
   `🏷️ mentolder.de · korczewski.de` → Box **`☸️ fleet`** mit Dienst-Chips (Keycloak, Nextcloud, Website, shared-db, Vaultwarden, LiveKit, …) → darunter `🔒 Secrets`, `💾 Backups`.
   Jeder Knoten trägt einen **linken Farbrand in der Akzentfarbe seiner Domäne** (aus `themes.yaml`) und ein **Gefahrenstufen-Badge** (aus `components.yaml › sensitivity`). Anklickbar.

**Drill-down:** Klick auf eine Station **oder** einen Knoten setzt einen `mapFilter`, der den Katalog darunter auf die zugehörigen Karten filtert und dorthin scrollt. Suche, Gefahr- und Thema-Filter **komponieren** weiterhin mit diesem neuen Filter (die Karte ist nur eine weitere Filter-Achse). Ein sichtbares „Filter: Station Plan ✕"-Chip erlaubt das Zurücksetzen.

**Profi-Modus:** Die Karte ist einklappbar; der eingeklappte Zustand wird in `localStorage` gemerkt (Muster wie `ag-axis-v1`, neuer Key `ag-map-v1`). Eingeklappt sieht man exakt die heutige Referenzansicht.

## Datenmodell (additiv, keine Breaking Changes)

Single source of truth bleibt `docs/agent-guide/registry/*.yaml`. Änderungen:

1. **Neu: `registry/flow.yaml`** — geordnete Stationen des Fluss-Bands:
   ```yaml
   - { id: idee,      label_de: "Idee",       emoji: "💡", danger: safe,    order: 1, blurb_de: "Was soll sich ändern? Noch nichts angefasst." }
   - { id: brainstorm,label_de: "Brainstorm", emoji: "🧠", danger: safe,    order: 2, blurb_de: "Idee zu einem Design schärfen." }
   - { id: plan,      label_de: "Plan",       emoji: "📋", danger: caution, order: 3, blurb_de: "Schritt-für-Schritt-Plan schreiben." }
   - { id: code,      label_de: "Code+TDD",   emoji: "💻", danger: caution, order: 4, blurb_de: "Test zuerst, dann umsetzen." }
   - { id: pr-ci,     label_de: "PR+CI",      emoji: "🔀", danger: assisted,order: 5, blurb_de: "Pull Request öffnen, CI muss grün sein." }
   - { id: deploy,    label_de: "Deploy",     emoji: "🚀", danger: assisted,order: 6, blurb_de: "Änderung live bringen (Flux/Task)." }
   - { id: live,      label_de: "Live",       emoji: "🌍", danger: safe,    order: 7, blurb_de: "Läuft es? Status & Logs prüfen." }
   ```

2. **`goals.yaml` + `tools.yaml`:** optionales Feld `stages: [<flow-id>…]`. Ein mehrstufiges Ziel (z. B. `bug-beheben`) trägt `stages: [plan, code, pr-ci, deploy]`. Fehlt das Feld, taucht der Eintrag nicht im Fluss-Band auf (nur im Katalog) — abwärtskompatibel.

3. **`components.yaml`:** pro Baustein zwei neue Felder:
   - `theme: <domain-id>` — die zuständige Domäne (= Akzentfarbe & impliziter Agent). Referenz auf `themes.yaml`.
   - `area: brand | cluster | cross-cutting` — Platzierung auf der Gebietskarte.
   - bestehendes `links: []` wird genutzt, um auf relevante `goals`/`tools`-IDs zu zeigen (Drill-Ziel beim Klick auf einen Knoten).
   `sensitivity` (existiert bereits) liefert das Gefahren-Badge.

4. **`scripts/agent-guide/emit-webapp.mjs`:** emittiert einen neuen `map`-Block in `website/src/lib/agent-guide.generated.json`:
   ```jsonc
   "map": {
     "flow":      [ { "id":"plan","label_de":"Plan","emoji":"📋","danger":"caution","blurb_de":"…","goalIds":[…],"toolIds":[…] }, … ],
     "territory": { "brands":[…components…], "cluster":[…], "crossCutting":[…] }   // je Knoten: slug, name, emoji, theme(+accent), sensitivity, linkIds
   }
   ```
   Die `goalIds`/`toolIds` je Station werden aus `stages` rückwärts aufgelöst (Emitter-seitig), damit die UI keinen Join machen muss.

5. **`scripts/agent-guide/validate.mjs`:** prüft, dass jede `stages`-ID in `flow.yaml`, jedes `components.theme` in `themes.yaml` und jede `links`/`goalIds`/`toolIds`-ID existiert; warnt, wenn eine Flow-Station **keine** Karte hat (Content-Lücke).

## Rendern & Interaktion

- **Neu: `website/src/components/assistant/agent-guide/GuideMap.svelte`** — rendert Fluss-Band + Gebietskarte aus `map`. Emittiert ein `select`-Event `{kind:'flow'|'node', id}`.
- **`AgentGuideView.svelte`:** mountet `<GuideMap>` oberhalb von `<GuideFindBar>`; hält `mapFilter`-State; reicht ihn an die bestehende Filter-Pipeline weiter.
- **`agentGuideSearch.ts`:** `filterEntries` bekommt ein zusätzliches Prädikat `matchesMapFilter(entry, mapFilter)` — Komposition mit Text/Tier/Theme bleibt multiplikativ. Keine Änderung an der Such-Normalisierung.
- **CSS:** alle Stile in `website/src/styles/sidekick-panels.css` unter `.drawer .ag-map*` (etabliertes nicht-scoped Muster wegen Svelte-5/Vite-CSS-Pruning).
- **Klapp-Zustand:** `ag-map-v1` in `localStorage`, gleiches debounced-write-Muster wie `ag-open-v1`.

## Lehren (Teaching-Glue)

- **Glossar-Tooltips:** Begriffe, die einer `glossary.yaml`-ID entsprechen, werden in Karten- und Karten-Texten als Chip mit gepunktetem Unterstrich gerendert; Hover/Tap öffnet ein kleines Popover mit der deutschen Definition. Tastatur- und Screenreader-zugänglich (`aria-describedby`, fokussierbar). Umsetzung als kleiner, testbarer Svelte-Wrapper `GlossaryTerm.svelte`.
- **Konzept-Zeile:** Jede Ziel-Karte bekommt eine optionale einzeilige `concept_de`-Erklärung („Konzept: ein *Skill* ist …"). Fehlt sie, fällt die UI auf die `summary_de` des ersten verlinkten Tools zurück.

## Onboarding & Polish

- **First-Run:** Sind keine `ag-*`-Keys in `localStorage`, startet die Karte **aufgeklappt** mit Hinweis *„Neu hier? Folge dem Band von links."* Danach respektiert sie den gemerkten Zustand.
- **Dark-Reskin:** nutzt die vorhandenen Tokens; Domänen-Akzente sind kühle Hues (aus `themes.yaml`), die nie mit der warmen Gefahren-Rampe kollidieren.
- **Farbblind-Sicherheit:** Gefahrenstufe immer redundant (Emoji-Punkt **+** Rand **+** Badge-Text), Domäne über Akzent **plus** Label — nie Farbe allein.

## Content coverage

Eine Inhalts-Audit stellt sicher, dass **jede Flow-Station ≥1 Ziel/Tool** und **jeder Gebiets-Knoten einen Erklärtext** hat. Erwartete Ergänzungen (per `validate.mjs`-Warnung getrieben): Stationen `pr-ci` und `live` brauchen voraussichtlich neue Ziele (z. B. „PR öffnen & CI grün bekommen", „Prüfen ob mein Deploy live ist / Logs lesen"). Bausteine in `components.yaml` werden mit `theme`/`area`/`links` vervollständigt.

## Testing

- **Registry/Emitter:** `validate.test.mjs` (neue Felder, Referenz-Integrität, „leere Station"-Warnung), `emit-webapp.test.mjs` (der `map`-Block wird korrekt geformt).
- **Such-Logik:** `agentGuideSearch.test.ts` — `mapFilter` komponiert korrekt mit Text/Tier/Theme; Zurücksetzen funktioniert.
- **E2E (`tests/e2e/specs/agent-guide-walkthrough.spec.ts`):** Karte rendert (Fluss-Band + Gebietskarte sichtbar); Klick auf Station filtert Katalog + scrollt; Klick auf Knoten filtert; Glossar-Tooltip öffnet per Klick & Tastatur; Karte einklappen → Zustand bleibt nach Reload. Film-Modus-Schritt ergänzt.
- **CI-Gate:** committetes `agent-guide.generated.json` muss weiterhin dem Emitter-Output entsprechen (`task test:agent-guide` + Inventory-Check).

## Out of Scope / Non-Goals

- **Kein** Mode-Split „Lernen/Nachschlagen" (Variante B verworfen) — die Karte ist wegklappbar, das genügt.
- **Kein** Feature-Flag — der Umbau ist Inhalt + UI und additiv; die Referenzansicht bleibt jederzeit funktionsfähig.
- **Keine** Änderung an den agent-readable Maps unter `docs/agent-guide/maps/` (`task agent-guide:maps`) — die sind für Agenten, nicht für diese visuelle Karte. Bleibt unangetastet.
- **Kein** Umbau der Such-Normalisierung oder der bestehenden Achsen (Thema/Gefahr/Art bleiben).
- Der **kollaborative Brainstorm-Tunnel** (gekko schaut/macht mit) ist eine **separate** Arbeit (eigener Spec, später).

## Risiko

Niedrig: jede Änderung ist additiv auf einer gut getesteten SSOT→Emitter→UI-Pipeline. Der Katalog funktioniert auch bei eingeklappter / fehlerhafter Karte weiter. Ein PR, kein Flag.
