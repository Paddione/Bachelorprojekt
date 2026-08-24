---
title: "mishap-incident-rollup-2026-08-22-T013894 — Implementation Plan"
ticket_id: T013894
domains: [factory]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013894 — Implementation Plan

_Container-Ticket: T013894_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 19:48 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
scripts/llm-proxy/switch-origin.mjs                       (neu) Attributions-Label fuer [switch]-Zeilen
scripts/llm-proxy/server.mjs                              ensureLoadoutForModel reicht origin durch; 5 [switch]-Zeilen
tests/spec/local-llm-proxy/switch-origin-attribution.bats (neu) RED-Test des Moduls
openspec/changes/mishap-incident-rollup-2026-08-22-T013328/tasks.md  Eintrag 5 dispositioniert (Quelle der Rotation)
```

## Zyklus-Konsolidierung

Dieser Container ist der vierte in Folge, der denselben einzigen Eintrag traegt: er wurde aus
`T013328` nach `T013784`, `T013893` und hierher weitergereicht, weil er dort nie eine Disposition
bekam (`T013328` #5 stand auf **OFFEN** mit Verweis auf das dispatchte Ticket T013540 — dieses stand
unbearbeitet im backlog und wird mit diesem Zyklus geschlossen). Der Carry-over-Scan
(`scripts/factory/rollup-carryover.sh --scan`) liest ausschliesslich Plaene aus dem
Repository-HEAD; die Plaene von T013784 und T013893 lagen nur branch-lokal vor und waren damit nie
Quelle, sondern selbst nur Kopien. Mit der Disposition in `T013328` und hier faellt die Quelle weg:
der Scan liefert Exit 3 (keine Kandidaten), und der naechste Generatorlauf legt keinen weiteren
Container an. Die Branches `chore/mishap-incident-rollup-2026-08-22-T013784` und `…-T013893`
werden ohne Merge entfernt — ihr Inhalt ist in diesem Zyklus vollstaendig enthalten.

## Mishap-Batches

> ### Mishap-Rollup — 1 Eintraege (Carry-over aus mishap-incident-rollup-2026-08-22-T013328)
> 
> Uebertrag aus dem abgeschlossenen Zyklus `mishap-incident-rollup-2026-08-22-T013328`: diese Eintraege blieben dort ohne
> Disposition. Sie werden hier weitergefuehrt, damit sie mit dem Container nicht
> stillschweigend verfallen.
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | llm-proxy/request-log | llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse) |
> 
> **1. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)** (suspicious, llm-proxy/request-log)
> 
> Unerledigt aus `mishap-incident-rollup-2026-08-22-T013328` uebernommen. Die urspruengliche Beschreibung steht im
> Batch-Kommentar jenes Zyklus und im dortigen Plan.

## Aufgaben — ein Eintrag, eine Entscheidung

So wird dieser Container abgearbeitet: **jeder Eintrag unten bekommt eine Disposition**, und
zwar genau eine der vier folgenden. Erst dann wird seine Box abgehakt.

| Disposition | Wann | Was sie verlangt |
|---|---|---|
| **gefixt** | der Eintrag beschreibt ein Problem, das in diesem Zyklus behoben wird | Code- oder Konfigaenderung **plus** ein Test, der das Fehlverhalten vorher reproduziert |
| **bereits gefixt** | das Problem ist zwischenzeitlich anderswo behoben worden | den Beleg nennen (PR-Nummer oder Commit) und gegenpruefen, dass er auf `main` liegt |
| **kein Repo-Fix** | transientes Laufzeitereignis, Bedienfehler, oder bewusst so gewollt — und NICHT wiederholungsanfaellig | begruenden, warum keine Repo-Aenderung folgt UND warum kein Ablaufdatum noetig ist |
| **beobachten (bis Zyklus <JJJJ-MM-TT>)** | transient, aber wiederholungsanfaellig — der Workaround soll proaktiv im Blick bleiben | ein Ablaufdatum: der Generator fuehrt den Eintrag bis dahin in jedem Zyklus fort, danach wird er in ein eigenes Ticket eskaliert |

Ein Eintrag darf offen bleiben, wenn er den Rahmen dieses Zyklus sprengt — dann bleibt seine
Box leer und der Grund steht dahinter. Was nicht zulaessig ist: eine Box abhaken, ohne die
Disposition hinzuschreiben. Die Dispositionen zusammen sind der Nachweis, dass der Container
abgearbeitet wurde und nicht nur geschlossen.

- [x] **1. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)** (suspicious, llm-proxy/request-log) **×4** (Rezurrenz: T013328,T013784,T013893,T013894) — Disposition: **gefixt** — Der Eintrag nennt zwei Fix-Richtungen. Die erste ("Flush-Fehler zumindest mit Warn-Zeile ins Journal") liegt seit T003277 (af949ec91, 2026-08-11 — also vor dem Vorfall) im Code: `flush()` in scripts/llm-proxy/request-log.mjs schreibt `[request-log] N Mitschnitt(e) verworfen: …`, und `shutdown()` in server.mjs leert den Puffer bei SIGTERM/SIGINT. Der beobachtete Verlust vom 22.08. 14:40:44 ist damit kein stiller Schreibfehler, sondern liegt im 5-Sekunden-Puffer eines Prozesses, der den Loadout-Swap nicht ueberlebt hat — nicht reproduzierbar und ohne Signal nicht nachtraeglich belegbar. Umgesetzt ist deshalb die zweite Richtung, die den Blind Spot strukturell schliesst: scripts/llm-proxy/switch-origin.mjs baut aus requested_model, Client-Header und Dispatch-Ticket ein Attributions-Label, das jede der fuenf [switch]-Zeilen in server.mjs mitfuehrt. Wer einen Loadout-Wechsel ausgeloest hat, steht damit im Journal selbst und haengt nicht mehr am Request-Mitschnitt — dem Weg, der bei Incident T013527 ausfiel und die Client-Zuordnung nur indirekt zuliess.

- [x] **Failing-Test-Step (RED).** Eintrag 1 bekam **gefixt**: `tests/spec/local-llm-proxy/switch-origin-attribution.bats`
      war vor dem Fix 5/5 rot (das Modul existierte nicht) und ist danach 5/5 gruen.
      Urspruenglicher Text: Fuer jeden Eintrag, der die Disposition **gefixt** bekommt,
      zuerst einen Test schreiben, der das beschriebene Fehlverhalten reproduziert. Er gehoert
      nach `tests/spec/<spec-slug>/<kurz-slug>.bats` — das Verzeichnis der Spec, die das
      Verhalten abdeckt. Eintraege mit den beiden anderen Dispositionen brauchen keinen Test.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
