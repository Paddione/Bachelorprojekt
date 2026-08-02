# Proposal: admin-redirect-map

_Ticket: T001789 · Epic: T001786 · Design-Spec: docs/superpowers/specs/2026-07-10-admin-foundation-design.md §T2_

## Why

Es gibt **23 Redirect-Stub-`.astro`-Seiten** unter `pages/admin/` (11 zeigen auf `/admin/inhalte`).
**16 der 23 tragen einen Query-String im Ziel** (`/admin/inhalte?tab=website&section=startseite`).
`astro.config.mjs` hat noch **keine** `redirects`-Config, und Astros `redirects`-Option ist als
„Route → Pfad"-Mapping dokumentiert und **schweigt zu Query-Strings** im Ziel. Jeder Stub wiederholt
zudem den 62-fach kopierten Auth-Block.

## What

- Eine **`REDIRECT_MAP`** (`Record<string, string>`, Pfad → Vollziel inkl. Query) in
  `src/middleware.ts`. Match → `301`-Redirect **vor** dem Route-Rendern; kein Match → bestehende
  Locale/Logging-Kette unverändert.
- Die betroffenen Stub-`.astro`-Dateien **löschen**.
- **Failing Unit-Test** mit allen Pfad→Ziel-Paaren als Tabelle (rot→grün), der verifiziert, dass
  jeder alte Pfad exakt auf sein bisheriges Ziel (inkl. Query) mappt.

**Abgrenzung (wichtig):** Nur die **literalen Einfach-Ziel-Stubs** wandern in die Map. Drei Routen
(`admin/brett/[...path].astro`, `admin/bugs.astro`, `admin/meetings/[id].astro`) sind **dynamische
Routen mit bedingten Redirects** (kein Literal-Ziel) — die bleiben unangetastet und gehören NICHT in
die `REDIRECT_MAP`. Der Plan muss die Extraktion (`grep` der letzten `Astro.redirect('…')`-Zeile
ohne `AdminLayout`-Import) verwenden und diese drei ausschließen.

**Begründung Middleware statt `astro.config`-`redirects`:** `middleware.ts` (heute 15 Zeilen) ist
genau der Ort, an dem in Welle 2 der `requireAdmin()`-Guard landet — beide Wellen teilen eine Datei.
Query-Strings sind dort trivial; die Map ist als reiner Unit-Test prüfbar. S1-Limit `.ts` = 600,
Wachstum unkritisch.
