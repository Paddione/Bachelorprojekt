# p3 — Admin-Kern

Target files: siehe Manifest-Zeile `p3` in `tasks.md`.

Kontext: `design.md` D5, Abschnitt „Gemeinsame Fix-Regeln für p2–p6" in `tasks.md`.
Voraussetzung: p1 ist erledigt, `components/website/node_modules/.bin/svelte-check` existiert.

### Task 1: Fehler beheben

svelte-check-Meldungen auf origin/main (Zeile:Spalte, erste Zeile der Meldung):

#### `components/website/src/components/admin/AppCatalog.svelte`
- 198:49 'selectedApp' is possibly 'null'.
- 216:47 'selectedApp' is possibly 'null'.

#### `components/website/src/components/admin/ArchitekturGraph.svelte`
- 38:48 Property 'id' does not exist on type 'never'.

#### `components/website/src/components/admin/AssetGallery.svelte`
- 74:5 Object literal may only specify known properties, and 'image' does not exist in type 'Record<"all", string>'.
- 96:10 Element implicitly has an 'any' type because expression of type '"image" | "document" | "all" | "video" | "audio"' can't be used to index type 'Record<"all", string>'.

#### `components/website/src/components/admin/BulkToast.svelte`
- 65:83 Argument of type 'string | undefined' is not assignable to parameter of type 'string'.

#### `components/website/src/components/admin/DraftsInbox.svelte`
- 129:56 'rateBadge' is possibly 'undefined'.
- 141:56 'rateBadge' is possibly 'undefined'.
- 143:36 'rateBadge' is possibly 'undefined'.

#### `components/website/src/components/admin/InhalteEditor.svelte`
- 199:102 Type 'Record<string, unknown> | null' is not assignable to type 'ContentValue'.
- 200:134 Type 'Record<string, unknown> | null' is not assignable to type 'ContentValue'.

#### `components/website/src/components/admin/PublishEditor.svelte`
- 90:87 Type 'string' is not assignable to type 'Surface'.

#### `components/website/src/components/admin/TaxMonitorWidget.svelte`
- 8:55 Property 'revenue' does not exist on type 'never'.
- 8:84 Property 'thresholdKlein' does not exist on type 'never'.
- 10:14 Property 'status' does not exist on type 'never'.
- 10:46 Property 'status' does not exist on type 'never'.
- 11:14 Property 'status' does not exist on type 'never'.

### Hinweise zu bekannten Ursachen

- `possibly 'null'`/`'undefined'`: mit vorhandenem Guard (`{#if}`) oder Optional Chaining lösen,
  nicht mit `!`, wenn der Wert zur Laufzeit wirklich fehlen kann.
- `Property 'x' does not exist on type 'never'` (`TaxMonitorWidget`, `ArchitekturGraph`): die
  Variable ist mit `null` oder `[]` ohne Typ initialisiert. Explizit typisieren, z. B.
  `let data = $state<TaxStatus | null>(null)`, den Typ aus dem API-Modul importieren.
- `AssetGallery.svelte:74`: `Record<'all', string>` ist zu eng, auf den Union-Typ der Kategorien
  erweitern.

### Task 2: Prüfen

```bash
cd components/website && ./node_modules/.bin/svelte-check --threshold error --output machine | grep ' ERROR '
```

Keine Zeile darf eine Datei dieses Partials nennen.
