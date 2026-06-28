---
title: Admin-Menü Umstrukturierung
slug: adminmenu-restructure
date: 2026-06-28
status: approved
ticket_id: ""
plan_ref: openspec/changes/adminmenu-restructure/tasks.md
tags: [website, admin, navigation, ui]
---

# Admin-Menü Umstrukturierung — Design-Spec

## Ziel

Das Admin-Seitenmenü radikal vereinfachen: redundante Links entfernen, Werkstatt-Section hinter einem Akkordeon verstecken, Infrastruktur-Dev-Tools auf das Dashboard verschieben und eine zentrale Content-DB-Seite für alle schriftlichen Assets einführen. Außerdem E2E-Testdaten dauerhaft aus dem Prod-Postfach verbannen.

---

## Änderungen im Überblick

### 1. Sidebar — Entfernte Items

**Aus `Geschäft`-Sektion entfernt (Pages bleiben erreichbar, nur Nav-Link weg):**
- `Mitglieder` (`/admin/members`) — Klienten-Liste reicht
- `Mandate` (`/admin/projekte`) — Projekte werden in Tickets verfolgt
- `Kontierung` (`/admin/buchhaltung`) — über Fakturierung erreichbar

**Aus `Geschäft`-Sektion ersetzt:**
- `Sitzungen` (`/admin/coaching/sessions`) → **`Studio`** (`/admin/coaching/studio`)

**Aus `Infrastruktur`-Sektion entfernt (wandern aufs Dashboard):**
- `Plattform Hub` (`/admin/platform`)
- `Dev Status` (`/dev-status`)
- `DORA` (`/admin/dora`)
- `Repo Health` (`/admin/repohealth`)

### 2. Geschäft-Sektion nach der Änderung

```
Klienten         → /admin/clients
Studio           → /admin/coaching/studio   ← neu (war: Sitzungen)
Fakturierung     → /admin/rechnungen
```

### 3. Werkstatt-Akkordeon

Die 8 bisherigen Werkstatt-Items + das neue Content-DB-Item werden hinter einem einzigen aufklappbaren Einstiegspunkt gruppiert.

**Akkordeon-Verhalten:**
- Sidebar zeigt einen "Werkstatt"-Header-Button mit Pfeil-Icon (↓/↑)
- Klick togglet Sichtbarkeit der Sub-Items via `classList.toggle`
- Wenn der aktive Pfad auf eines der Sub-Items matcht → Akkordeon startet aufgeklappt (serverseitig gerendert via Astro-Prop)
- Kein Svelte nötig — reiner `<script>`-Block in `AdminSidebarNav.astro`
- State wird NICHT in localStorage persistiert (zu wenig Nutzen, zu viel Komplexität)

**Sub-Items (9 total):**
```
Content Hub      → /admin/inhalte
Wissensbasis     → /admin/wissen
Assets           → /admin/assets
3D Generator     → /admin/asset-generation
App-Katalog      → /admin/app-catalog
KI-Konfig.       → /admin/ki-konfiguration
Prompts          → /admin/prompts
Systemtest       → /admin/systemtest/board
Content-DB       → /admin/content-db          ← neu
```

### 4. Infrastruktur-Sektion nach der Änderung

```
Einstellungen    → /admin/einstellungen/benachrichtigungen
Systembrett      → brett.localhost (extern)
Live-Stream      → /admin/live
```

Plattform Hub, Dev Status, DORA, Repo Health wandern auf das Dashboard.

---

## Neue Komponenten & Seiten

### A. Dashboard-Shortcuts — Infrastruktur-Gruppe

**Datei:** `website/src/components/admin/AdminShortcuts.svelte`

Neue Shortcut-Gruppe "Infrastruktur & Dev" auf dem Admin-Dashboard (`/admin`) mit 4 Karten:
- Plattform Hub (`/admin/platform`) — Icon: `monitor`
- Dev Status (`/dev-status`) — Icon: `activity`
- DORA (`/admin/dora`) — Icon: `activity`
- Repo Health (`/admin/repohealth`) — Icon: `activity`, nur wenn `!isKore`

Die Gruppe erscheint unterhalb der bestehenden Shortcuts, vor dem Footer. Karten folgen dem bestehenden Shortcut-Card-Pattern.

### B. Content-DB-Seite (`/admin/content-db`)

**Neue Dateien:**
- `website/src/pages/admin/content-db.astro` — Server-rendered Shell
- `website/src/components/admin/ContentDb.svelte` — Interaktive Tabelle

**Datenquellen (3, kein DB-Schema-Change):**

| Typ | Quelle | Felder |
|-----|--------|--------|
| Fragebögen-Templates | `questionnaire-db.ts` → `listQTemplates()` | name, dimension\_count, created\_at |
| Vorlagen | `website-db.ts` → `listTemplates()` | title, target\_surface, status, version |
| Verträge | DocuSeal Templates API (`/api/admin/documents/templates`) | title, status |

**UI:**
- Tabs oder Filter-Pills: "Alle" / "Fragebögen" / "Vorlagen" / "Verträge"
- Tabellenansicht mit Typ-Badge, Titel, Status, Datum
- Kein Edit-/Create-Flow in Phase 1 — nur Übersicht mit Links zu den jeweiligen Detail-Pages

---

## E2E Testdaten — Prod-Schutz

### Problem
`inbox_items.is_test_data = true` Rows können in Prod landen, wenn E2E-Tests gegen Live-Endpunkte laufen.

### Lösung

**1. Einmaliger DB-Cleanup** (als Script in `scripts/`):
```sql
DELETE FROM bachelorprojekt.inbox_items WHERE is_test_data = true;
```

**2. API-Guard** in allen Endpunkten, die `is_test_data` setzen:
```typescript
// X-E2E-Test Header wird in Prod-Umgebung ignoriert
const isTestRequest = process.env.NODE_ENV !== 'production'
  && request.headers.get('X-E2E-Test') === 'true'
  && request.headers.get('X-Cron-Secret') === cronSecret;
```

Betroffene Endpunkte: `/api/contact`, `/api/booking`, `/api/bug-report`, `/api/portal/messages`.

---

## Geänderte Dateien

| Datei | Änderungstyp |
|-------|-------------|
| `website/src/components/admin/AdminSidebarNav.astro` | Modify — Nav-Items + Akkordeon-Logik |
| `website/src/components/admin/AdminShortcuts.svelte` | Modify — neue Infrastruktur-Gruppe |
| `website/src/pages/admin/content-db.astro` | New |
| `website/src/components/admin/ContentDb.svelte` | New |
| `website/src/lib/questionnaire-db.ts` | Modify — `listQTemplates()` falls fehlend |
| `website/src/pages/api/contact.ts` | Modify — Prod-Guard |
| `website/src/pages/api/booking.ts` | Modify — Prod-Guard |
| `website/src/pages/api/bug-report.ts` | Modify — Prod-Guard |
| `website/src/pages/api/portal/messages.ts` | Modify — Prod-Guard |
| `scripts/cleanup-test-inbox.sh` | New — einmaliger Cleanup |

---

## Nicht im Scope

- Löschen der Pages `/admin/members`, `/admin/projekte`, `/admin/buchhaltung` — bleiben als direkte URLs erreichbar
- DB-Schema-Merge der drei Content-Typen in eine Tabelle (Phase 2, separates Ticket)
- Tabs in Plattform Hub für Dev Status / DORA / Repo Health — die Pages bleiben eigenständig, nur Nav-Einstieg wechselt auf Dashboard
- localStorage-Persistenz des Akkordeon-States
