# Harness-Vergleich pi vs. opencode auf dem Quasar-Worker (:8123)

Stand: 2026-10-14, **vorbereitet, noch nicht gemessen**. Der Lauf braucht den
GPU-Host (PK-Desktop); die Cloud-Sitzung, die das angelegt hat, erreicht
`:8123` nicht.

## Frage

Welcher Harness soll Partials auf dem Quasar-Worker ausfuehren? Bekannt ist:
eine volle opencode-Sitzung im Repo sprengt schon beim Start das Fenster
(`docs/runbooks/plan-runner.md`). Kandidat ist **pi**
(`@earendil-works/pi-coding-agent` 1.2.0, Node >= 22.19; Nachfolger des
deprecateten `@mariozechner/pi-coding-agent`) als minimaler Harness. omp (oh-my-pi,
`scripts/omp-run.sh`, T900793) ist der ausgebaute Fork und laeuft nur als
Gegenprobe mit — der erste Lauf (unten) zeigt, dass omp schon auf L0 rund 17k
Token Startkontext mitbringt. Entscheidungsgrundlage:

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
| `pi-L0` | `pi --mode json --no-session --no-context-files --no-extensions --no-skills --no-prompt-templates --no-themes --no-approve --tools read,write,edit,bash --provider ctxproxy --model <id> "<task.md>"`, eigenes `PI_CODING_AGENT_DIR` mit genau dem Proxy als Provider, `PI_OFFLINE=1` |
| `pi-L1` | pi-L0 + `--append-system-prompt "$(cat .omp/context.md)"` |
| `pi-L2` | pi-L1 + `grep,find,ls` |
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
cd ~/Bachelorprojekt && git pull
npm install -g @earendil-works/pi-coding-agent@1.2.0   # pi, Node >= 22.19
command -v pi opencode jq node
pi --version; opencode --version
systemctl --user cat serve-worker-vllm | grep -n -- '--max-model-len'   # 40960 erwartet (seit 2026-10-15; die Laeufe unten liefen mit 65536)
curl -s http://127.0.0.1:8123/metrics | grep -E '^vllm:num_requests_(running|waiting)'   # beide 0
bash scripts/agent-lock.sh list
```

Fuer omp-Varianten zusaetzlich `task omp:install` (braucht Bun). Der Runner
bricht selbst ab, wenn `:8123` nicht antwortet, dort Anfragen laufen, ein
Harness fehlt oder das `--out`-Verzeichnis schon eine Messung enthaelt.

## Messbefehl

```bash
cd ~/Bachelorprojekt && git pull
bash scripts/llm/harness-ctx-compare.sh --ref HEAD \
  --variants pi-L0,pi-L1,pi-L2,opencode --reps 3 --timeout 900 \
  --out ~/harness-ctx-runs/$(date +%Y%m%dT%H%M)-pi
```

3 statt 2 Wiederholungen, weil omp-L0 im ersten Lauf zwischen 9 und ueber 60
Runden schwankte.

Ausgabe je Lauf eine Zeile, z. B.
`omp-L1-r1: start … tok, max … tok, … Anfragen (metrics …), Test gruen, Ergebnis success, exit 0, … s`.
Im `--out`-Verzeichnis: `results.jsonl` (eine Zeile je Lauf), `requests.jsonl`
(jede Anfrage), je Lauf `.out`, `.omp.jsonl`, `.diff`, `.test.txt`, `env.txt`.

## Entscheidungsregel (vor der Messung festgelegt)

- pi ersetzt opencode auf dem vLLM-Track, wenn eine pi-Stufe die Aufgabe in
  allen Wiederholungen loest (Test gruen, Test unveraendert, Ergebniszeile da)
  und ihr Spitzenkontext unter 64k bleibt.
- Loesen beide: der mit dem kleineren Startkontext, sofern der Unterschied
  ueber 2x liegt; sonst bleibt opencode (keine Umbaukosten im plan-runner).
- Loest keiner: weder Harness-Wechsel noch Eigenbau begruendet — erst klaeren,
  ob Quasar die Tool-Calls ueberhaupt sauber liefert (`tool_call_turns`,
  `.out`-Dateien).

## Erster Lauf: omp (2026-10-14, unvollstaendig)

Befehl (PK-Desktop, Ref `2f24f40389957dc099212ba87350ac52a2b0e818`, omp 18.8.3,
opencode v2.0.29, `max_model_len 65536`):

```bash
bash scripts/llm/harness-ctx-compare.sh --ref HEAD \
  --variants omp-L0,omp-L1,omp-L2,opencode --reps 2 --out ~/harness-ctx-runs/2026-10-14
jq -c '{label, seq, status, prompt_tokens, completion_tokens, finish_reason, tool_calls, tools, ms}' \
  ~/harness-ctx-runs/2026-10-14/requests.jsonl
```

Das `--out`-Verzeichnis war vorher schon benutzt: `requests.jsonl` enthielt 6
Zeilen eines abgebrochenen Aufrufs mit demselben Label `omp-L0-r1` (erkennbar an
`seq`, das danach wieder bei 1 beginnt). Die Zusammenfassung „15 Anfragen
(metrics 9)" ist deshalb falsch; der echte Lauf hatte 9. Der Runner lehnt ein
benutztes Verzeichnis inzwischen ab.

| Lauf | Anfragen | Start tok | Spitze tok | Befund |
|---|---|---|---|---|
| omp-L0-r1 | 9 | 16.898 | 20.094 | Test gruen, `success`, 30 s |
| omp-L1-r1 | 70 | 17.359 | 48.954 | ein `400` bei ~49k, danach Kompaktierung (43k), endet mit `stop`; Testergebnis nicht uebermittelt |
| omp-L0-r2 | > 60 (lief noch) | 16.896 | 47.723 | zwei `400`, Kompaktierung, danach erneutes Wachstum; eine Antwort mit 6.669 Token |

Was das traegt:

- omp schickt schon auf L0 ~16,9k Token Startkontext (System-Prompt + 4
  Tools); `.omp/context.md` kostet nur ~460 Token mehr. omp ist damit kein
  schlanker Harness.
- Gleiche Konfiguration, 9 gegen ueber 60 Runden: hohe Streuung, 2
  Wiederholungen tragen keinen Vergleich.
- Die `400` traten bei ~47–49k Prompt-Token auf, nicht bei 64k. Vermutung:
  Prompt + angefordertes `max_tokens` ueberschreiten 65.536. Nicht belegt —
  der Proxy protokolliert `max_tokens` und die Fehlermeldung erst seit dem
  Folge-Change.

## Ergebnisse pi

Ausstehend.

| Variante | Start tok (r1/r2/r3) | Max tok | Anfragen | Test | Ergebnis | Sekunden |
|---|---|---|---|---|---|---|
| pi-L0 | | | | | | |
| pi-L1 | | | | | | |
| pi-L2 | | | | | | |
| opencode | | | | | | |
