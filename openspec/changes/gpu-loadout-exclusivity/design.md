---
title: GPU-Exklusivitäts-Guard für llama.cpp-Loadouts
ticket_id: T002616
domains: [bachelorprojekt-infra, bachelorprojekt-ops]
status: planning
---

# Design: GPU-Exklusivitäts-Guard

## Ausgangslage

`scripts/llm-proxy/runner.mjs` startet Loadouts als transiente systemd-User-Units
(`systemd-run --user --unit=llama-<slug>`). `startUnit()` führt `execFileSync` ohne jede
Vorprüfung aus. Die einzige Stelle, die `startUnit` aufruft, ist `server.mjs:264`.

Vorhandene Bausteine, die wiederverwendet werden:

| Funktion | Datei | Rolle im Guard |
|---|---|---|
| `unitName(slug)` | `runner.mjs` | erzeugt `llama-<slug>.service` |
| `unitStatus(slug)` | `runner.mjs` | liefert `{exists, active, sub}` via `systemctl --user show` |
| `LoadoutStartError` | `server.mjs` | trägt HTTP-Status + Fehlercode zum Client |

## Schnitt

Drei Einheiten, jede für sich verständlich und einzeln testbar:

### 1. `isGpuBound(loadout) → boolean`

Prädikat auf `loadout.fit?.enabled === true`.

Die Alternative — ein eigenes Feld `exclusiveGroup: "gpu0"` in `loadouts.json` — wurde verworfen.
Sie wäre eine zweite, handgepflegte Wahrheit über dieselbe Eigenschaft: ein Loadout mit
`fit.enabled=true` *ist* GPU-gebunden, denn `--fit` verteilt Layer auf die Karte. Zwei Felder
können auseinanderlaufen, eines nicht. Sollte je eine zweite GPU hinzukommen, ist das der
Zeitpunkt für ein Gruppenfeld — nicht vorher (YAGNI).

### 2. `findGpuConflict(slug, loadouts, statusOf) → string | null`

Reine Funktion. Liefert den Slug des blockierenden Loadouts oder `null`.

```
für jedes anderes Loadout L in loadouts:
    wenn L.slug === slug            -> überspringen   (kein Selbstkonflikt)
    wenn nicht isGpuBound(L)        -> überspringen   (CPU, egal)
    wenn statusOf(L.slug).active === 'active' -> return L.slug
return null
```

`statusOf` wird **injiziert** statt importiert. Der Test stubbt es und läuft damit ohne systemd;
produktiv wird `unitStatus` übergeben. Ohne Injektion wäre die Funktion nur mit laufender
Systemumgebung testbar — und ein Test, der echte Units startet, prüft am Ende die Testumgebung
statt der Logik.

**Der Selbstkonflikt-Fall ist nicht kosmetisch:** ohne `L.slug === slug`-Ausnahme würde ein
Neustart desselben Loadouts sich selbst blockieren, solange die alte Unit noch läuft.

### 3. `GpuBusyError` + Guard-Aufruf

`startUnit()` ruft `findGpuConflict` **vor** `execFileSync` und wirft bei Konflikt einen
`GpuBusyError` mit beiden Slugs. `server.mjs` fängt ihn und übersetzt in
`LoadoutStartError(409, 'gpu_busy', …)`.

Warum der Guard in `startUnit` sitzt und nicht im Aufrufer: heute gibt es genau einen Aufrufer.
Ein Guard dort schützt genau diesen einen — der nächste, den jemand in sechs Monaten
dazuschreibt, umgeht ihn lautlos. In `startUnit` ist er nicht umgehbar, und die HTTP-Semantik
bleibt trotzdem korrekt, weil `server.mjs` den spezifischen Typ fängt.

## Fehlerausgabe

```
FEHLER: gemma9-factory belegt die GPU (active/running).
  Beide zusammen brauchen mehr VRAM als die Karte hat.
  Zuerst stoppen:  task llm:stop LOADOUT=gemma9-factory
```

Nichts wird automatisch beendet: ein laufender Server könnte gerade eine Factory-Anfrage
bedienen, und ein abgerissener Request fällt erst am Timeout auf.

## Tests

Neue Datei `scripts/llm-proxy/runner.test.mjs` — bisher existieren nur `loadouts.test.mjs` und
`server.test.mjs`, für `runner.mjs` gibt es keine.

| Fall | Erwartung |
|---|---|
| anderes GPU-Loadout `active` | Konflikt, dessen Slug |
| nur CPU-Loadout `active` | `null` |
| nichts aktiv | `null` |
| **eigenes** Loadout `active` | `null` (kein Selbstkonflikt) |
| `startUnit` bei Konflikt | wirft `GpuBusyError`, `execFileSync` wird **nicht** erreicht |

Nach T002356-M1 trägt jeder Negativtest seinen Positiv-Anker im selben Test: erst prüfen, dass
der erlaubte Start durchläuft, dann die Negativ-Aussage. Sonst bestünde der Test vakuos, falls
`findGpuConflict` gar nicht existiert.

## Bewusst nicht gelöst

- **Nicht-systemd-Starts** (handgestarteter `llama-server`, Windows-`.ps1`) bleiben unsichtbar.
- **Kein Lock** zwischen Prüfung und `systemd-run`. Zwei exakt gleichzeitige Starts können
  durchrutschen; auf einem manuell bedienten Einzelplatz-Host wäre ein Lock mehr Maschinerie
  als Problem.
