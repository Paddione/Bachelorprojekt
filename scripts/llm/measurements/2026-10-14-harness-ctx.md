# Harness-Vergleich omp vs. opencode auf dem Quasar-Worker (:8123) — Messplan

Stand: 2026-10-14, **vorbereitet, noch nicht gemessen**. Der Lauf braucht den
GPU-Host (PK-Desktop); die Cloud-Sitzung, die das angelegt hat, erreicht
`:8123` nicht.

## Frage

Welcher Harness soll Partials auf dem Quasar-Worker ausfuehren? Bekannt ist:
eine volle opencode-Sitzung im Repo sprengt schon beim Start das Fenster
(`docs/runbooks/plan-runner.md`). omp (oh-my-pi, `scripts/omp-run.sh`, T900793)
startet mit schmalem System-Prompt und regelt den Kontext ueber Stufen L0–L3.
Gemessen ist keins von beidem. Entscheidungsgrundlage:

1. **Startkontext** — `prompt_tokens` der ersten Anfrage je Harness.
2. **Spitzenkontext** — Maximum ueber den Lauf (passt es in 64k?).
3. **Erfolg** — loest der Harness mit Quasar dieselbe kleine Aufgabe, ohne den
   Test anzufassen, und meldet er `PLAN-RUNNER-RESULT`?
4. **Aufwand** — Anfragen, Prompt-Tokens gesamt, Wanduhr.

## Aufbau

| Teil | Datei |
|---|---|
| Aufgabe (identisch fuer alle Varianten) | `2026-10-14-harness-ctx/task.md` |
| Fixture: Stub + Test (4 Faelle, Referenzloesung geprueft) | `2026-10-14-harness-ctx/sandbox/slug.mjs`, `slug.test.mjs` |
| Kontext-Protokoll je Anfrage | `scripts/llm/ctx-proxy.mjs` (Proxy `:8124` → `:8123`) |
| Ablauf | `scripts/llm/harness-ctx-compare.sh` |

Varianten:

| Variante | Aufruf im frischen Worktree |
|---|---|
| `omp-L0` | `scripts/omp-run.sh task.md --level L0 --skip-tests` — nur Plan, read/write/edit/bash |
| `omp-L1` | L0 + `.omp/context.md` |
| `omp-L2` | L1 + grep/find/ls |
| `opencode` | `opencode run --agent plan-worker-vllm --model vllm-local/w4a4 "<task.md>"` — wie der plan-runner |

Jede Variante bekommt einen eigenen detachten Worktree von `--ref`, damit kein
Lauf den naechsten beeinflusst. Der Proxy erzwingt bei Streaming nur
`include_usage` und reicht sonst unveraendert durch. Gegenprobe: die
Differenz von `vllm:prompt_tokens_total` und `vllm:request_success_total` je
Lauf — weicht sie von der Proxy-Summe ab, lief Verkehr am Proxy vorbei.

**Bekannte Unsicherheit opencode:** Die Basis-URL von `vllm-local` steht in der
globalen opencode-Config. Der Lauf biegt sie per `OPENCODE_CONFIG_CONTENT` auf
den Proxy um. Greift das nicht, zeigt der Proxy 0 Anfragen bei
`metrics_requests > 0` — dann die globale Config fuer die Dauer der Messung
auf `http://127.0.0.1:8124/v1` stellen.

L3 (Skills) ist nicht in der Standardauswahl, weil fuer die Rolle `omp` erst
kuratierte Skills existieren muessen; per `--variants ...,omp-L3` zuschaltbar.

## Preflight

```bash
cd ~/Bachelorprojekt
git fetch origin claude/vigilant-hopper-y6hyht
command -v omp opencode jq node
omp --version; opencode --version
systemctl --user cat serve-worker-vllm | grep -n -- '--max-model-len'   # 65536 erwartet
curl -s http://127.0.0.1:8123/metrics | grep -E '^vllm:num_requests_(running|waiting)'   # beide 0
bash scripts/agent-lock.sh list
```

Fehlt `omp`: `task omp:install` (siehe `scripts/omp-run.sh`). Der Runner
bricht selbst ab, wenn `:8123` nicht antwortet oder dort Anfragen laufen.

## Messbefehl

```bash
cd ~/Bachelorprojekt
git fetch origin claude/vigilant-hopper-y6hyht
git show FETCH_HEAD:scripts/llm/harness-ctx-compare.sh > /tmp/harness-ctx-compare.sh
bash /tmp/harness-ctx-compare.sh --ref FETCH_HEAD \
  --variants omp-L0,omp-L1,omp-L2,opencode --reps 2 --timeout 900 \
  --out ~/harness-ctx-runs/2026-10-14
```

Ausgabe je Lauf eine Zeile, z. B.
`omp-L1-r1: start … tok, max … tok, … Anfragen (metrics …), Test gruen, Ergebnis success, exit 0, … s`.
Im `--out`-Verzeichnis: `results.jsonl` (eine Zeile je Lauf), `requests.jsonl`
(jede Anfrage), je Lauf `.out`, `.omp.jsonl`, `.diff`, `.test.txt`, `env.txt`.

## Entscheidungsregel (vor der Messung festgelegt)

- omp ersetzt opencode auf dem vLLM-Track, wenn eine omp-Stufe die Aufgabe in
  beiden Wiederholungen loest (Test gruen, Test unveraendert, Ergebniszeile da)
  und ihr Spitzenkontext unter 64k bleibt.
- Loesen beide: der mit dem kleineren Startkontext, sofern der Unterschied
  ueber 2x liegt; sonst bleibt opencode (keine Umbaukosten im plan-runner).
- Loest keiner: weder Harness-Wechsel noch Eigenbau begruendet — erst klaeren,
  ob Quasar die Tool-Calls ueberhaupt sauber liefert (`tool_call_turns`,
  `.out`-Dateien).

## Ergebnisse

Ausstehend.

| Variante | Start tok (r1/r2) | Max tok | Anfragen | Test | Ergebnis | Sekunden |
|---|---|---|---|---|---|---|
| omp-L0 | | | | | | |
| omp-L1 | | | | | | |
| omp-L2 | | | | | | |
| opencode | | | | | | |
