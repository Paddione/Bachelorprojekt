# mentolder Design-System

Extrahiert aus `website/src/styles/global.css` und den Svelte-Komponenten.
Einsatzbereit als CSS Custom Properties + Tailwind v4 Theme.

---

## Farb-Tokens

### Hintergrund (Ink-Skala)
| Token | HEX | Verwendung |
|-------|-----|------------|
| `--ink-900` | `#0b111c` | Page-Background, tiefste Ebene |
| `--ink-850` | `#101826` | Surface (Cards, Panels) |
| `--ink-800` | `#17202e` | Surface Hover, erhöhte Ebene |
| `--ink-750` | `#1d2736` | Tooltips, Popovers |

### Vordergrund
| Token | Wert | Verwendung |
|-------|------|------------|
| `--fg` | `#eef1f3` | Primärer Text |
| `--fg-soft` | `#cdd3d9` | Body-Text, Beschreibungen |
| `--mute` | `#8c96a3` | Placeholder, Metadaten |
| `--mute-2` | `#6a727e` | Disabled, sehr gedämpft |

### Akzentfarben
| Token | Wert (oklch) | HEX-Näherung | Verwendung |
|-------|-------------|--------------|------------|
| `--brass` | `oklch(0.80 0.09 75)` | `#c9a96e` | Primary-CTA, Kicker-Bar, Emphasis-Text |
| `--brass-2` | `oklch(0.86 0.09 75)` | `#d9be8a` | Hover-Zustand von Brass |
| `--brass-d` | `oklch(0.80 0.09 75 / 0.14)` | rgba-Variante | Brass-Hintergründe, Glassmorphism |
| `--sage` | `oklch(0.80 0.06 160)` | `#8db8a4` | Separator-Dots, sekundäre Highlights |

### Linien & Borders
| Token | Wert | Verwendung |
|-------|------|------------|
| `--line` | `rgba(255,255,255, 0.07)` | Subtile Divider |
| `--line-2` | `rgba(255,255,255, 0.12)` | Sichtbare Borders (Cards, Inputs) |

---

## Typografie

### Font-Familien
```css
--font-serif: "Newsreader", "Iowan Old Style", Georgia, serif;
--font-sans:  "Geist", ui-sans-serif, system-ui, sans-serif;
--font-mono:  "Geist Mono", ui-monospace, Menlo, monospace;
```

**Google Fonts Import:**
```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300;1,6..72,400&display=swap" rel="stylesheet">
```
**Geist** via `npm install geist` (Vercel) oder CDN.

### Typografie-Skala

| Element | Font | Size | Weight | Eigenheit |
|---------|------|------|--------|-----------|
| H1 Hero | Newsreader | `clamp(44px, 6.2vw, 88px)` | 300 | `letter-spacing: -0.02em`, em-Tags italic in `--brass-2` |
| H2 Section | Newsreader | `28px` | 400 | |
| Kicker | Geist Mono | `11px` | 500 | `letter-spacing: 0.14em`, UPPERCASE |
| Body / Lede | Geist | `18px` | 400 | `line-height: 1.6` |
| Body klein | Geist | `16px` | 400 | |
| Label / Meta | Geist Mono | `11px` | 400 | |
| Stat-Zahl | Newsreader | `44px` | — | `em`-Tags in `--brass` |

---

## Spacing & Layout

```css
--maxw:   1240px;  /* Max Content-Breite */
--radius: 22px;    /* Border-Radius für Cards/Buttons */
```

**Padding-Konventionen:**
- Section vertikal: `76px 0 120px` (Desktop), `56px 0 80px` (Mobile ≤960px)
- Wrap horizontal: `40px` (Desktop), `22px` (Mobile)
- Grid-Gap Hero: `64px` (Desktop), `56px` (Mobile, einspaltig)

---

## Komponenten-Tokens

### Button (Primary)
```css
background: var(--brass);
color: var(--ink-900);
padding: 14px 22px;
border-radius: 999px; /* Pill */
font-size: 14px;
font-weight: 600;

/* Hover */
background: var(--brass-2);
transform: translateY(-1px);
```

### Button (Ghost)
```css
color: var(--fg);
border: 1px solid var(--line-2);
background: transparent;

/* Hover */
border-color: var(--brass);
color: var(--brass);
```

### Card
```css
background: var(--ink-850);
border: 1px solid var(--line-2);
border-radius: var(--radius);
border-top: 2px solid var(--brass); /* Brass-Top-Akzent */
```

### Kicker-Bar (Section-Label)
```css
/* Horizontale Linie */
.bar {
  width: 44px;
  height: 1px;
  background: var(--brass);
  opacity: 0.7;
}
/* Separator-Dot */
.dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--sage);
}
/* Text */
font-family: var(--font-mono);
font-size: 11px;
letter-spacing: 0.14em;
text-transform: uppercase;
color: var(--mute);
```

### Hero Halo (Background-Effekt)
```css
/* Rechts-oben: Brass-Glow */
background: radial-gradient(
  closest-side,
  oklch(0.80 0.09 75 / .11),
  transparent 70%
);
filter: blur(10px);
width: 90vw; height: 90vw;
right: -20%; top: -30%;

/* Links-unten: Blaugrau-Glow */
background: radial-gradient(
  closest-side,
  oklch(0.60 0.05 250 / .25),
  transparent 70%
);
width: 80vw; height: 80vw;
left: -30%; bottom: -40%;
```

---

## Tailwind v4 Theme-Konfiguration

```css
/* tailwind.config — CSS-Layer in main.css */
@import "tailwindcss";

@theme {
  /* Farben */
  --color-ink-900: #0b111c;
  --color-ink-850: #101826;
  --color-ink-800: #17202e;
  --color-ink-750: #1d2736;
  --color-fg: #eef1f3;
  --color-fg-soft: #cdd3d9;
  --color-mute: #8c96a3;
  --color-mute-2: #6a727e;
  --color-brass: oklch(0.80 0.09 75);
  --color-brass-2: oklch(0.86 0.09 75);
  --color-brass-d: oklch(0.80 0.09 75 / 0.14);
  --color-sage: oklch(0.80 0.06 160);
  --color-line: rgba(255,255,255,0.07);
  --color-line-2: rgba(255,255,255,0.12);

  /* Fonts */
  --font-serif: "Newsreader", Georgia, serif;
  --font-sans: "Geist", ui-sans-serif, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  /* Layout */
  --radius: 22px;
  --max-w: 1240px;
}
```

---

## Was du Claude für Assets fragen kannst

### 1. SVG Hero-Halo
```
Erstelle eine SVG-Datei (1600×900, viewBox="0 0 1600 900") als 
Hero-Hintergrund für mentolder.de im Dark-Style (#0b111c).

Zwei radiale Gradienten:
- Rechts oben: oklch(0.80 0.09 75 / 0.11) → transparent (Brass-Glow, 900px Radius)
- Links unten: oklch(0.60 0.05 250 / 0.25) → transparent (Blaugrau-Glow, 800px Radius)

Als exportierbare SVG mit <defs> und <radialGradient> Elementen.
Kein Fill außer den Gradienten. Für Web optimiert (keine überflüssigen Attribute).
```

### 2. SVG Icons (Coaching-Themen)
```
Erstelle 6 SVG-Icons, 24×24, viewBox="0 0 24 24", stroke="currentColor",
strokeWidth="1.5", fill="none", strokeLinecap="round", strokeLinejoin="round".

Icons für: Führung, Digitalisierung, Team, Strategie, Kommunikation, Resilienz.
Minimalistischer Stil (kein filled, kein dickes Stroke).
Ausgabe: eine SVG-Datei pro Icon, Dateiname: icon-fuehrung.svg, etc.
```

### 3. OG-Image Template (React-Komponente für @vercel/og)
```
Erstelle eine React-Komponente für @vercel/og (ImageResponse) als 
OG-Image-Template für mentolder.de:

- Größe: 1200×630px
- Hintergrund: Gradient #0b111c → #17202e (links nach rechts)
- Links: Wortmarke "mentolder" in Geist, 48px, #eef1f3
- Mitte: Brass-Trennlinie (vertical, 1px, oklch(0.80 0.09 75))
- Rechts: Dynamischer Titel (prop), Newsreader Italic, 36px, #d9be8a
- Unten rechts: Tagline "Digital Coach & Führungskräfte-Mentor", 14px, #8c96a3
```

### 4. Favicon (SVG)
```
Erstelle ein SVG-Favicon (32×32) für mentolder.de:
- Buchstabe "m" in Geist Sans, lowercase, Bold
- Hintergrund: Rounded Square, #101826
- Textfarbe: #eef1f3
- Brass-Unterstrich: 2px, oklch(0.80 0.09 75), unter dem "m"
Exportiere als favicon.svg (skaliert von 16–512px korrekt).
```

### 5. Portrait-Placeholder-Komponente
```
React-Komponente <AvatarPlaceholder initials="BM" size={200} />:
- Hintergrund: #17202e
- Border: 1px solid oklch(0.80 0.09 75 / 0.3)
- Border-Radius: 50% (Kreis)
- Innen: feinere Brass-Ring (oklch(0.80 0.09 75 / 0.12), 8px inset)
- Initiale: Newsreader Italic, 72px, oklch(0.86 0.09 75)
Kein Bild-Tag, rein CSS + Text.
```
