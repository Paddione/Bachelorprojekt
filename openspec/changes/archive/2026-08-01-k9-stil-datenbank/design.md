# Design: K9 — Stil-Datenbank als Gestaltungsquelle

**Ticket:** T002468 · **Epic:** T002458 · **Stand:** design-fertig (Brainstorming abgeschlossen)

## Kontext

E14 verlangt, dass Modelle Gestaltungsideen und Farbwelten aus einer **Stilquelle**
ziehen können. Das Kit (K1/E11) ist das anwendbare Token-System; K9 ist die
**Sammlung dahinter**: fertige, geerntete Arbeit als Geschmacks- und Farbbeispiel.

Brainstorming-Entscheidungen (User, 2026-07-31):
1. **Repo-Dateien** (JSON + Markdown), keine DB-Tabelle — versionskontrolliert,
   diffbar, per PR beitragbar.
2. **Strukturiertes JSON-Schema**: `id`, `name`, `zweck`, `herkunft`,
   `beleg_ausschnitt`, `token_bezuege`, `tags`.
3. **Adapter + Daemon-Route**: `data.styles()` im K2-Adapter und
   `GET /api/cockpit/styles` — konsistent mit dem Adapter-Vertrag (E1, E16).
4. **Inspiration, kein Kit-Theme**: Das Kit bleibt E20-strikt (ein Akzent,
   nur Status-Farben). Die Datenbank ist Inspirationsquelle, nicht direkt
   anwendbares Theme.

## Architektur

```
.lavish/styles/
├── schema.json          # JSON-Schema, das jeden Eintrag validiert
├── index.json           # Verzeichnis: id → {name, zweck, herkunft, tags} für alle Einträge
├── README.md            # Beitragsregeln (D14) + Verweis auf Schema
├── <id-1>.json          # Eintrag 1 (Beispiel aus echtem Board)
└── <id-2>.json          # Eintrag 2 (Beispiel aus echtem Board)
```

### Datenebene (p1, p2)

- **Ein JSON pro Eintrag** unter `.lavish/styles/<id>.json`, validiert durch
  `schema.json` (Pflichtfelder: `id`, `name`, `zweck`, `herkunft`,
  `beleg_ausschnitt`, `token_bezuege`; optional: `tags`).
- **`token_bezuege`**: ausschließlich Token-Referenzen (`--lv-*` / `--color-*`),
  keine festen Hex-/Pixel-Werte — D14 Regel 2.
- **`index.json`**: schlankes Verzeichnis aller Einträge (id → Metadaten);
  ist zugleich die Antwortquelle für Adapter/Daemon.
- **`README.md`**: D14-Beitragsregeln — ein Eintrag kommt nur mit allen drei
  Dingen ins Kit: Beleg-Ausschnitt, ausschließlich Token-Bezüge,
  Verzeichniseintrag mit Zweck und Herkunftsprojekt.

### Zugriff (p3)

- **Adapter** (`adapter.js`): neue Methode `data.styles()` — liest
  `index.json` + Einträge, gibt `{ entries, fetchedAt }` zurück; bei
  nicht erreichbarer Quelle `{ error }` statt stiller Null (D13).
- **Daemon** (`daemon/server.ts`): neue Route `GET /api/cockpit/styles` mit
  demselben Antwortformat (Adapter-Vertrag, E16 brand-Parameter).
- Panels rufen **nie** `fetch()` direkt auf (E1) — nur `data.styles()`.

### Tests (p4)

- BATS `tests/spec/sdlc-cockpit/k9-stil-datenbank.bats`:
  - Schema-Validität aller Einträge (jq gegen schema.json)
  - D14-Negativtest mit Positiv-Anker: Einträge enthalten ausschließlich
    Token-Bezüge; Anker: mindestens ein gültiger Eintrag existiert
  - Daemon-Route antwortet (skippt ohne laufenden Daemon, K2-Konvention)
- Vitest `tests/unit/cockpit-styles.test.ts`: Adapter `data.styles()` — Form,
  `fetchedAt`, D13-Fehlerpfad.

## Nicht-Ziele

- Kein direkt anwendbares Kit-Theme (E20 bleibt strikt)
- Keine externen Quellen — erst eigenes Material (Ticket-Vorbedingung)
- Keine DB-Tabelle, kein Migrationsschema

## Offene Fragen

Keine für die Umsetzung. Externe Quellen (später) erweitern nur die
Datenebene, nicht den Adapter-Vertrag.
