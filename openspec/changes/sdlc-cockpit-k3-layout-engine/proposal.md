# Proposal: sdlc-cockpit-k3-layout-engine

## Why

Das Kit aus K1 liefert einzelne Panels in drei Größen, aber keine Fläche, die sie
ordnet. Beide Hüllen — `.lavish/cockpit-shell.html` und
`website/src/pages/admin/cockpit.astro` — tragen dafür heute je einen handgeschriebenen
`<style>`-Block mit `.cockpit-layout` / `.cockpit-focus` / `.cockpit-workspace`. Das ist
zweimal derselbe Code, er kennt keinen Zustand, und er kann nichts von dem, was Abschnitt 3
der Design-Spec verlangt: kein Umsortieren, kein Panel-Katalog, kein Ausklinken in ein
eigenes Fenster, kein Aufziehen des Canvas auf die Vollfläche, keine mobile Struktur.

K3 ersetzt beide Style-Blöcke durch eine gemeinsame Layout-Engine im Kit. Weil
`website/public/cockpit/kit/*` Datei-für-Datei-Symlinks auf `.lavish/kit/*` sind, bedient
eine Engine im Kit automatisch beide Hüllen — es entsteht keine zweite, nach Svelte
portierte Fassung.

## What

- Neues Kit-Modul `.lavish/kit/layout.js` (klassisches Skript, buildfrei nach D1) mit:
  Fokus-Spalte + Arbeitsbereich (E3), festgelegter Rail-Inhalt (D7), Panel-Katalog,
  Ziehen und Ablegen über Pointer Events, Pop-out in ein eigenes Fenster,
  Vollflächen-Umschaltung für das Canvas-Panel (E7, ein Zustand — zwei Layouts),
  mobile Struktur nach 3.2 und Persistenz der Anordnung über `localStorage`.
- Neue Stilschicht `.lavish/kit/layout.css`. `tokens.css` bleibt selektorfrei (E11).
- Eng begrenzter Eingriff in `.lavish/kit/panel.js`: `destroy()` räumt die statische
  Registry, plus ein Lesezugriff `Panel.get(el)`. `resize()` und `confirmAction()` werden
  **nicht** angefasst — dort baut K4 (T002463) um.
- Beide Hüllen laden die Engine; ihre lokalen Layout-Style-Blöcke entfallen.
- `website/public/cockpit/kit/layout.js` und `layout.css` als Symlinks, damit die Dateien
  auch im Dev-Server und im Prod-Image unter `/cockpit/kit/` erreichbar sind.

Nicht Teil dieses Vorgangs: die Abstufung von Bestätigungen und die sitzungsweise
Freischaltung nicht umkehrbarer Aktionen (D5/D6) — das ist K4. K3 setzt darauf auf und
sperrt eigenständig nur das, was Layout-Sache ist: das Terminal-Panel mobil (D8).

_Ticket: T002462_
