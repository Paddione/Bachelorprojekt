---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-12
---

# picker-depth-guard — Design (T901942)

## Root Cause

**Defekt 1 — Unbegrenzte Rekursion im Directory-Picker.**
`directory-picker-modal.tsx` baut aus IndexedDB-Pfaden einen Baum
(`buildTree`, iterativ) und traversiert ihn rekursiv an drei Stellen:
`sortTree` (useMemo, ganzer Baum), `visit` (Filter, ganzer Baum),
`renderNode` (nur expandierte Zweige). Keine Stelle begrenzt die Tiefe.
Messung: plain-Rekursion gleicher Form wirft `RangeError` ab ~5000 Ebenen
(Node); unter React/jsdom liegt die Schwelle deutlich tiefer. Erreichbar
über pathologische Bibliothekspfade (z. B. importierte Fremddaten): ein
6000-gliedriger Pfad crasht den Picker heute. Kein Error-Boundary fängt das.

**Nicht-Defekt — combine-docs-Rekursion.**
`renderNode` in `scripts/combine-docs.mjs` folgt Markdown-Überschriften;
der Parser-Regex `^(#{1,6})` begrenzt die Tiefe auf 6. Der Graph-Flag ist
strukturell, nicht behavioral — keine Änderung.

**Defekt 2 — Traversal-Guard antwortet 500 statt 400.**
`resolveAndValidateMovieDir` wirft `Path traversal detected` an 6 Stellen in
`processing-movie-handlers.ts` (5 Handler). Alle Catches mappen generisch auf
500. Angriffs-Input erzeugt Server-Fehler statt Client-Fehler plus Log-Lärm.
Alle übrigen 21 Server-Throw-Sites geprüft: Fail-fast am Start, lokal
gecatcht, via Express-Error-Middleware abgedeckt, test-only oder unerreichbar.

## Fix-Ansatz

**Teil 1 — Tiefen-Cap im reinen Modul.**
`TreeNode`, `buildTree`, `sortTree` aus dem Modal in
`client/src/components/directory-tree.ts` extrahieren (reiner Move, S2-sicher:
keine Imports). `MAX_TREE_DEPTH = 256` in `buildTree` erzwingen: Segmente
jenseits der Tiefe werden verworfen (Trunkierung, kein Fehler). Das Modal
importiert statt selbst zu definieren und schrumpft. Alle drei Rekursionen
sind dadurch automatisch begrenzt (Choke-Point). 256 ist 20-fach unter der
gemessenen Crash-Schwelle und 5-fach über realistischen Bäumen (< 50).
Zusätzlich `maxTreeDepth`-Helper für Tests exportieren.

**Teil 2 — Status-Mapping für Traversal.**
`TraversalError extends Error` in `processing-helpers.ts` (Nachricht
unverändert) plus pure `toRouteError(error)`-Abbildung (Traversal → 400,
Rest → 500). Alle 5 betroffenen Catches in
`processing-movie-handlers.ts` nutzen sie.

## Betroffene Subsysteme

VideoVault-Client (Picker), VideoVault-Server (Movie-Routen), pytest-Spec
(`tests/py/spec/videovault/`, neuer Bereich — kein passendes Modul vorhanden).

## Edge-Cases

Leere Verzeichnisliste; exakt 256 Ebenen (bleibt vollständig); Filter über
 trunkiertem Baum; `expanded`-Pfade jenseits des Caps (existieren nicht,
harmlos); Symlink-Zyklen sind in String-Pfad-Bäumen per Konstruktion
unmöglich (Map-Key auf Pfad); `TraversalError` bleibt `instanceof Error`
(Rückwärtsverhalten aller anderen Catcher); normale Bäume rendern
pixel-identisch (nur verworfene Tiefe ändert sich).

## Nicht-Ziele

Reparatur der vv-Client-tsx-Toolchain (vitest/oxc-JSX-Transform defekt,
17 Suiten rot auf main seit September — separates Ticket, als Risiko
vermerkt); generelle 500→400-Revision weiterer Routen; combine-docs.
