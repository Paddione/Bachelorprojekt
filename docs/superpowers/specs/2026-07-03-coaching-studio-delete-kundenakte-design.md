---
title: "Kundenakte löschen (coaching-studio Prototyp)"
date: 2026-07-03
ticket_id: "T001563"
plan_ref: "openspec/changes/coaching-studio-delete-kundenakte/tasks.md"
status: plan_staged
---

# Kundenakte löschen — coaching-studio Prototyp

## Kontext

Der coaching-studio-Prototyp (`website/public/coaching-studio/`) ist ein reiner
Client-Side-React-Prototyp ohne Modulsystem (React 18 via CDN + Babel-Standalone,
eingebunden über `website/src/pages/admin/coaching/studio.astro`). `CUSTOMERS`
(`data.jsx:107`) ist aktuell ein statisches, modul-globales Array (kein React
State) und wurde in einem vorangegangenen Chore geleert (leere Platzhalter-Liste,
[T001560]).

Aktuell gibt es **keine Möglichkeit**, eine Kundenakte aus der UI zu löschen —
weder Kontextmenü noch Lösch-Button noch State-Mutation-Pfad.

## Ziel

Klient:innen können aus dem Dashboard (Kunden-Kachel) und aus der
Kundenakte-Detailansicht heraus gelöscht werden, mit Bestätigung, Undo-Option
und Persistenz über Seiten-Reloads hinweg (nur clientseitig, kein Backend).

## Architektur-Entscheidung: State-Lifting statt Context/Event-Bus

`CUSTOMERS` wird zu echtem React State gehoben (`useState` in `app.jsx`),
initialisiert aus `localStorage` (Fallback: das statische `CUSTOMERS`-Array aus
`data.jsx`, falls kein localStorage-Eintrag existiert). `customers` und
`onDeleteCustomer` werden als Props an `Dashboard` und `Kundenakte`
durchgereicht (Prop-Drilling — der Prototyp ist flach genug, dass ein
Context/Event-Bus unnötige Komplexität wäre).

Jede Änderung an `customers` wird synchron nach `localStorage` (Key:
`coaching-studio-customers`) serialisiert, sodass Löschungen einen
Seiten-Reload überstehen.

## Lösch-Flow (UX)

1. **Auslöser**: Trash-Icon-Button
   - Dashboard-Kachel (`screens_core.jsx`, `.kunden-grid > .card.kunde-card`):
     Karten-Root wird von `<button>` zu `<div role="button" tabIndex={0}
     onKeyDown={...}>` umgebaut (Enter/Space triggern Navigation), damit ein
     separater Trash-Button im `.head`-Bereich kein verschachteltes
     `<button>`-HTML erzeugt. Trash-Button ruft `e.stopPropagation()` auf,
     damit die Kartennavigation nicht mitausgelöst wird.
   - Kundenakte-Detailansicht (`.page-head`-Bereich, `between`-Pattern wie in
     `Dashboard`/`ProfileEditor`): destruktiv gestalteter Action-Button.
   - Stil: `btn btn-quiet btn-sm` + `Icon.trash`, `aria-label="Kundenakte
     löschen"` (bestehendes Muster aus `screens_more.jsx:98/134`).

2. **Bestätigung — zweistufiger Inline-Button** (kein neues Modal-System):
   Klick auf Trash-Icon wechselt den Button-Bereich zu „Wirklich löschen? [Ja]
   [Abbrechen]". Falls die Klient:in aktive oder pausierte Sessions hat
   (`aktiv > 0 || pausiert > 0`), zusätzlicher Warntext, z.B. „1 aktive, 1
   pausierte Session wird ebenfalls gelöscht".

3. **Ausführung**: Klick auf „Ja" entfernt den Eintrag aus `customers`
   (`setCustomers(prev => prev.filter(c => c.id !== targetId))`), was
   automatisch nach `localStorage` persistiert und ein Re-Render auslöst
   (echter State, kein Mutation-Blindspot mehr).

4. **Undo-Toast**: Nach dem Löschen erscheint ein Toast („M. Albrecht gelöscht
   — Rückgängig") mit 5s-Zeitfenster. Klick auf „Rückgängig" fügt den
   entfernten Eintrag (inkl. Original-Sessions) wieder an ursprünglicher
   Position ins Array ein. Nach Ablauf der 5s verschwindet der Toast
   automatisch, die Löschung ist endgültig (bis zum nächsten manuellen
   Wiederherstellen ist nicht vorgesehen).

5. **Navigation nach Löschen aus der Detailansicht**: `onNav("dashboard")` wird
   aufgerufen, damit die Nutzer:in nicht auf einer verwaisten Akte landet.

## Edge Cases — leeres Array

Da `customers` jetzt zur Laufzeit leer werden kann, müssen alle
`CUSTOMERS[0]`-Fallback-Stellen `undefined`-sicher gemacht werden:

- `app.jsx:23` (`TopBar`-Button „Session") und `app.jsx:30` (initialer
  `route`-State)
- `screens_core.jsx:18` (Dashboard-Header „Neue Session"-Button)
- `workspace.jsx:94` (`const cust = customer || CUSTOMERS[0]`) — kritischste
  Stelle, aktuell würde `cust.name` bei `undefined` crashen.
- `screens_core.jsx:69` (`Kundenakte`), `screens_core.jsx:157`
  (`ProfileEditor`), `screens_more.jsx:8` (`CompareView`) — gleiches
  Fallback-Muster.

Lösung: An allen Stellen, an denen kein gültiger Kunde mehr existiert (weder
über Prop noch über `customers[0]`), wird ein Empty-State gerendert
(„Keine Klient:innen vorhanden — lege eine neue Session an, sobald Daten
existieren.") statt eines Crashs.

## Betroffene Dateien

- `website/public/coaching-studio/app.jsx` — State-Lifting (`useState` +
  localStorage-Sync), Empty-State-Routing, Undo-Toast-State.
- `website/public/coaching-studio/screens_core.jsx` — Dashboard-Kachel
  (Karten-Root-Umbau, Trash-Button, Zweistufen-Bestätigung), Kundenakte-Header
  (Lösch-Action), Empty-States.
- `website/public/coaching-studio/workspace.jsx` — `undefined`-sicherer
  Fallback statt `CUSTOMERS[0]`.
- `website/public/coaching-studio/screens_more.jsx` — `CompareView`
  `undefined`-sicherer Fallback.
- `website/public/coaching-studio/data.jsx` — keine Änderung; das initiale
  Laden aus `localStorage` (mit Fallback auf das statische `CUSTOMERS`-Array)
  wird direkt in `app.jsx` beim `useState`-Init durchgeführt, da dort auch der
  neue State lebt.

Kein Backend-/API-Zugriff nötig — reine clientseitige Logik, keine
Datenbank-Anbindung (Prototyp-Charakter bleibt erhalten).

## Testing

Da der Prototyp über `<script type="text/babel">`-Tags ohne Modulsystem lädt
und keine bestehende Vitest-/BATS-Abdeckung für `coaching-studio/` existiert
(siehe Chore [T001560]), wird die Verifikation manuell im Browser durchgeführt
(Dev-Server, `/admin/coaching/studio`): Löschen aus Dashboard, Löschen aus
Detailansicht, Undo-Funktion, Reload-Persistenz, leeres Array (alle Kund:innen
gelöscht) ohne Crash, Tastaturnavigation der umgebauten Dashboard-Kachel.

## Nicht im Scope

- Keine Server-/DB-Persistenz (rein `localStorage`, clientseitig).
- Kein generisches Modal-System (bewusst vermieden, siehe Architektur-Entscheidung).
- Keine Mehrfachauswahl/Bulk-Löschen.
