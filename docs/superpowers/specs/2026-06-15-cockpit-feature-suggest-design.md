---
ticket_id: T000784
plan_ref: docs/superpowers/plans/2026-06-15-cockpit-feature-suggest.md
status: staged
areas:
  - website
  - db
---

# Cockpit Feature Suggestion Manager — Design Spec

## Kontext & Problem

Das neue Cockpit (T000786) hat eine Tabelle-First-Ansicht mit Sidebar-Baum. Die Überblick-Linse
(Karten-Grid) wurde entfernt. Diese Spec beschreibt, wie Feature-Portfolio-Management in das
neue Layout integriert wird: welche Features sind "nächster Schritt", verworfen oder Major —
und wie KI (DeepSeek) dabei hilft, die Verteilung vorzuschlagen.

## Ziel

- Features im Sidebar-Baum als "nächster Schritt", "verworfen" oder "Major Feature" markieren
- KI-gestütztes Rollen/Rerollen von Feature-Vorschlägen via DeepSeek API
- Kommentar pro Feature für Reroll-Kontext
- Default-Verteilung: gleichmäßig über alle Produkte

## Abhängigkeit

**Dieser Plan setzt T000786 (Cockpit UX Redesign) voraus.**  
`CockpitSidebar.svelte` und `CockpitTable.svelte` müssen bereits existieren.

---

## Datenmodell

Neue Spalten auf `tickets.tickets`:
- `next_step BOOLEAN NOT NULL DEFAULT false` — für nächsten Schritt markiert
- `discarded BOOLEAN NOT NULL DEFAULT false` — verworfen
- `major_feature BOOLEAN NOT NULL DEFAULT false` — zum Major Feature upgegraded
- `suggestion_comment TEXT` — Kommentar für AI-Reroll-Kontext

---

## API-Design

### Erweiterte Endpunkte
- `GET /api/admin/cockpit/portfolio` → `FeatureNode` enthält neue Felder
- `POST /api/admin/cockpit/suggest` — DeepSeek API aufrufen, Vorschläge generieren
- `POST /api/admin/cockpit/feature-action` — `{ featureId, action: 'next_step'|'discard'|'major'|'comment', value?: boolean|string }`

### Suggest-Endpoint
- Nimmt Liste aller Features mit ihren aktuellen States
- Sendet an DeepSeek API (deepseek-chat)
- Prompt: "Verteile diese Features gleichmäßig auf next_step. Berücksichtige discarded-Flags."
- Returns: `{ suggestions: { featureId: string, nextStep: boolean, reason: string }[] }`

---

## UI-Design

### Integration in CockpitSidebar

Die Feature-Aktionen leben im Sidebar-Baum, nicht in einer separaten Karten-Ansicht.

**Sidebar-Knoten mit Hover-Aktionen:**
```
▸ System-Tests
  ▸ Auth        (4)  [▶ next] [🗑] [★]     ← Buttons sichtbar on hover
    CRM         (5)
    Komm.       (3)  [▶ next] [🗑] [★]
▸ Infra
    K8s         (2)
```

Visual States auf Feature-Knoten:
- **next_step**: grüner linker Balken (3px) + zarter grüner Hintergrund
- **discarded**: ausgegraut (opacity: 0.5), durchgestrichener Text
- **majorFeature**: goldener linker Balken (3px)

Kommentar-Feld: kleiner "💬"-Button expandiert eine einzeilige Textarea inline im Sidebar-Knoten.

**SuggestionBar am Sidebar-Ende:**
```
─────────────────────────
[DeepSeek ▾] [🎲 Rollen]
3 aktiv · 1 verworfen
```

Auf Mobile (Drawer-Modus): SuggestionBar erscheint am Ende des Drawers, direkt unter dem Baum.

### Sortierung der Feature-Knoten

Innerhalb eines Produkts:
1. Major-Features (oben)
2. Normale Features
3. Next-Step-markierte Features (hervorgehoben, nicht umgeordnet)
4. Discarded-Features (ganz unten, ausgegraut)

---

## Technischer Scope

### Neue/geänderte Dateien

| Datei | Aktion |
|-------|--------|
| `scripts/migrations/2026-06-15-cockpit-feature-suggest.sql` | Neu — DB-Migration |
| `website/src/lib/tickets-db.ts` | ALTER TABLE +4 Spalten |
| `website/src/lib/tickets/cockpit-types.ts` | FeatureNode + neue Request/Response-Typen |
| `website/src/lib/tickets/cockpit-db.ts` | setFeatureAction(), getSuggestions() |
| `website/src/pages/api/admin/cockpit/suggest.ts` | Neu — DeepSeek-Route |
| `website/src/pages/api/admin/cockpit/feature-action.ts` | Neu — Aktions-Route |
| `website/src/components/admin/SuggestionBar.svelte` | Neu — Roll-Komponente |
| `website/src/components/admin/CockpitSidebar.svelte` | Erweitern — Hover-Buttons + SuggestionBar |

### Nicht mehr in Scope

- `FeatureCard.svelte` — wird von T000786 gelöscht
- `PortfolioGrid.svelte` — wird von T000786 gelöscht
- Integration in `Cockpit.svelte` via Überblick-Linse — Lens-Konzept entfällt
