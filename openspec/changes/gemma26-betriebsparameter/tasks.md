---
title: "gemma26-betriebsparameter — Implementation Plan"
ticket_id: T002579
domains: [infra, test, llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gemma26-betriebsparameter — Implementation Plan

_Ticket: T002579_

## File Structure

```
tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats   (neu, RED — bereits angelegt)
tests/spec/local-llm-proxy/helpers/llm-endpoint.bash      (neu — Endpunkt-Pruefung)
tests/spec/local-llm-proxy/gemma-kv-quant.bats            (geaendert — Port, Guard, Anker, Vorbehalt)
scripts/llm-proxy/runner.mjs                              (geaendert — chatTemplateKwargs + Sampling)
scripts/llm-proxy/runner.test.mjs                         (geaendert — Tests fuer argv-Bau)
scripts/llm/loadouts.json                                 (geaendert — Sampling, Thinking, notes)
scripts/mishap-categorize.sh                              (geaendert — enable_thinking:false)
scripts/plan-qa-check.sh                                  (geaendert — enable_thinking:false)
scripts/factory/ci-review.mjs                             (geaendert — enable_thinking:false)
```

**S1-Budgets** (alle Dateien `nicht-baselined`, wirksame Schwelle = statisches Limit aus
`gates.yaml`):

| Datei | Ist | Schwelle | Budget |
|---|---|---|---|
| `scripts/llm-proxy/runner.mjs` | 247 | 800 (.mjs) | 553 |
| `scripts/plan-qa-check.sh` | 192 | 800 (.sh) | 608 |
| `scripts/mishap-categorize.sh` | 156 | 800 (.sh) | 644 |
| `scripts/factory/ci-review.mjs` | 152 | 800 (.mjs) | 648 |
| `tests/.../helpers/llm-endpoint.bash` | 0 (neu) | 500 (.bash) | 500 |

Kein Split noetig — die groesste Datei liegt bei 31 % ihrer Schwelle. `loadouts.json` und
`*.bats` tragen kein S1-Limit (Extension nicht in `gates.yaml` → `s1.limits`).

## Kontext: was bereits belegt ist

Diese Punkte sind gemessen, nicht angenommen — der Implementer muss sie nicht erneut erheben:

- **Port 8081 ist tot.** `ss -ltn` zeigt nur `:18235` (llm-proxy). `loadouts.json` deklariert
  fuer `gemma26-factory` Port **8091**. 8081 war der am 2026-07-27 decommissionierte
  TEI-Embed-Port.
- **q4_0-KV besteht im Langkontext.** Messung vom 2026-08-02 gegen den laufenden Server:
  **39388 Prompt-Tokens, 5 Laeufe, je 6/6 zeichengenau = 30/30**. Messskript:
  `tmp/claude-scratch/kv-longctx/measure.sh` (nicht versioniert).
- **Vorbehalt bleibt bestehen, in praeziserer Form:** der Fuellkontext war ein wiederholter
  Satz und damit hochredundant; echte Factory-Prompts (Code, Diffs, Logs) belasten den
  KV-Cache staerker. Der Vorbehalt wird deshalb **umformuliert, nicht geloescht**.
- **`runner.mjs` kennt `--chat-template-kwargs` nicht.** `grep -n 'enable_thinking'
  scripts/llm-proxy/*.mjs` liefert keinen Treffer. Das ist Neuentwicklung.
- **Drei Consumer sind ungeschuetzt:** `mishap-categorize.sh` (`max_tokens: 20`),
  `plan-qa-check.sh` (2048), `factory/ci-review.mjs` (4096). Bereits geschuetzt sind
  `triage-body.sh`, `brain-ingest-transform.sh`, `scout-llm-fallback.sh`.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats`
      ist angelegt und schlaegt auf diesem Branch mit 3/3 fehl. Gruende: Port 8091 fehlt in
      der Probe, `prompt_tokens` wird nicht geprueft, `helpers/llm-endpoint.bash` existiert
      nicht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats
# expected: FAIL (3 not ok) vor der Umsetzung, 3/3 ok danach
```

## P1 — Endpunkt-Pruefung als Hilfsfunktion (behebt T002574)

Ziel: eine Stelle, die entscheidet, ob ein LLM-Endpunkt benutzbar ist — mit HTTP-Status statt
blossem curl-Exit.

- [ ] `tests/spec/local-llm-proxy/helpers/llm-endpoint.bash` anlegen mit
      `llm_endpoint_healthy <url>`: Rueckgabe 0 nur bei HTTP 2xx, sonst != 0.
      Umsetzung ueber `curl -s -o /dev/null -w '%{http_code}'` plus Auswertung des Codes —
      **nicht** ueber den curl-Exit allein, denn `curl -s` liefert auch bei HTTP 500 Exit 0
      (genau der Defekt aus T002574). Zusaetzlich `--max-time` setzen, damit ein haengender
      Server den Testlauf nicht blockiert.
- [ ] Datei mit Header-Kommentar versehen, der den Prueffall benennt (HTTP 500 darf nicht
      als gesund gelten) und T002574 referenziert.

Verifikation dieses Schritts:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats
# Test 3 muss gruen werden; 1 und 2 bleiben rot bis P2
```

## P2 — Langkontext-Probe reparieren

Datei: `tests/spec/local-llm-proxy/gemma-kv-quant.bats`

- [ ] `LLM_URL`-Default von `http://localhost:8081/...` auf den Port umstellen, den
      `loadouts.json` fuer `gemma26-factory` deklariert (**8091**). Im Kommentar festhalten,
      dass 8081 der tote TEI-Port war und der Test dadurch nie lief.
- [ ] Skip-Guard auf `llm_endpoint_healthy` aus P1 umstellen (`source` des Helpers).
- [ ] **Positiv-Anker einbauen:** die Antwort des Servers auf `usage.prompt_tokens` pruefen
      und den Test scheitern lassen, wenn der Wert unter 20000 liegt. Begruendung im
      Kommentar: am 2026-08-02 lieferte derselbe Aufbau zweimal ein falsches Positiv —
      19788 Tokens (Fuellertext zu kurz) und 0 Tokens (`jq` scheiterte an `ARG_MAX`).
- [ ] Prompt und Payload ueber **Dateien** statt Argumente an `jq`/`curl` uebergeben
      (`jq --rawfile`, `curl -d @datei`) — bei ~160k Zeichen sprengt die Argumentliste
      `ARG_MAX`.
- [ ] Fuellkontext auf ~2800 Wiederholungen anheben (1400 ergaben nur 19788 Tokens; ein
      wiederholter Satz tokenisiert mit ~14 Tokens je Wiederholung).
- [ ] Evidenz-Vorbehalt in den Kommentarzeilen ~90–96 **umformulieren**: das Ergebnis
      (30/30 bei 39388 Tokens) eintragen und als verbleibende Einschraenkung nennen, dass
      der Fuellkontext redundant war und heterogene Prompts staerker belasten. Der Verweis
      „erster Verdaechtiger bei Tool-Call-Fehlern" bleibt.

## P3 — Runner: `--chat-template-kwargs` und Sampling unterstuetzen

Dateien: `scripts/llm-proxy/runner.mjs`, `scripts/llm-proxy/runner.test.mjs`

- [ ] In der argv-bauenden Funktion zwei neue Loadout-Felder auswerten:
      - `args.chatTemplateKwargs` (Objekt) → `--chat-template-kwargs '<json>'`
      - `args.temperature`, `args.topP`, `args.topK` → `--temp`, `--top-p`, `--top-k`
      Fehlende Felder erzeugen **kein** Argument (Rueckwaertskompatibilitaet: die anderen
      Loadouts duerfen sich nicht veraendern).
- [ ] `chatTemplateKwargs` als JSON serialisieren, nicht als String durchreichen — der Wert
      stammt aus der Konfiguration und darf nicht von Hand escaped werden.
- [ ] **Nicht** in das bestehende `args.reasoning` integrieren: das mappt auf llama.cpps
      `-rea` und steuert das Parsen von `reasoning_content`, waehrend `enable_thinking` ein
      Chat-Template-Argument ist. Zwei Ebenen, zwei Felder — im Code kommentieren.
- [ ] Tests in `runner.test.mjs`: argv enthaelt die neuen Flags bei gesetzten Feldern und
      enthaelt sie **nicht** bei fehlenden Feldern (Positiv-Anker: ein Loadout ohne die
      Felder erzeugt eine unveraenderte argv).

## P4 — Loadout `gemma26-factory` konfigurieren

Datei: `scripts/llm/loadouts.json`

- [ ] `args.temperature = 1.0`, `args.topP = 0.95`, `args.topK = 64` setzen — die von
      Google/Unsloth fuer Gemma 4 kalibrierten Werte. Bisher wurde nichts gesetzt, es galten
      die llama.cpp-Defaults (temp 0.8, top-k 40).
- [ ] `args.chatTemplateKwargs = { "enable_thinking": true }` setzen.
- [ ] `notes` ergaenzen (ASCII-only, wie die uebrigen notes): die drei Werte samt Herkunft,
      das Messergebnis der Langkontext-Probe (39388 Tokens, 30/30) und der verbleibende
      Vorbehalt zum redundanten Fuellkontext. Ausserdem der Hinweis, dass Thinking
      serverseitig der **Default** ist und Consumer mit knappem `max_tokens` clientseitig
      abschalten muessen (Verweis auf T002501).
- [ ] Nur `gemma26-factory` anfassen — die 12B-Loadouts bleiben unveraendert.

## P5 — Consumer gegen den Thinking-Default absichern

> **Scope-Korrektur waehrend der Umsetzung (2026-08-02).** Der Plan nannte hier
> `scripts/mishap-categorize.sh`, `scripts/plan-qa-check.sh` und
> `scripts/factory/ci-review.mjs`. Die Auswahl beruhte auf einer Suche nach `max_tokens`
> **ohne Pruefung des Endpunkts** — und war damit falsch: alle drei rufen
> `api.deepseek.com` auf, nicht den lokalen Proxy. Sie sind vom Thinking-Default auf
> `gemma26-factory` gar nicht betroffen und werden **nicht** angefasst.
>
> Auch die zweite Fassung dieser Liste war noch zu gross. Vollstaendige Erhebung ueber alle
> Dateien, die `:18235`/`LLM_PROXY`/`HG_LLM_URL` ansprechen — **einschliesslich der
> Payload-Bauer**, die eine aufrufende `.sh` nicht selbst enthaelt:
>
> | Consumer | sendet Chat-Request | geschuetzt |
> |---|---|---|
> | `scripts/health-goals-llm-fill.sh` | ja | **ja** — in `scripts/health-goals-payload.py` |
> | `scripts/arbitration/synthesize.mjs` | ja | **nein** |
> | `routing-check.sh`, `github-mcp-wrapper.sh`, `route-provider.sh`, `health-goals-check.sh`, `llm-proxy/backends.mjs`, `llm-proxy/server.mjs` | nein (Status/Routing) | nicht betroffen |
>
> Es bleibt **eine** Datei. Der Rest wird nicht angefasst.

Datei: `scripts/arbitration/synthesize.mjs`

- [ ] `chat_template_kwargs: {"enable_thinking": false}` in den Request ergaenzen, analog zu
      `scripts/health-goals-payload.py` und `scripts/factory/triage-body.sh`.
- [ ] Kommentar setzen, warum: der Aufrufer verlangt `response_format: json_object` und liest
      `choices[0].message.content` — bei aktivem Thinking bleibt der leer, bis die Denkphase
      endet, und das JSON-Parsing scheitert (T002501).
- [ ] **Keine Timeouts oder Budgets anheben.** Thinking fuer diesen Consumer nutzbar zu machen
      waere eine eigene Abwaegung (Latenz, GPU-Zeit) und gehoert in ein Folge-Ticket, nicht
      als Nebenwirkung in diesen Fix.

## P6 — T002535 korrigieren

- [ ] T002535 traegt `status=done`, obwohl die Messung nie stattfand (der Test zeigte auf
      den toten Port). Nach dem Merge dieses Fixes das Messergebnis als Kommentar an T002535
      haengen (`scripts/ticket.sh add-comment`) und den Status entsprechend fuehren.
- [ ] T002574 (Skip-Guard/HTTP 500) ist mit P1 sachlich erledigt — im PR-Text referenzieren,
      damit der Zusammenhang nachvollziehbar bleibt.

## P7 — Verifikation

- [ ] Alle BATS-Guards der Spec und die Node-Tests laufen lassen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/ tests/spec/llm-pipeline.bats
node --test scripts/llm-proxy/loadouts.test.mjs scripts/llm-proxy/runner.test.mjs
```

- [ ] Gegen den **laufenden** Server verifizieren, dass die Konfiguration ankommt (der
      Server muss dafuer mit der neuen Konfiguration neu gestartet werden):

```bash
curl -sS -XPOST http://127.0.0.1:18235/admin/loadouts/gemma26-factory/stop
curl -sS -XPOST http://127.0.0.1:18235/admin/loadouts/gemma26-factory/start
curl -sf http://127.0.0.1:8091/props | head -c 400
```

- [ ] Abschluss-Verifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
