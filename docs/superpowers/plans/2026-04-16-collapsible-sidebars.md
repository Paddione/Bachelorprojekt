# Collapsible Sidebars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin Sidebar kollabiert auf Icon-Only-Leiste (`w-52` → `w-12`) mit Toggle-Button, localStorage-Persist und No-Flicker; Docsify Sidebar-Toggle erhält goldene Styling-Aufwertung.

**Architecture:** Admin sidebar: CSS-Klasse `sidebar-collapsed` auf `<html>`, gesteuert per vanilla JS Toggle-Script am Body-Ende + Inline-Script im Head für No-Flicker-Restore. Docsify-Sidebar: reine CSS-Änderungen im bestehenden `.sidebar-toggle`-Block in `docs-site/index.html`.

**Tech Stack:** Astro, Tailwind CSS, vanilla JS (inline Astro `is:inline`), Docsify

---

### Task 1: Admin Sidebar — Icon-Only Collapse

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: No-Flicker-Script in `<head>` einfügen**

In `AdminLayout.astro` im `<head>`-Block direkt vor `</head>` einfügen:

```astro
<script is:inline>
  if (localStorage.getItem('admin-sidebar-collapsed') === '1') {
    document.documentElement.classList.add('sidebar-collapsed');
  }
</script>
```

- [ ] **Step 2: CSS-Block für Sidebar-Transition in `<head>` einfügen**

Direkt nach dem `<script is:inline>` aus Step 1, noch vor `</head>`, einfügen:

```html
<style>
  #admin-sidebar {
    width: 13rem;
    transition: width 0.2s ease;
    overflow: hidden;
  }
  html.sidebar-collapsed #admin-sidebar {
    width: 3rem;
  }
  .sidebar-label {
    transition: opacity 0.15s ease, max-width 0.2s ease;
    white-space: nowrap;
    overflow: hidden;
    max-width: 200px;
  }
  html.sidebar-collapsed .sidebar-label {
    opacity: 0;
    max-width: 0;
  }
  .sidebar-group-label {
    transition: opacity 0.15s ease, max-height 0.2s ease;
    overflow: hidden;
    max-height: 2rem;
  }
  html.sidebar-collapsed .sidebar-group-label {
    opacity: 0;
    max-height: 0;
    margin: 0 !important;
    padding: 0 !important;
  }
  html.sidebar-collapsed .sidebar-nav-item {
    justify-content: center;
    padding-left: 0 !important;
    padding-right: 0 !important;
  }
  html.sidebar-collapsed .sidebar-footer-link span {
    opacity: 0;
    max-width: 0;
    overflow: hidden;
    display: inline-block;
  }
</style>
```

- [ ] **Step 3: `<aside>` Opening-Tag anpassen**

`w-52` aus dem `<aside>`-Tag entfernen und `id="admin-sidebar"` hinzufügen.

Ersetze:
```html
<aside class="w-52 flex-shrink-0 min-h-screen bg-dark-light border-r border-dark-lighter flex flex-col">
```
Mit:
```html
<aside id="admin-sidebar" class="flex-shrink-0 min-h-screen bg-dark-light border-r border-dark-lighter flex flex-col">
```

- [ ] **Step 4: Sidebar-Header mit Toggle-Button ersetzen**

Ersetze den gesamten Header-`<div>`:
```html
<div class="px-4 py-5 border-b border-dark-lighter">
  <a href="/admin" class="text-gold font-bold text-lg font-serif leading-tight">Admin</a>
  <p class="text-xs text-muted mt-0.5">{config.meta.siteTitle}</p>
</div>
```
Mit:
```astro
<div class="px-3 py-5 border-b border-dark-lighter flex items-center gap-2 min-w-0">
  <div class="flex-1 min-w-0">
    <a href="/admin" class="sidebar-label text-gold font-bold text-lg font-serif leading-tight block">Admin</a>
    <p class="sidebar-label text-xs text-muted mt-0.5">{config.meta.siteTitle}</p>
  </div>
  <button
    id="sidebar-toggle"
    title="Sidebar einklappen"
    aria-label="Sidebar einklappen"
    class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gold hover:text-gold-light transition-colors text-lg font-bold leading-none"
  >‹</button>
</div>
```

- [ ] **Step 5: Gruppen-Label-`<p>` mit CSS-Klasse versehen**

Ersetze innerhalb von `navGroups.map(...)`:
```astro
<p class="px-2 mb-1.5 text-xs font-semibold text-muted uppercase tracking-widest">{group.label}</p>
```
Mit:
```astro
<p class="sidebar-group-label px-2 mb-1.5 text-xs font-semibold text-muted uppercase tracking-widest">{group.label}</p>
```

- [ ] **Step 6: Nav-Link-Labels mit CSS-Klassen versehen**

Ersetze den `<a>`-Block innerhalb von `group.items.map(...)`:
```astro
<a
  href={item.href}
  class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive(item.href)
      ? 'bg-gold/10 text-gold'
      : 'text-muted hover:text-light hover:bg-dark-lighter'
  }`}
>
  <span class="text-base leading-none">{item.icon}</span>
  {item.label}
</a>
```
Mit:
```astro
<a
  href={item.href}
  title={item.label}
  class={`sidebar-nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive(item.href)
      ? 'bg-gold/10 text-gold'
      : 'text-muted hover:text-light hover:bg-dark-lighter'
  }`}
>
  <span class="text-base leading-none flex-shrink-0">{item.icon}</span>
  <span class="sidebar-label">{item.label}</span>
</a>
```

- [ ] **Step 7: Footer-Link mit CSS-Klasse versehen**

Ersetze:
```html
<a href="/" class="text-xs text-muted hover:text-gold transition-colors">← Website</a>
```
Mit:
```html
<a href="/" class="sidebar-footer-link flex items-center gap-1 text-xs text-muted hover:text-gold transition-colors whitespace-nowrap">
  <span>←</span>
  <span class="sidebar-label">Website</span>
</a>
```

- [ ] **Step 8: Toggle-JS-Script vor `</body>` einfügen**

Direkt vor `</body>` einfügen:
```astro
<script is:inline>
  (function() {
    var btn = document.getElementById('sidebar-toggle');
    if (!btn) return;
    var collapsed = document.documentElement.classList.contains('sidebar-collapsed');
    btn.textContent = collapsed ? '›' : '‹';
    btn.title = collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen';
    btn.setAttribute('aria-label', btn.title);

    btn.addEventListener('click', function() {
      collapsed = document.documentElement.classList.toggle('sidebar-collapsed');
      localStorage.setItem('admin-sidebar-collapsed', collapsed ? '1' : '0');
      btn.textContent = collapsed ? '›' : '‹';
      btn.title = collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen';
      btn.setAttribute('aria-label', btn.title);
    });
  })();
</script>
```

- [ ] **Step 9: Manuell verifizieren**

Dev-Server starten:
```bash
cd /home/patrick/Bachelorprojekt/website && task website:dev
```

Browser: http://localhost:4321/admin (Port ggf. abweichend, Astro zeigt ihn beim Start).

Checkliste:
- Sidebar zeigt volle Breite mit Labels
- Klick `‹` → Sidebar kollabiert auf Icon-Leiste (3rem)
- Hover auf Icons → nativer Tooltip mit Label
- Klick `›` → Sidebar expandiert zurück
- Seite neu laden → Zustand bleibt erhalten
- Alle Nav-Links in beiden Zuständen klickbar

- [ ] **Step 10: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): collapsible sidebar with icon-only mode and localStorage persist"
```

---

### Task 2: Docs Sidebar — Toggle-Button Styling

**Files:**
- Modify: `docs-site/index.html`

- [ ] **Step 1: `.sidebar-toggle` und `.sidebar-toggle span` CSS ersetzen**

In `docs-site/index.html` die bestehenden Zeilen:
```css
.sidebar-toggle {
  background: var(--dark) !important;
}
.sidebar-toggle span {
  background-color: var(--muted) !important;
}
```
Ersetzen durch:
```css
.sidebar-toggle {
  background: var(--dark) !important;
  border: 1px solid var(--dark-border) !important;
  border-left: none !important;
  border-radius: 0 6px 6px 0 !important;
  padding: 12px 10px !important;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  top: 1.5rem !important;
}
.sidebar-toggle:hover {
  background: var(--dark-lighter) !important;
  border-color: var(--gold) !important;
}
.sidebar-toggle span {
  background-color: var(--gold) !important;
  height: 2px !important;
  width: 18px !important;
  display: block !important;
  margin: 4px 0 !important;
  border-radius: 1px !important;
  transition: background-color 0.15s;
}
```

- [ ] **Step 2: Manuell verifizieren**

Docs-Seite aufrufen (falls Cluster läuft: http://docs.localhost, sonst `docs-site/index.html` direkt im Browser öffnen).

Checkliste:
- Toggle-Button zeigt drei goldene Balken (Hamburger)
- Hover → dunklerer Hintergrund + goldener Border
- Klick → Sidebar klappt ein/aus (Docsify-Verhalten unverändert)
- Button sitzt oben rechts an der Sidebar-Kante

- [ ] **Step 3: Commit**

```bash
git add docs-site/index.html
git commit -m "feat(docs): gold-themed sidebar toggle button"
```

---

## Self-Review

**Spec-Abdeckung:**
- ✅ Admin sidebar Icon-Only collapse `w-52` → `w-12` — Task 1 Steps 1–8
- ✅ Toggle-Button mit `‹`/`›` in Gold — Task 1 Step 4
- ✅ Labels/Gruppen ausgeblendet bei collapsed — Task 1 Steps 5–7
- ✅ localStorage-Persist — Task 1 Steps 1 + 8
- ✅ No-Flicker beim Laden — Task 1 Step 1
- ✅ Tooltips auf Icons bei collapsed — Task 1 Step 6 (`title` auf `<a>`)
- ✅ Docsify-Toggle CSS-Aufwertung — Task 2 Step 1
- ✅ Gold-Farbe, größere Klickfläche, Hover-Effekt — Task 2 Step 1

**Placeholder-Scan:** Keine gefunden.

**Typ-Konsistenz:** Keine shared types zwischen Tasks.
