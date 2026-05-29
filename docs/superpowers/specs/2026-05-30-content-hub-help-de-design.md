# Content Hub — Deutsche Kontexthilfe

**Datum:** 2026-05-30
**Branch:** feature/content-hub-help-de
**Scope:** Ausführliche deutsche Hilfe im PortalSidekick (Punkt 05 „Hilfe") für alle Sektionen des Admin-Content-Hubs.

---

## Problem

Der PortalSidekick zeigt auf `/admin/inhalte` unter Punkt 05 „Hilfe" nichts an, weil `helpContent.admin['inhalte']` fehlt. Zudem wird `helpSection` aus dem URL-Pfad abgeleitet — aber nie aus dem `?section=`-Query-Param, sodass vorhandene Einträge wie `admin.startseite` oder `admin.angebote` nie angezeigt werden, selbst wenn man sich in der jeweiligen Sektion befindet.

## Lösung

Zwei Änderungen:

### 1. `AdminLayout.astro` — 2-Zeilen-Patch

`helpSection` wird zuerst aus dem `?section=` URL-Param gelesen, fällt sonst auf `adminSection(path)` zurück:

```astro
// vorher (Zeile 39):
const helpSection = adminSection(path);

// nachher:
const sectionParam = Astro.url.searchParams.get('section') ?? '';
const helpSection = sectionParam || adminSection(path);
```

Effekt: Wenn der Nutzer `/admin/inhalte?tab=website&section=angebote` besucht, zeigt der Drawer automatisch die Angebote-Anleitung. Ohne `section=` erscheint die Content-Hub-Übersicht (`inhalte`).

### 2. `helpContent.ts` — Neue und ergänzte Einträge

#### Neuer Key: `admin.inhalte` (Übersicht)

Erscheint immer wenn kein `section=`-Param gesetzt ist (d.h. beim Öffnen des Content Hubs oder beim Wechsel auf newsletter/fragebogen/vertraege/rechnungen-Tabs).

```typescript
inhalte: {
  title: 'Content Hub',
  description: 'Hier pflegst du alle Inhalte deiner Website — Texte, Preise, Rechtliches und mehr. Wähle links oben einen Tab und dann eine Sektion, um deren spezifische Hilfe zu sehen.',
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

#### Ergänzte Einträge (bestehende Schlüssel, leere `guides` werden befüllt)

**`startseite`**
```typescript
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
]
```

**`uebermich`**
```typescript
guides: [
  {
    title: 'Profiltext bearbeiten',
    steps: [
      'Öffne Tab „website" → Sektion „Über mich".',
      'Bearbeite die Textfelder für Vita, Hintergrund und Schwerpunkte.',
      'Klicke auf „Speichern".',
    ],
  },
]
```

**`angebote`**
```typescript
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
]
```

**`faq`**
```typescript
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
]
```

**`kontakt`**
```typescript
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
]
```

**`referenzen`**
```typescript
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
]
```

**`rechtliches`**
```typescript
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
]
```

**`seo`**
```typescript
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
]
```

**`stammdaten`**
```typescript
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
]
```

**`navigation`**
```typescript
guides: [
  {
    title: 'Menü-Reihenfolge anpassen',
    steps: [
      'Öffne Tab „website" → Sektion „Navigation".',
      'Verschiebe Einträge per Pfeil-Buttons (↑ ↓).',
      'Klicke auf „Speichern".',
    ],
  },
]
```

**`footer`**
```typescript
guides: [
  {
    title: 'Footer-Text bearbeiten',
    steps: [
      'Öffne Tab „website" → Sektion „Footer".',
      'Bearbeite Tagline und Copyright-Text.',
      'Klicke auf „Speichern".',
    ],
  },
]
```

#### Neue Schlüssel für Service-Seiten

Alle folgenden Sektionen (`coaching`, `fuehrung-persoenlichkeit`, `50plus-digital`, `ki-transition`, `beratung`) verwenden dasselbe `ServicePageSection.svelte`-Schema und erhalten identisch strukturierte Guides:

```typescript
{
  title: '<Seitenname>',
  description: 'Inhalte der „<Seitenname>"-Seite bearbeiten — Überschrift, Einleitung, Für-wen-Liste, Leistungsblöcke und CTA.',
  actions: [
    'Seitenüberschrift und Unterzeile bearbeiten',
    'Einleitungstext anpassen',
    'Für-wen-Punkte ergänzen oder ändern',
    'Leistungsblöcke bearbeiten',
    'CTA-Text und -Link anpassen',
  ],
  guides: [
    {
      title: '<Seitenname>-Seite bearbeiten',
      steps: [
        'Öffne Tab „website" → Sektion „<Seitenname>".',
        'Bearbeite Überschrift, Unterzeile und Einleitungstext.',
        'Passe die „Für wen"-Punkte an (Klick auf Punkt → Text bearbeiten).',
        'Bearbeite die Leistungsblöcke darunter.',
        'Klicke auf „Speichern".',
      ],
    },
  ],
}
```

---

## Abgedeckte Sektionen

| Key | Typ | Status |
|-----|-----|--------|
| `inhalte` | Übersicht | Neu |
| `startseite` | Seite | Guides ergänzt |
| `uebermich` | Seite | Guides ergänzt |
| `angebote` | Seite | Guides ergänzt |
| `faq` | Seite | Guides ergänzt |
| `kontakt` | Seite | Guides ergänzt |
| `referenzen` | Seite | Guides ergänzt |
| `rechtliches` | Seite | Guides ergänzt |
| `seo` | Einstellung | Neu |
| `stammdaten` | Einstellung | Guides ergänzt |
| `navigation` | Einstellung | Guides ergänzt |
| `footer` | Einstellung | Guides ergänzt |
| `coaching` | Service-Seite | Neu |
| `fuehrung-persoenlichkeit` | Service-Seite | Neu |
| `50plus-digital` | Service-Seite | Neu |
| `ki-transition` | Service-Seite | Neu |
| `beratung` | Service-Seite | Neu |

Newsletter, Fragebogen, Verträge, Rechnungen-Tabs: durch den `inhalte`-Übersichtseintrag abgedeckt (kein `section=`-Param gesetzt bei diesen Tabs).

---

## Out of Scope

- Neue UI-Komponenten (kein neuer Tab, kein neues Svelte-Widget)
- Änderungen an `HelpView.svelte` oder `PortalSidekick.svelte`
- Korczewski-Brand (gleiche Hilfe gilt für beide Brands da die Sektionen identisch sind)

---

## Testbarkeit

- Manuell: `/admin/inhalte` aufrufen → Sidekick öffnen → Punkt 05 „Hilfe" klicken → Übersicht sichtbar
- Manuell: `/admin/inhalte?tab=website&section=angebote` → Sidekick → Hilfe zeigt Angebote-Guides
- BATS: kein neuer Test nötig (reine Daten-Ergänzung, kein neues Verhalten)
- Playwright: kein neuer E2E nötig (kein neuer Endpoint, kein neues Auth-Flow)
