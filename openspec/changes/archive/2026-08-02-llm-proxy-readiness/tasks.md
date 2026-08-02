---
title: "llm-proxy-readiness — Implementation Plan"
ticket_id: T002336
domains: [llm, observability]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-proxy-readiness — Implementation Plan

_Ticket: T002336_

Der llm-proxy meldet auf `/health` unbedingt 200 — er beantwortet damit "lebt
der Prozess", nicht "kann ich bedient werden". Dieser Plan macht `/health` zur
Readiness-Aussage und gibt der Liveness einen eigenen Endpunkt.

## File Structure

```
scripts/llm-proxy/discovery.mjs                 (geaendert: evaluateReadiness exportieren)
scripts/llm-proxy/server.mjs                    (geaendert: /health readiness, /livez neu)
scripts/llm-proxy/server.test.mjs               (RED-Tests liegen bereits vor)
tests/spec/local-llm-proxy.bats                 (RED-Wrapper liegt bereits vor)
scripts/llm-proxy/llm-proxy.service             (geaendert: Kommentar zum Restart-Verhalten)
Taskfile.yml                                    (geaendert: llm-proxy-Tests laufen lassen)
.github/workflows/ci.yml                        (geaendert: dieselben Tests in CI)
openspec/changes/llm-proxy-readiness/specs/local-llm-proxy.md            (Delta-Spec)
openspec/changes/factory-flash-bonsai-gang/tasks.d/p3-opencode-canon.md  (geaendert: /health-Aussage nachziehen)
```

## Kontext: warum die naheliegende Regel nicht reicht

Am 2026-07-27 fiel `llamacpp-gemma` (:8091) aus und blieb drei Stunden weg.
`/health` meldete durchgehend 200, jede Anfrage an `gemma-4-12b` lief in einen
Connect-Fehler.

Die naheliegende Regel waere "200, solange mindestens ein Backend gesund ist" —
so steht sie in `openspec/changes/unified-llm-gateway/tasks.d/p4-docs-surfaces.md`.
Diese Regel haette den Vorfall **nicht** erkannt. Stand der Registry
(`tickets.llm_proxy_backends`, abgefragt am 2026-07-27):

| name            | priority | enabled | Art          |
|-----------------|----------|---------|--------------|
| llamacpp-gemma  | 1        | true    | lokal, GPU   |
| deepseek        | 2        | true    | Cloud-API    |
| opencode-zen    | 91       | true    | lokal, Proxy |
| llamacpp-bonsai | 1        | false   | lokal, GPU   |
| lmstudio        | 2        | false   | lokal        |

Waehrend Gemma tot war, war `deepseek` erreichbar. "Mindestens eines gesund"
war also erfuellt, und der Proxy haette weiter 200 gemeldet.

Massgeblich sind deshalb die **enabled Backends mit `priority = 1`**: der lokale
Primaerpfad. Ein Cloud-Fallback ist kein Ersatz fuer den lokalen Stack — er ist
langsamer, kostet Geld und schickt Daten aus dem Haus, was dem
DSGVO-by-design-Anspruch der Plattform widerspricht. Faellt er selbst aus,
bleibt der Proxy bedienbar; das wird berichtet, aber nicht rot gemeldet.

Entscheidung mit dem Auftraggeber am 2026-07-27 getroffen; zwei Alternativen
wurden abgewogen und verworfen: "jedes enabled Backend gesund" waere bei jedem
DeepSeek-Netzhaenger rot geworden, "mindestens eines gesund" haette den Vorfall
verschlafen.

## Kontext: warum `/health` umgedeutet wird und nicht `/readyz` dazukommt

Ein additiver `/readyz` haette keine bestehende Zusage gebrochen, aber auch
nichts geaendert: der Aufrufer, der heute blind `/health` prueft, prueft morgen
wieder `/health` und sieht wieder 200. Genau dieser Aufrufer ist im Vorfall
getaeuscht worden. Die Wahrheit gehoert deshalb auf den Namen, den man ohne
Vorwissen waehlt.

Der Preis ist eine dokumentierte Gegenaussage, die mitgezogen werden muss:
`openspec/changes/factory-flash-bonsai-gang/tasks.d/p3-opencode-canon.md`
schreibt "`/health` reports only liveness and must not be used to size the
gang". Der Gang-Sizing-Hinweis auf `/admin/state` bleibt inhaltlich richtig
(Readiness sagt nichts ueber freie In-Flight-Kapazitaet) — nur die Begruendung
"`/health` ist liveness" stimmt danach nicht mehr.

Die SSOT-Spec `openspec/specs/local-llm-proxy.md` spezifiziert bisher **kein**
`/health`-Verhalten; sie fordert 503 mit `no_backend` nur fuer Routing-Anfragen.
Das neue Verhalten ist damit eine Ergaenzung, kein Widerspruch, und geht als
Delta-Spec gegen den Parent-Slug `local-llm-proxy`.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die beiden Tests liegen bereits in
      `scripts/llm-proxy/server.test.mjs` und sind rot (verifiziert am
      2026-07-27: 6 pass, 2 fail — die sechs bestehenden Tests bleiben gruen).
      Sie fordern `evaluateReadiness(getBackends)` aus `discovery.mjs`:
      totes Prio-1-Backend trotz lebendem Cloud-Fallback ergibt `ready:false`;
      ausgefallener Prio-2-Fallback bei gesundem Prio-1 ergibt `ready:true`, der
      Ausfall aber in `degraded[]` sichtbar.

      Dazu liegt in `tests/spec/local-llm-proxy.bats` ein BATS-Wrapper, der die
      node-Suite faehrt. Er ist nicht Zierde: die Suite lief bis hierher in
      keinem Target und keinem CI-Job (siehe Fix-Step 3), und ueber die
      spec-Reihe kommt sie in `task test:all`. Muster uebernommen von
      "FA-SF-40: node --test provision suite passes".

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
# expected: FAIL (rot, evaluateReadiness ist in discovery.mjs nicht exportiert)
```

- [ ] **Fix-Step 1 (GREEN): evaluateReadiness in discovery.mjs.**
      Neue exportierte, I/O-freie Funktion `evaluateReadiness(getBackends)`.
      Sie liest die vorhandene `health`-Map (dieselbe Quelle, aus der `getState`
      bereits `healthy` bezieht) und liefert
      `{ ready, degraded: [{name, priority, kind, baseUrl}], checked }`.

      `ready` ist genau dann `false`, wenn mindestens ein uebergebenes Backend
      mit `priority === 1` nicht gesund ist. `degraded` listet **alle**
      ungesunden Backends, unabhaengig von der Prioritaet: der Cloud-Ausfall
      soll sichtbar sein, auch wenn er nicht blockiert.

      Randfall festhalten und im Code kommentieren: liefert `getBackends()` gar
      kein Prio-1-Backend (alle disabled), ist `ready` **false**, nicht true.
      Ein Proxy ohne lokalen Primaerpfad ist nicht bereit, und ein leeres
      `.every()` waere sonst still `true` — genau die Art Vakuum-Wahrheit, die
      diesen Bug erst erzeugt hat.

- [ ] **Fix-Step 2 (GREEN): Endpunkte in server.mjs.**
      `/health` ruft `evaluateReadiness(getBackends)` und antwortet mit
      **200 bei `ready:true`**, **503 bei `ready:false`**. Der Body traegt in
      beiden Faellen `{status, ready, degraded, lastProbe}`, damit der Aufrufer
      sieht, WELCHES Backend fehlt, statt nur dass etwas fehlt.

      `/livez` kommt neu dazu und antwortet unbedingt `200 {status:'ok'}` — die
      alte `/health`-Semantik unter neuem Namen, fuer Aufrufer, die wirklich nur
      wissen wollen, ob der Prozess lebt.

      In `llm-proxy.service` einen Kommentar ergaenzen: `Restart=always`
      reagiert auf Prozessende, nicht auf HTTP-Status (geprueft, die Unit hat
      kein `WatchdogSec` und keinen Health-Check). Ein 503 wegen totem Backend
      loest also keinen Proxy-Neustart aus. Das ist beabsichtigt und gehoert
      dokumentiert, damit niemand spaeter einen Health-Watchdog ergaenzt, der
      bei Backend-Ausfall den falschen Prozess neu startet.

- [ ] **Fix-Step 3 (GREEN): die Tests ueberhaupt laufen lassen.**
      `scripts/llm-proxy/server.test.mjs` wird derzeit **nirgends** ausgefuehrt,
      weder in einem Taskfile-Target noch in `.github/workflows/ci.yml`
      (geprueft: nur `docs-gen`, `agent-guide`, `code-quality` und
      `build-learning-assets` sind eingebunden). Ohne diesen Schritt ist der
      RED-Test kein Regressionsschutz, sondern Dekoration.

      `node --test scripts/llm-proxy/*.test.mjs` in das passende
      Taskfile-Target aufnehmen (dem Muster der bestehenden `node --test`-Zeilen
      folgen) und in den CI-Job ergaenzen, der die uebrigen `node --test`-Suiten
      faehrt.

- [ ] **Fix-Step 4 (GREEN): Delta-Spec und die widersprechende Doku.**
      `openspec/changes/llm-proxy-readiness/specs/local-llm-proxy.md` bekommt
      die Requirements fuer beide Endpunkte in der ueblichen
      GIVEN/WHEN/THEN-Form: Prio-1-Backend ungesund ergibt `/health` 503; nur
      Prio-2-Backend ungesund ergibt `/health` 200 mit nicht-leerem `degraded`;
      `/livez` immer 200.

      Im selben Schritt
      `openspec/changes/factory-flash-bonsai-gang/tasks.d/p3-opencode-canon.md`
      nachziehen: der Verweis auf `/admin/state` fuers Gang-Sizing bleibt, die
      Begruendung wechselt von "`/health` reports only liveness" auf `/livez`.
      Eine stehengelassene Gegenaussage in der eigenen Doku ist die naechste
      Falle.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
