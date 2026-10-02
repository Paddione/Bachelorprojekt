---
ticket_id: T900809
plan_ref: .agents/plans/svelte-check-zero/tasks.md
status: active
date: 2026-09-28
---

# svelte-check-zero — Design

_Ticket: T900809_

## Symptom (Fakt)

`svelte-check --threshold error` (4.7.6, per `npx`) meldet auf origin/main 85 Fehler in 37
`.svelte`-Dateien unter `components/website/src/components/`. CI ist trotzdem grün.

```bash
cd components/website && npx svelte-check --threshold error --output machine | grep -c ' ERROR '   # 85
```

## Ursache (belegt)

1. Der CI-Job `Vitest (website)` (`.github/workflows/ci.yml`, Schritt mit `pnpm run astro:check`)
   führt nur `astro check` aus. Das prüft `.astro`- und `.ts`-Dateien, keine `.svelte`-Dateien:
   `./node_modules/.bin/astro check` meldet `Result (1323 files): 0 errors`.
2. `svelte-check` ist keine Dependency von `components/website` (`node_modules/.bin/svelte-check`
   fehlt). Es gibt deshalb keinen lokalen oder CI-Befehl, der die Fehler sichtbar macht.

## Echte Laufzeitdefekte unter den 85 Fehlern (Stichprobe verifiziert)

- `WhyMe.svelte:51` nutzt die Astro-Direktive `set:html` in Svelte. Svelte rendert das als
  Attribut, die Überschrift bleibt leer.
- `admin/aktionen/*Tab.svelte` übergeben `'success'`/`'warning'` an `toast()`. `ToastKind` in
  `src/lib/admin-api.ts` ist `'info' | 'ok' | 'warn' | 'err'`.

Weitere Kandidaten, die die Partials am Quelltext entscheiden: `LeitstandStatusband` liest
`slotCap`/`slots` (Typ kennt `slotsCap`), `InlineInvoicePayment` ruft `StripeElements.destroy()`,
`ConveyorBelt` übergibt kein Pflicht-Prop `onSelect`, `WissenHub` importiert einen nicht
vorhandenen Default-Export, `KiRoutingPanel` ruft `log.debug`, das der Logger nicht hat,
drei Komponenten deklarieren `let state = $state(...)` (Namenskollision mit der Rune).

## Entscheidungen

- **D1 Gate:** `svelte-check --threshold error` wird devDependency und läuft im CI-Job
  `Vitest (website)` parallel zu `astro:check`, blockierend. Harte Grenze 0, kein Ratchet.
- **D2 Failing Test:** `tests/spec/website-svelte-check.bats` prüft 0 Fehler (Befehlsausgabe) und
  dass der CI-Job den Schritt enthält.
- **D3 Partials:** p1 Gate, p2–p6 Fixes mit disjunkten Dateien, alle nach p1.
- **D4 Tote Komponenten:** `live/shared/ScheduleNudge.svelte` und `live/stream/PollOverlayPanel.svelte`
  werden gelöscht. Beide werden nirgends importiert, `lib/live-state` gab es in der Historie nie.
- **D5 Fix-Regel:** Laufzeitdefekt → Verhalten korrigieren. Reiner Typfehler → Typ korrigieren,
  Verhalten unverändert. Keine neuen `any`, kein `@ts-ignore`/`@ts-expect-error`.
