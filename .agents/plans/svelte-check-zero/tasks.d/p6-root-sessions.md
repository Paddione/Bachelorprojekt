# p6 — Root-Komponenten, Sessions, tote live-Komponenten

Target files: siehe Manifest-Zeile `p6` in `tasks.md`.

Kontext: `design.md` D5, Abschnitt „Gemeinsame Fix-Regeln für p2–p6" in `tasks.md`.
Voraussetzung: p1 ist erledigt, `components/website/node_modules/.bin/svelte-check` existiert.

### Task 1: Fehler beheben

svelte-check-Meldungen auf origin/main (Zeile:Spalte, erste Zeile der Meldung):

#### `components/website/src/components/BookingForm.svelte`
- 23:103 Expected 0 type arguments, but got 1.

#### `components/website/src/components/ContactHub.svelte`
- 36:14 Expected 0 type arguments, but got 1.

#### `components/website/src/components/MediaviewerPanel.svelte`
- 70:62 Argument of type '"grilling" | "video" | "brainstorm" | "idle"' is not assignable to parameter of type '"grilling" | "video" | "brainstorm"'.

#### `components/website/src/components/PlanningOffice.svelte`
- 316:13 Type '(e: DragEvent, it: PlanItem) => void' is not assignable to type '(e: DragEvent, it: PlanItem) => void'. Two different types with this name exist, but they are unrelated.
- 321:13 Type '(it: PlanItem, idx: number) => Promise<void>' is not assignable to type '(it: PlanItem, idx: number) => void'.
- 322:13 Type '(it: PlanItem) => void' is not assignable to type '(it: PlanItem) => void'. Two different types with this name exist, but they are unrelated.
- 323:13 Type '(e: PointerEvent, it: PlanItem) => void' is not assignable to type '(e: PointerEvent, it: PlanItem) => void'. Two different types with this name exist, but they are unrelated.
- 342:13 Type '(it: PlanItem, key: string) => Promise<void>' is not assignable to type '(item: PlanItem, key: string) => void'.
- 343:13 Type '(it: PlanItem) => Promise<void>' is not assignable to type '(item: PlanItem) => void'.
- 346:13 Type '(it: PlanItem, requirements: string[]) => Promise<void>' is not assignable to type '(item: PlanItem, requirements: string[]) => void'.
- 347:13 Type '(it: PlanItem) => Promise<void>' is not assignable to type '(item: PlanItem) => void'.

#### `components/website/src/components/PlanningOfficeItem.svelte`
- 35:6 Type '{ item: any; override: any; newDep: any; patchFn: any; toggleDorFn: any; promoteFn: any; removeDepFn: any; addDepFn: any; }' is missing the following properties from type '$$ComponentProps': saveRequirementsFn, loc

#### `components/website/src/components/WhyMe.svelte`
- 51:30 Object literal may only specify known properties, and '"set:html"' does not exist in type 'HTMLProps<"h2", HTMLAttributes<any>>'.

#### `components/website/src/components/sessions/SessionsHistory.svelte`
- 117:57 Property 'owner' does not exist on type 'ArchivedSession'.
- 118:23 Property 'participants' does not exist on type 'ArchivedSession'.
- 118:44 Property 'participants' does not exist on type 'ArchivedSession'.
- 119:68 Property 'participants' does not exist on type 'ArchivedSession'.

#### `components/website/src/components/live/shared/ScheduleNudge.svelte`
- 2:37 Cannot find module '../../../lib/live-state' or its corresponding type declarations.

#### `components/website/src/components/live/stream/PollOverlayPanel.svelte`
- 2:35 Cannot find module '../../../lib/live-state' or its corresponding type declarations.

### Hinweise zu bekannten Ursachen

- `WhyMe.svelte:51`: `set:html` ist Astro-Syntax. In Svelte `{@html ...}` als Kindinhalt des `<h2>`
  verwenden. Laufzeitdefekt: die Überschrift ist heute leer.
- `BookingForm.svelte:23`, `ContactHub.svelte:36`: Funktion ohne Generics mit Typargument
  aufgerufen. Typargument entfernen und das Ergebnis per Annotation typisieren.
- `PlanningOffice.svelte`: `PlanItem` ist zweimal definiert (Meldung „Two different types with this
  name exist"). Eine Definition verwenden. Async-Handler an Props mit `=> void` sind zulässig,
  wenn die Prop-Signatur auf `=> void | Promise<void>` erweitert wird.
- `PlanningOfficeItem.svelte:35`: Pflicht-Props `saveRequirementsFn`, `loc` fehlen beim Aufruf.
- `SessionsHistory.svelte:117–119`: `ArchivedSession` in `src/lib/sessions/archive.ts` hat kein
  `owner`/`participants`. Prüfen, ob die Query in `archive.ts` diese Felder liefert. Wenn ja, das
  Interface ergänzen. Wenn nein, die Anzeige entfernen.
- Löschen (D4): `src/components/live/shared/ScheduleNudge.svelte` und
  `src/components/live/stream/PollOverlayPanel.svelte`. Vorher bestätigen, dass nichts sie importiert:
  `rg -n "ScheduleNudge|PollOverlayPanel" components/website/src` muss leer sein.

### Task 2: Prüfen

```bash
cd components/website && ./node_modules/.bin/svelte-check --threshold error --output machine | grep ' ERROR '
```

Keine Zeile darf eine Datei dieses Partials nennen.
