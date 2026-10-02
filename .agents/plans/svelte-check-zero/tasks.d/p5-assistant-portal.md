# p5 — Assistant, Inbox, Portal

Target files: siehe Manifest-Zeile `p5` in `tasks.md`.

Kontext: `design.md` D5, Abschnitt „Gemeinsame Fix-Regeln für p2–p6" in `tasks.md`.
Voraussetzung: p1 ist erledigt, `components/website/node_modules/.bin/svelte-check` existiert.

### Task 1: Fehler beheben

svelte-check-Meldungen auf origin/main (Zeile:Spalte, erste Zeile der Meldung):

#### `components/website/src/components/assistant/LlmProxyView.svelte`
- 7:7 'state' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- 7:15 Block-scoped variable '$state' used before its declaration.
- 7:15 Untyped function calls may not accept type arguments.

#### `components/website/src/components/assistant/LogsSidekickView.svelte`
- 85:40 Argument of type '(line: any) => Promise<void>' is not assignable to parameter of type '() => void'.
- 85:47 Parameter 'line' implicitly has an 'any' type.
- 112:40 Argument of type '(line: any) => Promise<void>' is not assignable to parameter of type '() => void'.
- 112:47 Parameter 'line' implicitly has an 'any' type.

#### `components/website/src/components/assistant/SidekickHome.svelte`
- 26:34 Argument of type '({ id: string; no: string; title: string; sub: string; badge: number | undefined; show: boolean; } | { id: string; no: string; title: string; sub: string; show: boolean; badge?: undefined; })[]' is not

#### `components/website/src/components/inbox/InboxApp.svelte`
- 237:9 Type 'KeyboardEvent' is not assignable to type '{ key: string; metaKey?: boolean | undefined; ctrlKey?: boolean | undefined; shiftKey?: boolean | undefined; altKey?: boolean | undefined; target?: { tagName?: string | und

#### `components/website/src/components/portal/InlineInvoicePayment.svelte`
- 19:23 Property 'destroy' does not exist on type 'StripeElements'.
- 89:23 Property 'destroy' does not exist on type 'StripeElements'.

#### `components/website/src/components/portal/WorkflowStatusMinimap.svelte`
- 93:55 Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'Record<"offen" | "erledigt" | "geplant" | "leer", string>'.

### Hinweise zu bekannten Ursachen

- `LlmProxyView.svelte:7`: `let state = $state<...>` kollidiert mit der Rune. Variable umbenennen.
- `LogsSidekickView.svelte:85, 112`: Callback erwartet `(line) => ...`, die Signatur des Aufrufers
  ist `() => void`. Prüfen, ob der Aufrufer eine Zeile übergibt. Laufzeitdefekt, falls `line`
  immer `undefined` ist.
- `InlineInvoicePayment.svelte:19, 89`: `StripeElements` hat kein `destroy()`. Die gemounteten
  Elemente per `element.destroy()` bzw. `unmount()` abbauen (Doku: `@stripe/stripe-js`).
- `WorkflowStatusMinimap.svelte:93`: Schlüssel vor dem Index auf den Union-Typ einschränken.

### Task 2: Prüfen

```bash
cd components/website && ./node_modules/.bin/svelte-check --threshold error --output machine | grep ' ERROR '
```

Keine Zeile darf eine Datei dieses Partials nennen.
