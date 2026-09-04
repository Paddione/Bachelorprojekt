# FreeToken vs. llama.cpp — Messbericht und Empfehlung (T900087)

**Stand:** 2026-09-04 · **Ticket:** T900087 · **Change:** `freetoken-backend-evaluation`

Dieser Bericht ist eine **Entscheidungsgrundlage, keine Migration**. Fällt die
Empfehlung am Ende für llama.cpp aus, folgt ein eigener Change mit eigenen
Spec-Deltas; dieser Change hängt kein Routing um, ändert kein Requirement und
fasst `scripts/llm/loadouts.json` nicht an.

**Der Bericht ist bewusst unvollständig.** Die Abschnitte 3 (Alias-Nutzung),
4 (Engine-Isolation) und 5 (Modellvergleich) tragen noch **keine** Messwerte:
die Läufe, die sie füllen, sind zum Redaktionsstand nicht ausgeführt. Jeder
offene Abschnitt nennt statt einer Zahl den **Befehl, der sie erzeugen wird**,
und die Vorbedingung, die dafür noch fehlt. Das ist der Mess-Konvention
(T002717) angemessen: eine Zahl ohne erzeugenden Befehl ist keine Messung, und
eine erfundene Zahl ist schlimmer als eine fehlende.

Reihenfolge der Abschnitte folgt der Reihenfolge der **Abbruchpunkte**, nicht der
Partial-Nummerierung — so ist sichtbar, an welcher Stelle der Bericht kürzer
ausfällt, weil ein Abbruchpunkt gegriffen hat.

---

## 1. Ausgangslage — die vier Bestandsmesswerte

Diese vier Zeilen sind der Ausgangspunkt, mit dem der Change begründet wurde
(übernommen aus `proposal.md`):

| Backend | Modell | Kontext | Decode |
|---|---|---|---|
| llama.cpp `gemma26-throughput` | Gemma 4 26B A4B QAT-Q4_K_XL (MoE, 4B aktiv) | 118.016 | 159–169 t/s |
| llama.cpp `gemma4` | Gemma 4 26B A4B UD-IQ4_XS (MoE, 4B aktiv) | 177.920 | 126–128 t/s |
| FreeToken `qwen-200k` | Qwen3.6-35B-A3B-NVFP4 (MoE, 3B aktiv, Offload) | 200.000 | 115 t/s |
| llama.cpp `qwen38-220k` | Qwen3.8-27B UD-IQ3_XXS (dicht/hybrid) | 131.072 | 30–43 t/s |

> **Diese vier Zeilen sind NICHT kommensurabel** — verschiedene Modelle, Quants,
> Kontexte, Build-Stände und Messtage. Ausgangslage, nicht Beleg.

Genau diese Inkommensurabilität ist der Anlass des Changes: der bisherige
Eindruck „FreeToken ist schneller" entstand aus einem Vergleich einer Offload-MoE
gegen ein **dichtes** Modell (`qwen38-220k`). Ob der Unterschied an der Engine
oder am Modell liegt, ist damit nicht entschieden — das isoliert Abschnitt 4.

### 1a. Zwei Faktenkorrekturen (verifiziert)

**`gemma26-throughput`: 14,25 GB, nicht 15,2 GB.**
`scripts/llm/loadouts.json:331` nennt in der Notiz „QAT-Q4_K_XL Quant (15,2 GB)".
Der Hugging-Face-Hub-Lookup gegen `unsloth/gemma-4-26B-A4B-it-qat-GGUF`, Datei
`gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf`, liefert **14.249.047.104 Bytes = 14,25 GB**
(Metadaten-Lookup, kein Download):

```
hf_fs: find hf://models/unsloth/gemma-4-26B-A4B-it-qat-GGUF --name "*UD-Q4_K_XL*"
# -> gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf, size=14249047104
```

`loadouts.json` bleibt unangetastet — die Datei ist bewusst kein `target_file`
dieses Changes (Konflikt mit `tests/spec/freetoken-local-backend/routing.bats`
und dem offenen Change `decommission-orphaned-loadouts-T014339`). Die korrigierte
Zahl steht hier und im Runbook, nicht dort.

**FreeToken-Modell: 19,5 GB lokal, nicht 23,5 GB.**
`docs/runbooks/freetoken-native.md:14` nannte „23,5 GB". Gemessen am 2026-09-04
auf dem GPU-Host:

```powershell
(Get-ChildItem -Recurse -File 'C:\Users\PatrickKorczewski\models\Qwen3.6-35B-A3B-NVFP4' |
  Measure-Object -Property Length -Sum).Sum / 1GB
# -> 19,47
```

Die 23,5 GB waren die HF-Repo-Größe, nicht die lokale Verzeichnisgröße nach
NTFS-Hardlink. Das Runbook trägt die korrigierte Zahl seit diesem Change.

**Commit-Stand beider Korrekturen:** `git rev-parse HEAD` im Worktree
`.worktrees/t900087-freetoken-eval`, Branch
`feature/freetoken-backend-evaluation-T900087`.

---

## 2. Kontextbedarf (P3) — Abbruchpunkt 1

Die Startskripte `start-gptoss-server.ps1` / `start-gemma-server.ps1` behaupten
unbelegt „31–37k Tokens pro Prompt". `scripts/llm/measure-factory-context.mjs`
misst offline, was die acht Eval-Fixtures unter `tests/factory-eval/fixtures/`
hergeben.

**Erzeugender Befehl und Commit-Stand:**

```bash
# Commit-Stand der Messung: 128a229e813ea50bd11932766afcbac8ea73315f
node scripts/llm/measure-factory-context.mjs --out /tmp/p3-context.json
jq -r '.aggregate, .meta.commit' /tmp/p3-context.json
```

**Ergebnis (2026-09-04):**

| Ticket | chars | ~Tokens (chars/4) |
|---|---:|---:|
| T000725 | 632 | 158 |
| T000726 | 791 | 198 |
| T000925 | 598 | 150 |
| T001894 | 358 | 90 |
| T001935 | 649 | 163 |
| T001940 | 712 | 178 |
| T001956 | 605 | 152 |
| T001977 | 511 | 128 |

**Aggregat: min 90 · median 155 · max 198 Tokens** über acht Fixtures.
Tokenisierung ist eine **deklarierte Näherung** `chars/4` mit Fehlerbalken ±30 %
(kein Tokenizer-Paket im Repo verdrahtet; das Skript weist die Methode in
`meta.tokenizer_method` selbst aus).

### Was diese Zahl trägt — und was nicht

**Sie ist eine Untergrenze eines einzelnen Bausteins, kein Vollbild.**
`scripts/factory/eval-context.cjs` baut **keinen** Dispatch-Prompt — es liest
`docs/factory-eval/latest.json` zurück. Der reale Dispatch-Kontext sind die
`contextHints` aus `scripts/factory/provision.js:buildContextHints()`
(Vorhaben-Pack, ticket spec, `touched_files`, target-code-Exzerpte), und deren
Auflösung passiert zur Laufzeit im Workflow-Orchestrator — nicht in einem festen
Skript, das man offline nachrechnen könnte. Die acht Fixtures liefern nur
Rohmaterial für den `ticket spec`-Hint; sie haben keine Attachments, kein
Vorhaben-Pack, keine Footguns, keine Code-Exzerpte.

**Abbruchpunkt 1 greift damit nicht — aber die Untergrenze entscheidet auch die
Gegenrichtung nicht.** Eine Untergrenze kann nur in *eine* Richtung schließen:
überstiege schon sie das Fenster eines residenten Loadouts, wäre die Sache klar.
Sie kann aber **nicht** belegen, dass der Bedarf klein *ist* — und genau das wäre
die Aussage, die eine Migration trägt. 198 Tokens sind drei Größenordnungen unter
dem 200k-Pool; daraus folgt nichts über den realen Prompt, weil die vier
weggelassenen Hint-Bausteine genau die großen sind.

**Offen und ausdrücklich nicht beantwortet:** ob die acht Eval-Fixtures für
Live-Prompts repräsentativ sind. Der Nachweis „die 200.000 Tokens werden nicht
gebraucht" kann **nur aus der Live-Telemetrie (Abschnitt 3)** kommen. P3 liefert
die sofort verfügbare Zahl und den Fehlerbalken; Abschnitt 3 liefert die Zahl,
auf der die Entscheidung ruht. Beide dürfen nicht zu einer verschmolzen werden.

---

## 3. Alias-Nutzung (P2) — NOCH NICHT GEMESSEN

**Stand: offen.** Die Telemetrie ist seit diesem Change implementiert, hat aber
noch keine Messperiode hinter sich.

`.opencode/plugin/freetoken-active.ts` schreibt seit T900087/P2 pro
Chat-Completion-Request eine JSONL-Zeile (`ts`, `alias`, `promptChars`) nach
`%LOCALAPPDATA%\FreeToken\logs\alias-telemetry.jsonl`. Grund für den Umweg über
das Plugin: seit T014028 zielt der `freetoken-local`-Provider direkt auf
`http://127.0.0.1:1919/v1` und umgeht damit den mitschneidenden Proxy (`:18235`),
der `tickets.llm_proxy_request_log` schreibt — diese Tabelle enthält keine
einzige FreeToken-Zeile und wird unter diesem Routing nie eine haben. Das Plugin
ist der einzige Punkt, der den echten Request-Body noch sieht.

**Befehle, die diesen Abschnitt füllen werden:**

```bash
# Verteilung der Aliase
jq -s 'group_by(.alias) | map({alias: .[0].alias, count: length}) | sort_by(-.count)' \
  "$LOCALAPPDATA/FreeToken/logs/alias-telemetry.jsonl"

# Prompt-Groesse je Alias (Faustwert: Zeichen / 4 ~ Tokens)
jq -s 'group_by(.alias) | map({alias: .[0].alias, count: length,
  avgPromptChars: (map(.promptChars) | add / length)})' \
  "$LOCALAPPDATA/FreeToken/logs/alias-telemetry.jsonl"

git rev-parse HEAD   # Commit-Stand der Auswertung mitnotieren
```

**Vorbedingung:** eine Messperiode realer opencode-Nutzung gegen das
FreeToken-Backend. Zum Redaktionsstand liegt keine vor — Port 1919 ist auf dem
Host tot, die RTX 5070 Ti bei 0 MiB Belegung.

**Was die Zahl entscheiden wird.** llama.cpp kann `enable_thinking` nur per
Serverneustart umschalten, FreeToken pro Request
(`chat_template_kwargs.enable_thinking`, gesetzt im Plugin-Wrapper). Ob der
Dynamic Thinking Pool ein K.-o.-Kriterium gegen llama.cpp ist, entscheidet die
**Mischung**, nicht die Existenz des Features:

- Bleibt ein Alias über die Messperiode klar dominant (z. B. > 90 % `active-fast`),
  trägt ein statisch konfiguriertes llama.cpp-Loadout denselben Betrieb ohne
  Nachteil.
- Wechseln beide Aliase im Betrieb regelmäßig ab, kostet jeder Wechsel unter
  llama.cpp einen Serverneustart — und der Pool wird zum K.-o.-Kriterium.

Der Bericht wird benennen, welcher der beiden Fälle in der Messperiode vorlag.
Keine Vorwegnahme ohne Datenbasis.

---

## 4. Engine-Isolation (P4) — NOCH NICHT GEMESSEN · Abbruchpunkt 2

**Stand: offen.** Das Messwerkzeug existiert seit diesem Change, der Lauf steht aus.

`scripts/llm/bench-engine-ab.sh` misst `gpt-oss-20b` auf FreeToken (`:1919`,
Profil `gptoss-65k`) gegen `llama-server` mit `gpt-oss-20b-MXFP4.gguf` (`:8097`) —
**identische Gewichte auf beiden Engines**, damit der Vergleich die Engine misst
und nicht das Modell.

**Befehl, der diesen Abschnitt füllen wird:**

```bash
bash scripts/llm/bench-engine-ab.sh --tag ab001
cat scripts/llm/measurements/raw/ab001-summary.log   # traegt Commit-Stand selbst
```

**Vorbedingung, die noch fehlt (gemessen 2026-09-04):** die gpt-oss-GGUF liegt
auf diesem Host nicht auf der Platte. Das Proposal führt für Stufe 1 an, beide
Artefakte lägen bereits vor („Download null") — für den llama.cpp-Arm trifft das
**nicht** zu:

```bash
ls /c/Users/PatrickKorczewski/.lmstudio/models/ggml-org/gpt-oss-20b-GGUF/ 2>&1                                   # Verzeichnis fehlt
find /c/Users/PatrickKorczewski/.cache/huggingface/hub/models--ggml-org--gpt-oss-20b-GGUF -name '*.gguf' | wc -l # 0
ls /c/Users/PatrickKorczewski/models/gpt-oss-20b/*.ftw | wc -l                                                   # 2 (FreeToken-Format)
```

Vorhanden sind nur die FreeToken-Gewichte. Die Annahme „Download null" ist damit
korrigiert: der llama.cpp-Arm braucht einen GGUF-Download, bevor Stufe 1 laufen kann.

**Abbruchpunkt 2, wenn der Lauf da ist:** verliert llama.cpp bereits bei
identischen Gewichten in Decode-tok/s gegen FreeToken, ist der Modellvergleich
(Abschnitt 5) hinfällig und die ~26 GB Download entfallen. Das wäre ein
**Ergebnis, kein Fehlschlag**, und wird hier als solches benannt — nicht als
ausgelassener Abschnitt.

**Darstellungsform, wenn die Zahlen kommen:** Einzelwerte tabellarisch mit
Streuung über mehrere Läufe, Vorbild `scripts/llm/measurements/2026-08-19-gemma12-slots.md`,
Abschnitt „Vollständige Abfolge" — keine geglättete Mittelwert-Behauptung ohne
Streuungsangabe. Prefill- und Decode-Zahlen der beiden Engines stehen
**nebeneinander, nicht subtrahiert**: llama.cpp liefert interne `timings`,
FreeToken eine end-to-end Wanduhr. Das sind verschiedene Messmethoden.

---

## 5. Modellvergleich (P4/P5) — NOCH NICHT GEMESSEN, bedingt

**Stand: offen und bedingt.** Dieser Abschnitt läuft **nur**, falls Abbruchpunkt 2
in Abschnitt 4 nicht griff.

Verglichen würden Gemma 4 26B A4B QAT-Q4_K_XL + MTP-Head gegen Qwen3.8-27B
GSQ-RCO IQ3_S-mtp gegen den FreeToken-Amtsinhaber — in zwei **unabhängigen**
Metriken, die nicht vermischt werden: Durchsatz (aus P4) und Schema-Treue (aus P5).

**Befehl, der diesen Abschnitt füllen wird:**

```bash
scripts/llm/bench-ifstruct.sh <port> <model-id> <label>
# z.B.: scripts/llm/bench-ifstruct.sh 8194 gpt-oss-20b llamacpp-gptoss
git rev-parse HEAD   # Commit-Stand der Messung
```

`bench-ifstruct.sh` misst gegen `LiquidAI/ifstruct-v1.0` (2.000 Prompts, binäre
Wertung, ohne constrained decoding) — reine JSON/YAML-Schema-Treue, der
Fehlermodus, an dem die Factory bei `tool_calls` tatsächlich scheitert.
**Einschränkung, die mitgelesen gehört:** gewertet wird nur die Struktur, nicht
inhaltliche Korrektheit. Eine Antwort kann inhaltliche Anweisungen ignorieren und
trotzdem bestehen; als alleiniges Qualitätsmaß taugt der Benchmark nicht.

**Vorbedingungen, die noch fehlen (2026-09-04):**

- Der Validator-Klon `Liquid4All/ifstruct` (`uv sync`) existiert auf diesem Host
  nicht — `bench-ifstruct.sh` bricht deshalb fail-loud mit Exit 1 ab, statt still
  weiterzulaufen. Belegt:
  ```bash
  bash scripts/llm/bench-ifstruct.sh 8194 gpt-oss-20b smoke-gptoss
  # -> IFSTRUCT_REPO=/c/Users/PatrickKorczewski/ifstruct ist kein uv-Projekt ...
  # -> exit 1
  ```
- Der 5-Zeilen-Smoke-Lauf (`SHARD_SIZE=5`) steht aus. Er bestätigt zwei
  unverifizierte Annahmen im Skript: dass `--api-key dummy-local` akzeptiert wird,
  und dass die `jq`-Pfade das reale `<shard>.result.json`-Schema treffen (die
  Ausdrücke nutzen deshalb `//`-Fallback-Ketten statt eines angenommenen Pfads).
- Der Volllauf kostet grob 4–6 h pro Kandidat; ~26 GB Modell-Downloads für Stufe 2
  sind noch nicht erfolgt.

---

## 6. Empfehlung — NOCH NICHT ABLEITBAR

**Die Empfehlung in einem Satz:** *noch keine* — die Zahl, auf der eine Empfehlung
ruhen müsste, existiert zum Redaktionsstand nicht.

**Welche Zahl sie tragen wird.** Nicht Abschnitt 2. Die dort gemessenen
90–198 Tokens sind eine Untergrenze eines einzelnen Kontextbausteins und können
die Aussage „der 200k-Pool wird nicht gebraucht" strukturell nicht tragen — sie
könnten nur das Gegenteil belegen, und das tun sie nicht. Tragen wird die
Empfehlung die Kombination aus (a) der Alias- und Prompt-Größen-Verteilung aus
Abschnitt 3, die den realen Kontextbedarf an der Quelle misst, und (b) der
Decode-Zahl aus Abschnitt 4, die Engine von Modell trennt.

**Welche Gegenevidenz bereits vorliegt.** Drei Beobachtungen sprechen gegen einen
schnellen Umstieg, unabhängig davon, wie die offenen Messungen ausfallen:

1. **Der Ausgangsvergleich war nie kommensurabel** (Abschnitt 1) — der Eindruck
   „FreeToken ist schneller" ruht auf einem Modell-, nicht einem Engine-Vergleich.
   Er könnte sich in Abschnitt 4 in beide Richtungen auflösen.
2. **Die Annahme „Download null" für Stufe 1 stimmt nicht** (Abschnitt 4) — der
   llama.cpp-Arm braucht die gpt-oss-GGUF erst noch. Der billigste Teil des
   Vergleichs ist teurer als geplant.
3. **Der Fork-Build für den Gemma-Arm fehlt auf der Platte.**
   `llama-bonsai-cuda13.3` existiert nicht (mehr); vorhanden ist nur
   `llama-b10090-13.3`. `--spec-type draft-mtp` gibt es im Upstream-Release
   nicht — ein Umbiegen von `-LlamaDir` wäre kein Fix, sondern ein stiller
   Semantikwechsel ohne MTP-Draft-Head, und genau dessen Optimum (n-max 4,
   210,9 t/s, Akzeptanz 0,763) ist die Grundlage der bestehenden Messwerte.

Migriert wird in diesem Change **nicht**. Fällt die Empfehlung später für
llama.cpp aus, folgt ein eigener Change mit eigenen Spec-Deltas.

---

## Anhang: Was dieser Change geliefert hat

| Partial | Artefakt | Status |
|---|---|---|
| P1 | `scripts/llm/start-gptoss-server.ps1`, `start-gemma-server.ps1` | UUID-gebundener VRAM-Check, lauffähig |
| P2 | `.opencode/plugin/freetoken-active.ts` | Alias-Telemetrie aktiv, Messperiode offen |
| P3 | `scripts/llm/measure-factory-context.mjs` | **gemessen**, Abschnitt 2 |
| P4 | `scripts/llm/bench-engine-ab.sh` | Werkzeug fertig, Lauf offen |
| P5 | `scripts/llm/bench-ifstruct.sh` | Werkzeug fertig, Lauf offen |
| P6 | dieser Bericht, `docs/runbooks/freetoken-native.md` | Ausgangslage + Korrekturen fertig |
| P7 | `tests/spec/llm-local-dev/alias-telemetry.bats` | Guard grün (rot vor P2) |
