---
title: Content Hub — Deutsche Kontexthilfe Implementation Plan
ticket_id: T000316
domains: [website, security]
status: active
pr_number: null
---

# Content Hub — Deutsche Kontexthilfe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ausführliche deutsche Kontexthilfe im PortalSidekick (Punkt 05 „Hilfe") für alle Sektionen des Admin-Content-Hubs aktivieren.

**Architecture:** Zwei Dateien, null neue Komponenten. `AdminLayout.astro` liest zusätzlich den `?section=` URL-Param aus — dadurch wird `helpSection` beim Navigieren durch Sektionen automatisch aktuell. `helpContent.ts` erhält den fehlenden `admin.inhalte`-Übersichtseintrag plus vollständige `guides[]` für alle 17 Sektionen.

**Tech Stack:** Astro (SSR, `Astro.url.searchParams`), TypeScript (`HelpSection` Interface), Svelte 5 (PortalSidekick/HelpView, keine Änderungen nötig).

**Spec:** `docs/superpowers/specs/2026-05-30-content-hub-help-de-design.md`

---

## File Map

| Datei | Aktion | Was ändert sich |
|-------|--------|-----------------|
| `website/src/layouts/AdminLayout.astro` | Modify (Zeile 39) | `?section=` URL-Param auslesen → `helpSection` wird kontext-sensitiv |
| `website/src/lib/helpContent.ts` | Modify | `admin.inhalte` neu + guides für 12 bestehende Einträge + 5 neue Service-Seiten-Einträge |

---

## Task 1: AdminLayout.astro — helpSection kontext-sensitiv machen

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro:39`

- [x] **Schritt 1: Zeile 39 in `AdminLayout.astro` ersetzen**

Öffne `website/src/layouts/AdminLayout.astro`. Zeile 39 lautet aktuell:

```astro
const helpSection = adminSection(path);
```

Ersetze sie durch:

```astro
const sectionParam = Astro.url.searchParams.get('section') ?? '';
const helpSection = sectionParam || adminSection(path);
```

`Astro.url` ist in jeder `.astro`-Datei immer verfügbar (SSR). `searchParams.get('section')` gibt `null` zurück wenn der Param fehlt — der `?? ''` wandelt das in einen leeren String um, sodass `|| adminSection(path)` greift.

- [x] **Schritt 2: TypeScript-Check ausführen**

```bash
cd website && pnpm astro check 2>&1 | tail -20
```

Erwartete Ausgabe: keine Fehler (0 errors, 0 warnings oder ähnlich).

- [x] **Schritt 3: Commit**

```bash
cd /tmp/wt-content-hub-help-de
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): read ?section= param for context-sensitive help in sidekick"
```

---

## Task 2: helpContent.ts — Übersicht + SEO (neue Einträge)

**Files:**
- Modify: `website/src/lib/helpContent.ts`

Der `admin`-Block in `helpContent.ts` endet aktuell mit dem `einstellungen`-Eintrag. Alle neuen/geänderten Einträge kommen **innerhalb des bestehenden `admin: { ... }` Objekts**.

- [x] **Schritt 1: Neuen `inhalte`-Eintrag direkt vor `startseite` einfügen**

Suche in `website/src/lib/helpContent.ts` die Zeile `startseite: {` im `admin`-Block. Füge **davor** ein:

```typescript
    inhalte: {
      title: 'Content Hub',
      description: 'Hier pflegst du alle Inhalte deiner Website — Texte, Preise, Rechtliches und mehr. Wähle oben einen Tab und dann eine Sektion, um deren spezifische Hilfe zu sehen.',
      actions: [
        'Tab „website" wählen → Seiteninhalt bearbeiten',
        'Tab „newsletter" wählen → E-Mail-Kampagnen anlegen',
        'Tab „fragebogen" wählen → Fragebogen-Vorlagen bearbeiten',
        'Tab „vertraege" wählen → Vertragsvorlagen pflegen',
        'Tab „rechnungen" wählen → Rechnungsvorlagen anpassen',
      ],
      guides: [
        {
          title: 'Website-Inhalt bearbeiten (Überblick)',
          steps: [
            'Klicke auf den Tab „website" oben im Content Hub.',
            'Wähle eine Sektion aus der zweiten Tab-Reihe (z.B. „Startseite", „Angebote", „FAQ").',
            'Bearbeite die Felder im Editor — der Sidekick zeigt dann die Anleitung für genau diese Sektion.',
            'Klicke auf „Speichern". Die Änderung ist sofort live auf der Website.',
          ],
        },
        {
          title: 'Änderungen in Echtzeit prüfen',
          steps: [
            'Speichere deine Änderung im Admin.',
            'Öffne die öffentliche Website in einem neuen Tab (z.B. web.mentolder.de).',
            'Lade die Seite neu — die Änderung ist sofort sichtbar (kein Deploy nötig).',
          ],
        },
      ],
    },
```

- [x] **Schritt 2: Bestehenden `seo`-Eintrag hinzufügen (fehlt komplett im admin-Block)**

Suche `startseite: {` im `admin`-Block. Füge **davor** (nach `inhalte`) ein:

```typescript
    seo: {
      title: 'SEO',
      description: 'Meta-Titel und -Beschreibungen für alle Website-Seiten pflegen — relevant für Suchmaschinen und Social-Sharing.',
      actions: [
        'Meta-Titel bearbeiten (50–70 Zeichen)',
        'Meta-Beschreibung bearbeiten (120–160 Zeichen)',
        'Änderungen speichern',
      ],
      guides: [
        {
          title: 'Meta-Titel und Beschreibung setzen',
          steps: [
            'Öffne Tab „website" → Sektion „SEO".',
            'Wähle die Seite aus der Liste (z.B. Startseite, Coaching).',
            'Bearbeite „Meta-Titel" (50–70 Zeichen) und „Meta-Beschreibung" (120–160 Zeichen).',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 3: TypeScript-Check**

```bash
cd website && pnpm astro check 2>&1 | tail -10
```

Erwartete Ausgabe: 0 errors.

- [x] **Schritt 4: Commit**

```bash
cd /tmp/wt-content-hub-help-de
git add website/src/lib/helpContent.ts
git commit -m "feat(admin): add inhalte overview + seo help entries"
```

---

## Task 3: helpContent.ts — Guides für bestehende Seiten-Einträge

**Files:**
- Modify: `website/src/lib/helpContent.ts`

Die folgenden Einträge existieren bereits im `admin`-Block, haben aber `guides: []`. Ersetze jeweils `guides: [],` mit dem vollständigen Inhalt.

- [x] **Schritt 1: `startseite` — guides ersetzen**

Suche `startseite: {` im `admin`-Block. Der aktuelle `guides: [],` Wert wird ersetzt:

```typescript
    startseite: {
      title: 'Startseite',
      description: 'Inhalte der öffentlichen Startseite bearbeiten — Hero, Kennzahlen, Warum-ich-Punkte und Prozessschritte.',
      actions: ['Texte bearbeiten', 'Änderungen speichern', 'Vorschau öffnen'],
      guides: [
        {
          title: 'Hero-Bereich bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Startseite".',
            'Bearbeite „Überschrift", „Unterzeile" und „Call-to-Action-Text" im Hero-Block.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Kennzahlen (Stats) anpassen',
          steps: [
            'Scrolle in der Sektion „Startseite" zum Block „Kennzahlen".',
            'Ändere Zahl, Einheit und Beschreibung für jede Kennzahl.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Why-Me-Punkte bearbeiten',
          steps: [
            'Scrolle zum Block „Warum ich".',
            'Bearbeite Titel und Beschreibung jedes Punktes.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 2: `uebermich` — guides ersetzen**

```typescript
    uebermich: {
      title: 'Über mich',
      description: 'Die „Über mich"-Seite der Website bearbeiten.',
      actions: ['Text bearbeiten', 'Bild aktualisieren', 'Änderungen speichern'],
      guides: [
        {
          title: 'Profiltext bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Über mich".',
            'Bearbeite die Textfelder für Vita, Hintergrund und Schwerpunkte.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 3: `angebote` — guides ersetzen**

```typescript
    angebote: {
      title: 'Angebote',
      description: 'Leistungsangebote auf der Website pflegen — Karten, Preise und Reihenfolge.',
      actions: ['Angebot bearbeiten', 'Neues Angebot anlegen', 'Angebot deaktivieren'],
      guides: [
        {
          title: 'Angebots-Karte bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Angebote".',
            'Klicke auf die Karte die du bearbeiten möchtest.',
            'Ändere Titel, Beschreibung, Preis und CTA-Text.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Reihenfolge der Angebote ändern',
          steps: [
            'Klicke in der Sektion „Angebote" auf die Pfeil-Buttons (↑ ↓) neben einem Angebot.',
            'Die Reihenfolge gilt sowohl für die Website-Karten als auch für den Footer.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 4: `faq` — guides ersetzen**

```typescript
    faq: {
      title: 'FAQ',
      description: 'Häufig gestellte Fragen auf der Website pflegen.',
      actions: ['Frage hinzufügen', 'Frage bearbeiten', 'Reihenfolge ändern'],
      guides: [
        {
          title: 'Neue Frage hinzufügen',
          steps: [
            'Öffne Tab „website" → Sektion „FAQ".',
            'Klicke auf „+ Frage hinzufügen".',
            'Gib Frage und Antwort ein.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Frage-Reihenfolge ändern',
          steps: [
            'Klicke auf die Pfeil-Buttons (↑ ↓) neben der Frage.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 5: `kontakt` — guides ersetzen**

```typescript
    kontakt: {
      title: 'Kontakt',
      description: 'Kontaktinformationen pflegen — Änderungen gelten auf der gesamten Website.',
      actions: ['Kontaktdaten bearbeiten', 'Benachrichtigungs-E-Mail setzen'],
      guides: [
        {
          title: 'Kontaktdaten aktualisieren',
          steps: [
            'Öffne Tab „website" → Sektion „Kontakt".',
            'Die Felder hier spiegeln deine Stammdaten — Änderungen gelten auf der ganzen Website.',
            'Ändere E-Mail, Telefon oder Ort.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 6: `referenzen` — guides ersetzen**

```typescript
    referenzen: {
      title: 'Referenzen',
      description: 'Kundenstimmen und Referenzen auf der Website pflegen.',
      actions: ['Referenz hinzufügen', 'Referenz bearbeiten', 'Referenz ausblenden'],
      guides: [
        {
          title: 'Neue Referenz hinzufügen',
          steps: [
            'Öffne Tab „website" → Sektion „Referenzen".',
            'Klicke auf „+ Referenz hinzufügen".',
            'Gib Name, Unternehmen, Zitat und optional ein Bild ein.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'Referenz ausblenden',
          steps: [
            'Klicke auf das Auge-Icon neben der Referenz.',
            'Die Referenz bleibt gespeichert, erscheint aber nicht mehr auf der Website.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 7: `rechtliches` — guides ersetzen**

```typescript
    rechtliches: {
      title: 'Rechtliches',
      description: 'Impressum, Datenschutzerklärung, AGB und Barrierefreiheitserklärung pflegen.',
      actions: ['Impressum bearbeiten', 'Datenschutzerklärung aktualisieren', 'AGB anpassen'],
      guides: [
        {
          title: 'Impressum aktualisieren',
          steps: [
            'Öffne Tab „website" → Sektion „Rechtliches" → Tab „Impressum".',
            'Bearbeite den Text im Editor.',
            'Klicke auf „Speichern" — die Änderung ist sofort live.',
          ],
        },
        {
          title: 'Datenschutzerklärung aktualisieren',
          steps: [
            'Wechsle innerhalb „Rechtliches" auf den Tab „Datenschutz".',
            'Bearbeite den Freitext oder passe Token-Felder an.',
            'Klicke auf „Speichern".',
          ],
        },
        {
          title: 'AGB anpassen',
          steps: [
            'Wechsle innerhalb „Rechtliches" auf den Tab „AGB".',
            'Bearbeite den Text.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 8: TypeScript-Check**

```bash
cd website && pnpm astro check 2>&1 | tail -10
```

Erwartete Ausgabe: 0 errors.

- [x] **Schritt 9: Commit**

```bash
cd /tmp/wt-content-hub-help-de
git add website/src/lib/helpContent.ts
git commit -m "feat(admin): fill guides for startseite/uebermich/angebote/faq/kontakt/referenzen/rechtliches help"
```

---

## Task 4: helpContent.ts — Einstellungs-Einträge + Service-Seiten

**Files:**
- Modify: `website/src/lib/helpContent.ts`

- [x] **Schritt 1: `stammdaten` — guides ersetzen**

```typescript
    stammdaten: {
      title: 'Stammdaten',
      description: 'Zentrale Daten (Name, E-Mail, Telefon, Ort) pflegen — werden auf der gesamten Website verwendet.',
      actions: ['Stammdaten bearbeiten', 'Änderungen speichern'],
      guides: [
        {
          title: 'Stammdaten bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Stammdaten".',
            'Hier pflegst du zentrale Daten (Name, E-Mail, Telefon, Ort), die auf der gesamten Website verwendet werden.',
            'Ändere die gewünschten Felder.',
            'Klicke auf „Speichern" — die Änderung gilt sofort überall.',
          ],
        },
      ],
    },
```

- [x] **Schritt 2: `navigation` — guides ersetzen**

```typescript
    navigation: {
      title: 'Navigation',
      description: 'Hauptmenü der Website bearbeiten — Einträge, Reihenfolge und Links.',
      actions: ['Menü-Reihenfolge anpassen', 'Eintrag bearbeiten', 'Änderungen speichern'],
      guides: [
        {
          title: 'Menü-Reihenfolge anpassen',
          steps: [
            'Öffne Tab „website" → Sektion „Navigation".',
            'Verschiebe Einträge per Pfeil-Buttons (↑ ↓).',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 3: `footer` — guides ersetzen**

```typescript
    footer: {
      title: 'Footer',
      description: 'Footer-Texte und -Links der Website bearbeiten.',
      actions: ['Tagline bearbeiten', 'Copyright-Text anpassen', 'Änderungen speichern'],
      guides: [
        {
          title: 'Footer-Text bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Footer".',
            'Bearbeite Tagline und Copyright-Text.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 4: Neue Service-Seiten-Einträge einfügen**

Füge die folgenden 5 neuen Einträge **nach dem `footer`-Eintrag** im `admin`-Block ein (vor dem schließenden `},` des admin-Objekts):

```typescript
    coaching: {
      title: 'Coaching',
      description: 'Inhalte der „Coaching"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'Coaching-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Coaching".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    'fuehrung-persoenlichkeit': {
      title: 'Führung & Persönlichkeit',
      description: 'Inhalte der „Führung & Persönlichkeit"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'Führung & Persönlichkeit-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Führung & Persönlichkeit".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    '50plus-digital': {
      title: '50plus Digital',
      description: 'Inhalte der „50plus Digital"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: '50plus Digital-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „50plus Digital".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    'ki-transition': {
      title: 'KI-Transition',
      description: 'Inhalte der „KI-Transition"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'KI-Transition-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „KI-Transition".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
    beratung: {
      title: 'Beratung',
      description: 'Inhalte der „Beratung"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
      actions: [
        'Seitenüberschrift und Unterzeile bearbeiten',
        'Einleitungstext anpassen',
        'Für-wen-Punkte ergänzen oder ändern',
        'Leistungsblöcke bearbeiten',
        'CTA-Text und -Link anpassen',
      ],
      guides: [
        {
          title: 'Beratung-Seite bearbeiten',
          steps: [
            'Öffne Tab „website" → Sektion „Beratung".',
            'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
            'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
            'Bearbeite die Leistungsblöcke darunter.',
            'Klicke auf „Speichern".',
          ],
        },
      ],
    },
```

- [x] **Schritt 5: TypeScript-Check**

```bash
cd website && pnpm astro check 2>&1 | tail -10
```

Erwartete Ausgabe: 0 errors.

- [x] **Schritt 6: Commit**

```bash
cd /tmp/wt-content-hub-help-de
git add website/src/lib/helpContent.ts
git commit -m "feat(admin): fill guides for settings + add service page help entries"
```

---

## Task 5: Smoke-Test + Test-Inventory + PR

**Files:** keine neuen Änderungen

- [x] **Schritt 1: Offline-Tests ausführen**

```bash
cd /tmp/wt-content-hub-help-de
task test:all 2>&1 | tail -20
```

Erwartete Ausgabe: alle Tests grün (keine neuen Tests nötig — reine Datei-Änderung).

- [x] **Schritt 2: Manuelle Verifikation (Browser)**

Starte den Dev-Server:

```bash
cd /tmp/wt-content-hub-help-de/website && pnpm dev
```

Prüfe folgende URLs im Browser (Admin-Login via Keycloak erforderlich):

1. `http://localhost:4321/admin/inhalte` → Sidekick öffnen → Punkt 05 „Hilfe" → **Titel „Content Hub" + 2 Guides sichtbar**
2. `http://localhost:4321/admin/inhalte?tab=website&section=angebote` → Sidekick → Hilfe → **Titel „Angebote" + 2 Guides sichtbar**
3. `http://localhost:4321/admin/inhalte?tab=website&section=rechtliches` → Sidekick → Hilfe → **Titel „Rechtliches" + 3 Guides sichtbar**
4. `http://localhost:4321/admin/inhalte?tab=newsletter` → Sidekick → Hilfe → **Titel „Content Hub" (Übersicht, kein section-Param)**

- [x] **Schritt 3: PR erstellen**

```bash
cd /tmp/wt-content-hub-help-de
gh pr create \
  --title "feat(admin): German context-sensitive help for content hub [T000XXX]" \
  --body "$(cat <<'EOF'
## Summary
- Adds context-sensitive German help to the PortalSidekick (Punkt 05 „Hilfe") for all 17 Content Hub sections
- `AdminLayout.astro`: reads `?section=` URL param → help content changes automatically when navigating sections
- `helpContent.ts`: new `admin.inhalte` overview entry + detailed guides for all page/settings/service-page sections

## Test plan
- [x] `task test:all` passes
- [ ] `/admin/inhalte` → Sidekick → Hilfe shows Content Hub overview
- [ ] `/admin/inhalte?tab=website&section=angebote` → Hilfe shows Angebote guides
- [ ] `/admin/inhalte?tab=website&section=rechtliches` → Hilfe shows 3 Rechtliches guides
- [ ] `/admin/inhalte?tab=newsletter` → Hilfe shows overview (no section param)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [x] **Schritt 4: CI abwarten und mergen**

```bash
# Warte auf grüne CI-Checks, dann:
gh pr merge --squash --delete-branch --repo Paddione/Bachelorprojekt
```

- [x] **Schritt 5: Post-Merge Deploy**

```bash
# website/src/** geändert → Website-Deploy auf beiden Clustern
task feature:website
```

Verifiziere unter `https://web.mentolder.de/admin/inhalte` (prod).
