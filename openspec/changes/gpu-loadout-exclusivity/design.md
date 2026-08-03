---
title: GPU-Exklusivität auch beim expliziten Loadout-Start
ticket_id: T002616
domains: [bachelorprojekt-infra, bachelorprojekt-ops]
status: planning
---

# Design: Exklusivitätsprüfung im expliziten Startpfad

## Ausgangslage

Der Mechanismus ist vorhanden und wird **nicht** neu gebaut:

- `scripts/llm/loadouts.json` — `exclusiveGroup` auf jedem Loadout: `chat-gpu` für
  `gptoss-context`, `devstral-quality`, `gemma-factory`, `gemma-multiagent`,
  `gemma26-factory`, `gemma9-factory`; `bge-cpu` für `bge-embed-cpu` und `bge-rerank-cpu`.
- `scripts/llm-proxy/loadouts.mjs:202` — `planAutoStart({doc, model, activeSlugs})` liefert
  `{action:'conflict', conflictSlug, group}`.
- `scripts/llm-proxy/server.mjs:123` — `proxyV1` übersetzt das in HTTP 409
  `exclusive_conflict` mit Stop-Befehl im Klartext.

Die Lücke sitzt im zweiten Startweg. `startLoadout()` (`server.mjs:235`) prüft der Reihe nach:

```
not_found     404   Loadout unbekannt
already_running 409 unitStatus(slug).active === 'active'
port_busy     409   portInUse(doc, loadout.port, slug)
model_missing 422   GGUF in keiner modelRoot
```

`port_busy` fängt einen Gruppenkonflikt nur dann ab, wenn beide Loadouts denselben Port
belegen — das trifft auf die drei 8091er zu, nicht aber auf `gemma9-factory` (8092) gegen
`gemma26-factory` (8091). Dieser Fall startet heute durch.

## Schnitt

### 1. `findExclusiveConflict(doc, slug, activeSlugs) → {conflictSlug, group} | null`

Herausgelöst aus `planAutoStart`, in `loadouts.mjs`, exportiert. Reine Funktion; `activeSlugs`
wird übergeben, damit sie ohne systemd testbar bleibt — dasselbe Muster, das `planAutoStart`
schon nutzt.

`planAutoStart` ruft sie anschließend selbst auf, statt die Suche ein zweites Mal zu
formulieren. Zwei Kopien derselben Regel wären die eigentliche Gefahr: sie laufen auseinander,
und dann verhält sich der eine Startweg anders als der andere — genau der Zustand, den dieser
Change beseitigt.

Der eigene Slug ist ausgeschlossen. Ein bereits laufendes Loadout ist kein Konflikt mit sich
selbst; dafür greift weiterhin `already_running`.

### 2. Prüfung in `startLoadout()`

Direkt nach `port_busy`, vor `resolveModelPath`:

```js
const conflict = findExclusiveConflict(doc, slug, activeSlugs())
if (conflict) throw new LoadoutStartError(409, 'exclusive_conflict', …)
```

Fehlercode und Wortwahl bewusst identisch zum `/v1`-Pfad — ein Bediener, der beide Wege nutzt,
soll nicht zwei Vokabulare für dieselbe Lage lernen. Die Meldung nennt blockierenden Slug,
Gruppe und Stop-Befehl und hält fest, dass der Proxy nichts von selbst stoppt.

**Warum nicht in `startUnit()` (runner.mjs):** dort läge der Guard tiefer und wäre unumgehbar,
aber `runner.mjs` kennt weder das Loadout-Dokument noch `LoadoutStartError`; er müsste beides
importieren und die HTTP-Semantik nachbilden. Der bestehende Aufbau legt Vorbedingungen
durchgehend in `startLoadout` — `already_running` und `port_busy` sitzen genau dort. Der neue
Check gehört in dieselbe Reihe.

## Tests

`scripts/llm-proxy/loadouts.test.mjs` deckt `planAutoStart` bereits ab; die neuen Fälle kommen
in eine eigene Datei `scripts/llm-proxy/exclusive-conflict.test.mjs` (Konvention: eine Datei pro
Vorgang, keine Append-Konflikte).

| Fall | Erwartung |
|---|---|
| anderes Loadout derselben Gruppe aktiv | `{conflictSlug, group}` |
| Loadout anderer Gruppe aktiv (`bge-cpu` vs `chat-gpu`) | `null` |
| nichts aktiv | `null` |
| **eigener** Slug aktiv | `null` (kein Selbstkonflikt) |
| Loadout ohne `exclusiveGroup` | `null` |
| `planAutoStart` nach der Extraktion | unverändertes Verhalten (Regression) |

Der letzte Fall ist der wichtige: die Extraktion darf `planAutoStart` nicht verändern. Nach
T002356-M1 trägt jeder Negativfall seinen Positiv-Anker im selben Test.

## Bewusst nicht gelöst

Unverändert gegenüber dem bestehenden Mechanismus: nicht-systemd-Starts bleiben unsichtbar, und
zwischen Prüfung und `systemd-run` gibt es kein Lock.
