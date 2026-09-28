# p2 — SDLC-Factory und Leitstand

Target files: siehe Manifest-Zeile `p2` in `tasks.md`.

Kontext: `design.md` D5, Abschnitt „Gemeinsame Fix-Regeln für p2–p6" in `tasks.md`.
Voraussetzung: p1 ist erledigt, `components/website/node_modules/.bin/svelte-check` existiert.

### Task 1: Fehler beheben

svelte-check-Meldungen auf origin/main (Zeile:Spalte, erste Zeile der Meldung):

#### `components/website/src/components/sdlc/FactoryFloor.svelte`
- 215:10 Object literal may only specify known properties, and 'ciByExt' does not exist in type '$$ComponentProps'.

#### `components/website/src/components/sdlc/factory/ControlPanel.svelte`
- 23:7 'state' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- 23:15 Block-scoped variable '$state' used before its declaration.
- 23:15 Untyped function calls may not accept type arguments.
- 24:15 Untyped function calls may not accept type arguments.

#### `components/website/src/components/sdlc/factory/ConveyorBelt.svelte`
- 113:8 Property 'onSelect' is missing in type '{ station: { key: Phase; label: string; }; compact: true; items: HallItem[]; selected: boolean; isFirst: boolean; onStationSelect: (key: string) => void; }' but required in type '$

#### `components/website/src/components/sdlc/factory/KiRoutingPanel.svelte`
- 301:51 Property 'debug' does not exist on type '{ error: (msgOrMeta: string | Meta, msg?: string | undefined) => void; warn: (msgOrMeta: string | Meta, msg?: string | undefined) => void; info: (msgOrMeta: string | Meta, msg?: s
- 346:30 Type 'unknown' must have a '[Symbol.iterator]()' method that returns an iterator.
- 346:14 Argument of type 'Record<string, string>' is not assignable to parameter of type 'ArrayLike<unknown> | Iterable<unknown> | null | undefined'.

#### `components/website/src/components/sdlc/factory/LlmProxyPanel.svelte`
- 19:7 'state' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- 19:15 Block-scoped variable '$state' used before its declaration.
- 19:15 Untyped function calls may not accept type arguments.
- 21:15 Untyped function calls may not accept type arguments.
- 23:18 Untyped function calls may not accept type arguments.
- 26:16 Untyped function calls may not accept type arguments.

#### `components/website/src/components/leitstand/LeitstandStatusband.svelte`
- 41:30 Property 'slots' does not exist on type 'FloorPayload'.
- 42:37 Property 'slotCap' does not exist on type 'ControlSnapshot'. Did you mean 'slotsCap'?

### Hinweise zu bekannten Ursachen

- `ControlPanel.svelte`, `LlmProxyPanel.svelte`: `let state = $state<...>(...)`. Eine Variable namens
  `state` kollidiert mit der Rune `$state` (Svelte deutet `$state` dann als Store-Abo auf `state`).
  Variable umbenennen (z. B. `panelState`) und alle Verwendungen in der Datei mitziehen.
- `LeitstandStatusband.svelte:41–42`: liest `s.payload.slots` und `control.slotCap`. Der Typ in
  `src/lib/factory-floor-types.ts` hat `slotsCap`. Prüfen, welche Felder der Endpoint wirklich
  liefert (`src/lib/sdlc/factory-floor.ts`, `getControl`), und den Feldnamen in der Komponente
  korrigieren. Laufzeitdefekt: heute greift immer der Fallback.
- `ConveyorBelt.svelte:113`: Pflicht-Prop `onSelect` fehlt. Aus der Kindkomponente ablesen, was
  `onSelect` tun soll, und durchreichen.
- `FactoryFloor.svelte:215`: übergibt `ciByExt`, das die Kindkomponente nicht deklariert. Entweder
  das Prop in der Kindkomponente deklarieren und nutzen, falls sie es braucht, oder die Übergabe
  entfernen. Liegt die Kindkomponente außerhalb der target_files, die Übergabe entfernen, wenn sie
  ungenutzt ist.
- `KiRoutingPanel.svelte:301`: Logger hat kein `debug`. Auf `info` umstellen.
- `KiRoutingPanel.svelte:346`: `Object.entries` statt Iteration über ein `Record`.

### Task 2: Prüfen

```bash
cd components/website && ./node_modules/.bin/svelte-check --threshold error --output machine | grep ' ERROR '
```

Keine Zeile darf eine Datei dieses Partials nennen.
