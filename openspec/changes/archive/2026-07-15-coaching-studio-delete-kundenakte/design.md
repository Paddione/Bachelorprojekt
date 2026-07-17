## Context

Der coaching-studio-Prototyp (`website/public/coaching-studio/`) lädt reines
React-JSX über `<script type="text/babel">`-Tags (Babel-Standalone via CDN,
kein Bundler/Modulsystem, keine `import`/`export`-Statements). Gemeinsamer
Zustand läuft ausschließlich über `window`-Globals
(`Object.assign(window, {...})` in `data.jsx:130`). `CUSTOMERS` ist aktuell ein
statisches Array (aktuell leer, siehe [T001560]) ohne React State — jede
Mutation würde kein Re-Render auslösen. Volle Architektur-Details siehe Spec:
`docs/superpowers/specs/2026-07-03-coaching-studio-delete-kundenakte-design.md`.

## Goals / Non-Goals

**Goals:**
- Kundenakten aus Dashboard-Kachel und Detailansicht löschbar machen, mit
  Bestätigung, Undo und Persistenz über Reloads.
- Bestehenden State-lose `CUSTOMERS`-Zugriff in echten React State überführen,
  ohne die Prop-Drilling-Philosophie des Prototyps zu verlassen (kein Context,
  kein Redux).

**Non-Goals:**
- Keine Server-/DB-Persistenz — rein `localStorage`, der Prototyp bleibt ein
  reines Frontend-Demo ohne Backend-Anbindung.
- Kein generisches Modal-/Dialog-System — Bestätigung erfolgt inline im
  bestehenden Button.
- Keine Mehrfachauswahl/Bulk-Löschen.
- Keine Änderung an produktiven Coaching-Features (SessionWizard,
  `coaching.session_steps`, `assistant_messages`) — vollständig isoliert vom
  Prototyp.

## Decisions

**State-Lifting statt Context/Event-Bus:** `useState` in `app.jsx`,
initialisiert aus `localStorage` (Key `coaching-studio-customers`) mit
Fallback auf das statische `CUSTOMERS`-Array aus `data.jsx`. `customers` und
`onDeleteCustomer`/`onUndoDelete` werden als Props an `Dashboard` und
`Kundenakte` durchgereicht. Begründung: Der Prototyp ist flach (5 Dateien,
keine tiefe Komponenten-Hierarchie), Context/Event-Bus wären unnötige
Komplexität für ein Demo-Tool ohne weiteres Wachstumsversprechen.

**Zweistufige Inline-Bestätigung statt Modal:** Kein neuer
Dialog-/Overlay-Baustein. Trash-Button wechselt bei Klick lokal zu „Wirklich
löschen? [Ja] [Abbrechen]". Begründung: Es existiert bereits kein
Modal-Pattern im Prototyp; ein neues Overlay-System für einen einzelnen
Use-Case wäre Scope-Explosion (siehe Codebase-Analyse: keine
`<dialog>`/Overlay-Komponente vorhanden).

**Undo via 5s-Toast statt Soft-Delete-Flag:** Gelöschte Einträge werden aus
dem Array entfernt (`.filter`), nicht mit einem `deleted:true`-Flag markiert.
Der Toast hält eine Kopie des entfernten Objekts (inkl. Sessions) im
Toast-State und fügt sie bei „Rückgängig" zurück ein. Begründung: Einfacher
als Soft-Delete-Filterung an jeder Lesestelle; das Zeitfenster ist kurz genug,
dass ein einfacher In-Memory-Snapshot ausreicht.

**Karten-Root-Umbau `<button>` → `<div role="button">`:** Nötig, weil ein
zusätzlicher Trash-Icon-Button innerhalb der Kachel sonst verschachteltes
`<button>`-HTML erzeugen würde (ungültig, Klick-Event-Bubbling-Probleme).
`onKeyDown` (Enter/Space) erhält die Tastaturzugänglichkeit.

## Risks / Trade-offs

- **[Risiko]** `localStorage` kann zwischen Browser-Profilen/Inkognito
  divergieren → Demo-Zustand ist nicht geräteübergreifend konsistent.
  **Mitigation**: Akzeptiert, da der Prototyp ohnehin nur lokal/demo-artig
  genutzt wird (kein Multi-User-Sync-Anspruch).
- **[Risiko]** `CUSTOMERS[0]`-Fallback-Stellen, die nicht vollständig erfasst
  werden, könnten weiterhin bei leerem Array crashen. **Mitigation**: Die
  Codebase-Analyse hat alle Fundstellen identifiziert (app.jsx, workspace.jsx,
  screens_core.jsx, screens_more.jsx) — der Implementierungsplan muss jede
  einzeln absichern und im finalen Verify-Schritt manuell mit leerem Array
  gegentesten.
- **[Trade-off]** Kein automatisierter Test (Vitest) für dieses Feature, da
  der Prototyp ohne Modulsystem/Build-Step läuft und keine bestehende
  Test-Infrastruktur für `coaching-studio/*.jsx` existiert. Verifikation
  erfolgt manuell im Dev-Server-Browser (dokumentiert im Plan).

## Migration Plan

Keine Migration nötig — rein additive Client-Code-Änderung, keine
Datenmigration, kein Rollout über Umgebungen (Prototyp wird nur über
`task feature:website` mit dem restlichen Static-Asset-Ordner ausgeliefert).
Rollback: einfacher Revert des PRs, da keine Server-/DB-Zustandsänderung.

## Open Questions

Keine offenen Fragen — alle Entscheidungen wurden im Brainstorming
(2026-07-03) mit dem Nutzer geklärt (Persistenz, Undo, Sessions-Warnhinweis,
Platzierung).
