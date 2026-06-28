---
title: Coaching-Sessions Polish + Interaktiver HTML-Guide
ticket_id: T001316
plan_ref: openspec/changes/coaching-sessions-polish-guide/tasks.md
status: draft
domains: [website, coaching]
---

# Coaching-Sessions Polish + Interaktiver HTML-Guide

## Ziel

Den Coaching-Sessions-Service (10 Phasen, Triadisches KI-Coaching nach Geißler) visuell auf
Release-Qualität bringen und Gerald (Gekko) einen interaktiven HTML-Guide auf mentolder.de
zur Verfügung stellen, über den er das Tool selbst erleben kann — wahlweise mit echtem
Hermes-Modell (Live) oder mit geskripteten Beispieldaten (Scripted).

---

## Teil 1: Admin-UI Polish — SessionWizard.svelte

### 1.1 CSS-Token-Migration

`SessionWizard.svelte` verwendet derzeit 8 Fallback-Werte statt der mentolder Design-Token.

| Aktuell (Fallback)           | Ziel (Design-Token)  |
|------------------------------|----------------------|
| `var(--gold, #c9a55c)`       | `var(--brass)`       |
| `var(--bg-2, #1a1a1a)`       | `var(--ink-800)`     |
| `var(--text-light, #f0f0f0)` | `var(--fg)`          |
| `var(--text-muted, #888)`    | `var(--mute)`        |
| `var(--line, #333)`          | `var(--line)`        |

### 1.2 Newsreader Serif für Schritt-Titel

`.step-title` → `font-family: var(--serif); font-weight: 400; letter-spacing: -0.015em;`

### 1.3 Schritt-Beschreibungszeile

Neues Feld `description: string` in `StepDefinition`. Zwischen `phase-label` und `step-title`
gerendert. CSS: `font-size: 0.82rem; color: var(--mute); font-style: italic;`

Die 10 Beschreibungen:
1. Anlass, Vorerfahrung und aktuelle Situation erfassen — erste Kontaktaufnahme
2. Hauptgefühl, Körperreaktion und Auslöser aufdecken — Affekt-Kontakt herstellen
3. Wunschzustand konkretisieren — SMART-Ziel und Brücke zur Gegenwart formulieren
4. Auslöser → Reaktion → Konsequenz kartieren — Interventionspunkt im Kreislauf finden
5. Stärken, bisherige Versuche und Netzwerk sichtbar machen und gezielt aktivieren
6. Polarität und verborgene Stärke im Problem freilegen — Lösungsenergie mobilisieren
7. Metapher des Klienten vertiefen — immersive Bildarbeit für den Lösungsraum
8. Erfolgsbild konkret verankern — Übergang zur handfesten Umsetzungsplanung
9. Den einen Schritt mit maximalem Hebel identifizieren und als konkreten Auftrag formulieren
10. Hindernisse antizipieren — Unterstützung und Nachverfolgung sicherstellen

---

## Teil 2: Interaktiver HTML-Guide

**Datei:** `website/public/coaching-guide.html` — öffentlich unter `mentolder.de/coaching-guide.html`, self-contained.

**Struktur:**
- Einleitung: Eyebrow, H1 Newsreader, Lede, 4 Phasen-Pills, CTA
- Simulator: Mode-Toggle (Live/Scripted), Progress-Bar (10 Kreise), Step-Card

**Modi:**
- **Live** (Standard): Hermes als Klient (füllt Felder) + Hermes als Coach (Antwort)
- **Scripted**: Feste Andrea K.-Inputs + feste Coach-Texte, kein API-Call

**Demo-Persona:** Andrea K., 42, Teamleiterin IT — Konflikt mit Vorgesetztem.

**Typewriter:** 16 ms/Zeichen, client-side, vollständiges JSON vom Server.

---

## Teil 3: API-Endpoint `/api/demo/coaching-sim`

**Datei:** `website/src/pages/api/demo/coaching-sim.ts` — POST, öffentlich, kein Auth.

**Rate-Limit:** 20 Req/IP/min → HTTP 429.

**Modi:**
- `mode: 'client'` → Hermes als Andrea K., gibt JSON-Felder zurück
- `mode: 'coach'` → Hermes als Coach-Assistent (STEP_DEFINITIONS.systemPrompt)

**Integration:** `getActiveProvider(pool, 'mentolder')` → `KiConfig.apiEndpoint` als baseURL.

---

## Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/coaching-session-prompts.ts` | `description` zu `StepDefinition` + 10 Texte |
| `website/src/components/admin/coaching/SessionWizard.svelte` | CSS-Token + Serif + Beschreibungszeile |
| `website/public/coaching-guide.html` | NEU — self-contained Guide + Simulator |
| `website/src/pages/api/demo/coaching-sim.ts` | NEU — Hermes-Proxy, Rate-Limit |

---

## Nicht im Scope

- Auth für den Guide (bewusst öffentlich)
- Persistenz der Demo-Sessions
- Streaming im Demo-Endpoint

---

## Verifikation

- `task test:changed`
- `task freshness:regenerate && task freshness:check`
- Manuell: alle 10 Steps in Live- und Scripted-Modus durchklicken
- Rate-Limit: 21. Request → 429
