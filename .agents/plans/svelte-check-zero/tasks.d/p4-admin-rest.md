# p4 — Admin-Rest

Target files: siehe Manifest-Zeile `p4` in `tasks.md`.

Kontext: `design.md` D5, Abschnitt „Gemeinsame Fix-Regeln für p2–p6" in `tasks.md`.
Voraussetzung: p1 ist erledigt, `components/website/node_modules/.bin/svelte-check` existiert.

### Task 1: Fehler beheben

svelte-check-Meldungen auf origin/main (Zeile:Spalte, erste Zeile der Meldung):

#### `components/website/src/components/admin/WissenHub.svelte`
- 6:10 Module '"components/website/src/components/admin/KnowledgeSourceModal.svelte"' has no default export.
- 115:18 Property 'badge' does not exist on type '{ readonly id: "einlesen"; readonly label: "Einlesen"; } | { readonly id: "sammlungen"; readonly label: "Sammlungen"; } | { readonly id: "operationen"; readonly label: \
- 116:36 Property 'badge' does not exist on type '{ readonly id: "einlesen"; readonly label: "Einlesen"; } | { readonly id: "sammlungen"; readonly label: "Sammlungen"; } | { readonly id: "operationen"; readonly label: \
- 231:22 Type '() => void' is not assignable to type 'never'.

#### `components/website/src/components/admin/inhalte/AngeboteSection.svelte`
- 21:180 Object literal may only specify known properties, and 'meta' does not exist in type 'ServiceOverride'.
- 35:71 Type '{}' is missing the following properties from type 'ServicePageContent': headline, intro, forWhom, sections, pricing

#### `components/website/src/components/admin/platform/SoftwareTab.svelte`
- 164:5 Type 'EditableAsset | null' is not assignable to type 'Partial<SoftwareAsset> & { clusters: string[]; }'.

#### `components/website/src/components/admin/graph/GraphCanvas.svelte`
- 15:13 Interface 'SimEdge' incorrectly extends interface 'SimulationLinkDatum<SimNode>'.
- 37:42 Type 'SimEdge' does not satisfy the constraint 'SimulationLinkDatum<SimNode>'.
- 114:44 Type 'SimEdge' does not satisfy the constraint 'SimulationLinkDatum<SimNode>'.
- 121:13 Property 'vx' does not exist on type 'SimNode'.
- 121:21 Property 'vx' does not exist on type 'SimNode'.
- 122:13 Property 'vy' does not exist on type 'SimNode'.
- 122:21 Property 'vy' does not exist on type 'SimNode'.

#### `components/website/src/components/admin/aktionen/BackupsTab.svelte`
- 30:13 Argument of type '"success"' is not assignable to parameter of type 'ToastKind'.
- 43:21 Argument of type '"success"' is not assignable to parameter of type 'ToastKind'.

#### `components/website/src/components/admin/aktionen/KnowledgeTab.svelte`
- 29:13 Argument of type '"success"' is not assignable to parameter of type 'ToastKind'.

#### `components/website/src/components/admin/aktionen/ReleasesTab.svelte`
- 25:13 Argument of type '"success"' is not assignable to parameter of type 'ToastKind'.

#### `components/website/src/components/admin/aktionen/UsersTab.svelte`
- 45:33 Argument of type '"warning"' is not assignable to parameter of type 'ToastKind'.
- 46:18 Argument of type '"success"' is not assignable to parameter of type 'ToastKind'.

### Hinweise zu bekannten Ursachen

- `aktionen/*Tab.svelte`: `toast()` aus `src/lib/admin-api.ts` akzeptiert `'info' | 'ok' | 'warn' | 'err'`.
  `'success'` → `'ok'`, `'warning'` → `'warn'`. Laufzeitdefekt: falsche Toast-Darstellung.
- `WissenHub.svelte:6`: `KnowledgeSourceModal.svelte` hat keinen Default-Export im erwarteten Sinn.
  Import gegen die tatsächliche Komponente prüfen und korrigieren.
- `WissenHub.svelte:115–116`: Tabs-Array ohne `badge`. Typ des Arrays um `badge?: number` erweitern.
- `GraphCanvas.svelte`: `SimNode`/`SimEdge` von d3s `SimulationNodeDatum`/`SimulationLinkDatum<SimNode>`
  ableiten, statt die Felder selbst zu deklarieren. `source`/`target` als `string | SimNode`.

### Task 2: Prüfen

```bash
cd components/website && ./node_modules/.bin/svelte-check --threshold error --output machine | grep ' ERROR '
```

Keine Zeile darf eine Datei dieses Partials nennen.
