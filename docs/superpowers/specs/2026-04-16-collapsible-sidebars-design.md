# Design: Collapsible Sidebars

**Date:** 2026-04-16  
**Branch:** feat/collapsible-sidebars  
**Scope:** Admin Sidebar (AdminLayout.astro) + Docs Sidebar (docs-site/index.html)

---

## 1. Admin Sidebar — Icon-Only Collapse (Option A)

### Behaviour
- **Expanded:** `w-52` — Icons + Labels sichtbar (aktueller Zustand)
- **Collapsed:** `w-12` — Nur Icons sichtbar, Labels ausgeblendet
- Übergang animiert via `transition-all duration-200 ease-in-out`
- Zustand in `localStorage` unter dem Key `admin-sidebar-collapsed` gespeichert
- Wiederherstellung beim Seitenlade ohne Flackern: Inline-`<script>` im `<head>` liest `localStorage` und setzt `data-collapsed` auf `<body>` bevor erste Paint

### Toggle-Button
- Sitzt im Sidebar-Header-Bereich (neben "Admin"-Label)
- Symbol: `‹` (collapsed) / `›` (expanded), in Gold (`text-gold`)
- `title`-Attribut: "Sidebar einklappen" / "Sidebar ausklappen"

### Layout-Anpassung
- `<aside>` bekommt `id="admin-sidebar"` + `data-collapsed`-Attribut
- Labels (`item.label`, Gruppen-Überschriften, "← Website") werden mit `opacity-0 w-0 overflow-hidden` ausgeblendet wenn collapsed
- `<main>` passt sich automatisch an (flex-Layout übernimmt Breitenänderung)
- Tooltips beim Hover auf Icons im collapsed-Zustand: natives `title`-Attribut auf `<a>` (kein extra JS nötig)

### Implementierung
- `AdminLayout.astro`: `<aside>` und Navigationsstruktur anpassen
- Vanilla JS `<script>` am Ende des `<body>` für Toggle-Logik
- Inline `<script>` im `<head>` für Flacker-freie Wiederherstellung

---

## 2. Docs Sidebar — Docsify Toggle-Button aufwerten

### Verhalten
- Docsify's eingebautes Toggle-Mechanismus (`sidebar-toggle`) bleibt unverändert
- Nur CSS-Aufwertung: größere Klickfläche, gold-farbige Balken, Hover-Effekt

### CSS-Änderungen in `docs-site/index.html`
```css
.sidebar-toggle {
  background: var(--dark) !important;
  border: 1px solid var(--dark-border) !important;
  border-radius: 0 6px 6px 0 !important;
  padding: 12px 10px !important;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.sidebar-toggle:hover {
  background: var(--dark-lighter) !important;
  border-color: var(--gold) !important;
}
.sidebar-toggle span {
  background-color: var(--gold) !important;  /* war: var(--muted) */
  height: 2px !important;
  width: 18px !important;
  display: block;
  margin: 4px 0;
  border-radius: 1px;
}
```

---

## Files to change

| File | Change |
|------|--------|
| `website/src/layouts/AdminLayout.astro` | Toggle-Button, collapsed-Logik, localStorage-Persist |
| `docs-site/index.html` | `.sidebar-toggle` CSS aufwerten |
