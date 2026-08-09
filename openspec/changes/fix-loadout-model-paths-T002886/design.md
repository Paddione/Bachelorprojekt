---
ticket_id: T002886
plan_ref: openspec/changes/fix-loadout-model-paths-T002886/tasks.md
status: active
date: 2026-08-09
---

# Design: Loadout-Registry gegen die Platte richten (T002886)

## Purpose

`scripts/llm/loadouts.json` beschreibt Loadouts, die es auf dieser Maschine nicht mehr gibt: sechs
von elf Eintraegen loesen ihre Modelldatei nicht auf, und `devstral-quality` laeuft mit einer
Marge, die es auf 8192 Kontext und ein Drittel des moeglichen Durchsatzes druckt. Dieser Change
richtet die Registry an dem aus, was tatsaechlich auf Platte liegt, setzt die Betriebspunkte auf
gemessene Werte statt uebernommener Vermutungen, und nimmt zwei Modelle auf, die vorher nicht
gefuehrt waren.

Der Anlass ist ein Fehler; der groessere Teil des Ergebnisses ist ein Fund. Beides gehoert in
denselben Change, weil beides dieselbe Datei anfasst und aus derselben Messreihe stammt.

## Messumgebung

Alle Zahlen dieses Dokuments: 2026-08-09, llama.cpp **b10241** (`a55e77223`, Unsloth-Build),
NVIDIA RTX 5070 Ti (16303 MiB, geteilt mit dem Windows-Desktop, der 0,6-1,4 GB belegte),
`-fa on -fitc 8192`, `temperature 0`, 256 Ausgabe-Tokens, `n_ctx_slot` aus dem Serverlog,
tok/s aus `timings.predicted_per_second`. **Jeder Punkt mindestens zweimal gemessen** — die
Registry dokumentiert einen Fall, in dem eine nicht reproduzierbare Erstmessung 22 Prozent zu
hoch lag, und dieselbe Streuung war auch hier zu sehen.

Kontextwerte sind ueber Messreihen hinweg vergleichbar (sie fallen deterministisch aus der
VRAM-Rechnung). **tok/s sind es nicht** — sie haengen an der Tageslast des Windows-Desktops und
am Prompt. Vergleiche zwischen zwei Modellen wurden deshalb ausschliesslich mit demselben Skript
in derselben Sitzung gefahren, nie gegen Zahlen aus fremden Notizen.

## Symptom und Ursache

**Symptom** (Existenz-Audit ueber beide `modelRoots`):

| Loadout | Eingetragen | Realitaet |
|---|---|---|
| `gptoss-context`, `brain-ingest` | `gptoss20/gpt-oss-20b-Q8_0.gguf` | existiert nicht |
| `gemma26-factory` | `gemma4/…UD-IQ4_XS.gguf` | falsches Verzeichnis (`gemma4-26A4-it/`) |
| `gemma26-factory` `args.mmprojPath` | `gemma4/mmproj-F16.gguf` | existiert nicht — und die eigene `notes`-Zeile sagt bereits „Kein mmproj" |
| `gemma4-base`, `gemma4-tuned`, `gemma4` | Gemma-4-12B | auf keinem `modelRoot` |

**Ursache, belegt statt vermutet:** Modelldateien werden neu quantisiert oder verschoben, ohne die
Registry nachzuziehen. Die `notes` dokumentieren denselben Vorgang bereits **zweimal woertlich**
(„die zuvor hier eingetragene … EXISTIERT NICHT auf Platte — das Loadout war damit nicht
startbar", bei `gemma26-factory` und `qwen3-coder-30b`). Der Fehler ist wiederkehrend, nicht
einmalig.

**Der Guard existierte bereits und war rot.** `tests/spec/local-llm-proxy/loadout-model-files-exist.bats`
(T002753) faellt heute an Zeile 54. Die Luecke war also nicht ein fehlender Guard, sondern dass
sein Rot niemanden erreichte. Zwei Folgerungen:

1. Er scheitert am **Positiv-Anker** (`gptoss-context OK`), nicht an der MISSING-Assertion — und
   bricht damit ab, *bevor* er die vollstaendige Fehlerliste ausgibt. Der rote Lauf sagt heute
   „gptoss-context OK failed", nicht „sechs Loadouts fehlen". Die Diagnosezeile wird nie erreicht.
2. Er prueft **nur `l.model`**, nicht `args.mmprojPath` und nicht `speculative.draftModelPath`.
   Der fehlende mmproj in `gemma26-factory` ist deshalb an ihm vorbeigelaufen. Das ist die Luecke,
   die der neue Test in diesem Change schliesst.

## Der MTP-Fund

Der groesste Einzelbefund stammt nicht aus dem Audit, sondern aus der Modellkarte:
`llama-server --spec-type` hat **Default `none`**. Spekulatives Dekodieren war also aus,
unabhaengig davon, ob ein Draft-Head per `-md` geladen wurde. Ein geladener Head ohne
`--spec-type draft-mtp` kostet Speicher und tut nichts — genau dieser Zustand liess sich messen:

| Konfiguration (gemma-4-12B-it-qat) | tok/s Prosa | tok/s vorhersagbar |
|---|---|---|
| ohne `-md` | 92,0 / 91,4 | 92,0 |
| `-md` gesetzt, `--spec-type` unbesetzt (= `none`) | — | 92,4 / 92,7 |
| **`-md` + `--spec-type draft-mtp --spec-draft-n-max 4`** | **148 / 137** | **251 / 259** |

**+55 Prozent bei realistischer Prosa, +175 Prozent bei vorhersagbarem Text.** Die Spanne ist
kein Messfehler, sondern die Natur des Verfahrens: der Drafter gewinnt genau dort, wo die
Fortsetzung vorhersagbar ist. Fuer die Erwartungshaltung im Betrieb ist die **Prosa**-Zahl die
ehrliche.

### MTP am 26B bleibt tot — jetzt praeziser begruendet

Der Verdacht lag nahe, die bestehende Notiz („MTP crasht, Upstream #24795") sei die Fehldiagnose
einer Fehlbedienung, weil auch sie ohne `--spec-type` gemessen wurde. Sie ist es nicht. Mit
korrektem Flag geprueft, in **allen drei** Kombinationen:

| Gewicht | Head | Ergebnis |
|---|---|---|
| 26B-it UD-IQ4_XS | `gemma4-26A4-it/mtp-…` (462 MB) | Crash |
| 26B-it UD-IQ4_XS | `gemma4-26A4-qat/mtp-…` (252 MB) | Crash |
| 26B-qat UD-Q4_K_XL | `gemma4-26A4-qat/mtp-…` | Crash — **das ist die Kombination, die die Modellkarte nennt** |
| 12B-qat UD-Q4_K_XL | `gemma4-12qat/mtp-…` | laedt, +55 % |

Immer identisch: `vector::_M_range_check: __n (which is 1) >= this->size() (which is 1)`,
vorgelagert `Gemma4Assistant requires ctx_other to be set`.

**Die brauchbare Formulierung ist damit nicht „MTP ist kaputt", sondern: der MTP-Head der
MoE-Variante (26B-A4B) laedt nicht, der des dense 12B laedt.** Die Fehlermeldung passt dazu —
Zugriff auf Index 1 eines Vektors mit einem Element, also ein Loader, der mehr Layer-Eintraege
erwartet als ein MTP-Head hat.

Der Vermerk ist noetig, weil die **26B-QAT-Modellkarte MTP ausdruecklich bewirbt**
(`--spec-type draft-mtp --spec-draft-n-max 4`). Ohne die Notiz probiert es der Naechste wieder.

## Entscheidungen

### KV-Quantisierung: gemessen, nicht pauschal

Betreibervorgabe war „4-bit wo moeglich". Die Messung zeigt, dass „moeglich" nicht ueberall
„wirksam" heisst — der Hebel greift nur, wo der KV-Cache tatsaechlich die Grenze ist:

| Modell | q4_0 Kontext | q8_0 Kontext | Entscheidung |
|---|---:|---:|---|
| gemma26 (np=3, `-kvu`) | 166 912 | 101 888 | **q4_0** — +64 % |
| devstral (dense, np=1) | 60 416 | 33 536 | **q8_0** — Zweck des Loadouts |
| gpt-oss (np=1) | 131 072 | 131 072 | **q8_0** — Architekturdeckel |
| gpt-oss (np=4) | 32 768/Slot | 32 768/Slot | **q8_0** — dito |
| gemma 12B-qat | 262 144 | 262 144 | **q8_0** — Architekturdeckel |

Bei `gpt-oss` und dem `12B` deckelt `max_position_embeddings`, nicht der Cache: q8_0 erreicht
denselben Maximalkontext bei gleichem Durchsatz. 4-bit kauft dort **nichts** und kostet nur die
in T002501 dokumentierte Degradation (vertauschte Symbole, verwechselte Pfade, nicht wortgetreue
Tool-Call-Argumente). Bei `gemma26` dagegen ist der Gewinn real, dort bleibt die bestehende
Ausnahme.

`devstral` ist der Sonderfall: als einziges **dense** Modell (40 Layer) hat es den groessten
KV-Druck, q4_0 wuerde das Fenster verdreifachen. Es ist aber auch das Code-Loadout, und T002501
nennt als Ausfallmodus genau das, was Code-Arbeit braucht. Betreiberentscheid: q8_0 — verdoppelt
das Fenster gegenueber f16 und haelt den Zweck.

**Damit kommt keine neue `_KV_Q4_ALLOWED`-Ausnahme hinzu.**

### Die 12B-Loadouts werden entfernt, ihr Wissen bleibt hier

`gemma4-base` und `gemma4-tuned` (Eval-Paar T002634) koennen nicht aufloesen; das 12B Q4_K_M liegt
auf keinem `modelRoot`, und es wird bewusst nicht nachgeladen. Sie zu belassen hiesse, den Guard
dauerhaft rot zu halten — ein permanent rotes Gate wird binnen Wochen ignoriert und verliert seine
Wirkung fuer alle anderen Loadouts gleich mit. Eine Ausnahmeliste waere die zweite Option gewesen;
der KV-Guard warnt in seinem eigenen Kommentar davor, dass solche Listen zu Sammelstellen werden.

**Bewahrenswert aus ihren `notes`** (sonst mit dem Eintrag verloren):

- **Eval-Paar-Kontrakt (T002634):** `base` und `tuned` waren *bis auf die Modelldatei* zeichengleich
  konfiguriert. Jede Abweichung vermischt den Fine-Tuning-Effekt mit einem Konfigurationseffekt und
  macht die Messung wertlos. Wer den Gate wiederbelebt, muss diese Gleichheit wiederherstellen.
- **Q4_K_M statt der sonst bevorzugten UD-Q4_K_XL:** nicht aus Qualitaetsgruenden, sondern weil das
  Tuned-Repo nur Q4_K_M anbot — die bessere Basisquantisierung haette gegen den Tune gemessen.
- **Denken war aus (`enable_thinking=false`):** mit aktivem Reasoning lief der Fall `clar-01-de`
  („Plane ein Meeting." — absichtlich unterbestimmt, erwartet *keine* Aktion) auch bei 8192 Token
  in `finish_reason=length` mit leerem `content`. Kein Budget behebt eine nicht terminierende
  Schleife. Fair war das, weil es auf beiden Seiten galt.
- **Spekulatives Dekodieren bewusst aus:** das Tuned-Repo bringt einen MTP-Head mit, aber solange
  nicht gemessen ist, dass Draft-Verifikation unter greedy ausgabeneutral laeuft, gehoert er nicht
  in einen Vergleich. Geschwindigkeit ist nicht die Frage, die ein Base-vs-Tuned-Gate beantwortet.

### Was dieser Change nicht tut

- **Kein Vision-Loadout auf dem 26B.** Mit `mmproj-F16` vergibt `--fit` exakt die Untergrenze
  (8192 Kontext) bei 256 MiB Restspeicher — 13,6 GB Gewicht plus 1,19 GB Projektor passen auf
  dieser Karte nicht sinnvoll.
- **Kein 4-bit-MTP-Head.** Die Head-Praezision liegt nicht auf dem Fehlerpfad des 26B-Crashes.
- **Kein 12B-Download fuer das Eval-Paar.**
- **Keine Aenderung an `runner.mjs`.** Alle noetigen Felder existieren im Schema.

## Zielzustand der Registry

| Slug | Modell | KV | fitt | Belegter Betriebspunkt |
|---|---|---|---:|---|
| `gptoss-context` | `gptoss20/gpt-oss-20b-UD-Q4_K_XL.gguf` | q8_0 | 256 | 131 072 ctx (Architekturmax), 198-215 tok/s |
| `brain-ingest` | dieselbe Datei, `np=4` | q8_0 | 256 | 32 768/Slot, 201-210 tok/s |
| `gemma26-factory` | `gemma4-26A4-it/…UD-IQ4_XS.gguf`, `np=3`, `-kvu` | q4_0 | 64 | 166 912 ctx, 130-132 tok/s |
| `gemma4` | `gemma4-26A4-it/…UD-IQ4_XS.gguf`, `np=1` | q4_0 | 64 | 177 920 ctx, 126-128 tok/s |
| `gemma26-throughput` *(neu)* | `gemma4-26A4-qat/…UD-Q4_K_XL.gguf` | q4_0 | 64 | 118 016 ctx, 159-169 tok/s |
| `gemma12-vision` *(neu)* | `gemma4-12qat/…UD-Q4_K_XL.gguf` + mmproj + MTP | q8_0 | 256 | 262 144 ctx, 137-149 tok/s |
| `devstral-quality` | unveraendert | q8_0 | 64 | 33 536 ctx, 59 tok/s |
| `qwen3-coder-30b` | unveraendert | q4_0 | 64 | 96 000 ctx |
| `gemma4-base`, `gemma4-tuned` | **entfernt** | — | — | — |

`gemma26-factory` behaelt seinen gepatchten Chat-Template-Pfad und seine Tool-Liste unveraendert.

### Warum `gemma26-throughput` trotz weniger Kontext

Gegen `gemma4` auf denselben 26B-Parametern, identische Messbedingungen:

| | Kontext | tok/s |
|---|---:|---|
| IQ4_XS (`gemma4`) | 177 920 | 126,8 / 132,3 |
| QAT-Q4_K_XL (`gemma26-throughput`) | 118 016 | 158,7 / 168,6 |

Rund 30 Prozent mehr Durchsatz gegen 34 Prozent weniger Fenster. Ursache ist die Quant-Familie:
`Q4_K_XL` dequantisiert billiger als der I-Quant `IQ4_XS` — dasselbe Verhaeltnis, das die
`qwen3-coder`-Notiz mit umgekehrtem Vorzeichen beschreibt. Fuer kurze, latenzkritische Aufgaben
(Triage, Kategorisierung) sind 118k Fenster reichlich; dort gewinnt Durchsatz.

## Sampling: eine stillschweigende Luecke bei qwen

`qwen3-coder-30b` setzt **keine** Sampling-Parameter, es gelten also die llama.cpp-Defaults
(`temp 0.8`, `top-k 40`). Die Modellkarte nennt `temperature=0.7`, `top_p=0.8`, `top_k=20`,
`repetition_penalty=1.05`. Das ist exakt dieselbe Luecke, die T002579 fuer die Gemma-Loadouts
geschlossen hat — bei qwen ist sie offen geblieben. Sie wird hier mitgeschlossen; es ist kein
Entschluss gewesen, sondern ein Vergessen.

`gpt-oss` und `devstral` bringen in ihren Karten keine Empfehlung mit und bleiben bei den Defaults.

## Community-Befunde (HF-Diskussionen zum 12B-QAT)

Gepruefte Fremdberichte — aufgenommen, weil die Registry mit „HF-Diskussion #42" bereits einen
solchen Beleg fuehrt:

- **#5 (RTX 5070 Ti, dieselbe Karte):** MTP-Crash mit Flash Attention, danach KV-Positions-Mismatch.
  Bei uns **nicht reproduziert**. Sein Log zeigt `adding speculative implementation 'draft-simple'`
  — also den generischen Draft-Pfad, nicht MTP. Mit `--spec-type draft-mtp` tritt der Fehler nicht
  auf. Der Bericht beschreibt eine Fehlbedienung, keinen Kartendefekt.
- **#7 „Degenerate loops":** drei Nutzer, alle Gemma-4-QAT-Modelle, keine Loesung gefunden. Bei uns
  **0 von 12** Laeufen entartet (Sampling nach Modellkarte, Erkennung mit Positiv-Anker verifiziert:
  Zeichen-Loop, Wort-Loop und Negativfall schlagen korrekt an). Wahrscheinliche Ursache sind
  aeltere Chat-Template-Staende — #10 und #12 im selben Repo sind genau solche Updates, und unser
  Modell ist heute frisch geladen. **Das ist ein Vorbehalt, keine Entwarnung:** bei entarteten
  Ausgaben ist der Template-Stand der erste Verdaechtige.
- **Deprecation (aus dem Log in #3):** `Setting 'enable_thinking' via --chat-template-kwargs is
  deprecated. Use --reasoning on / --reasoning off instead.` Betrifft vier bestehende Loadouts.
  Wird hier **nicht** umgestellt — `chatTemplateKwargs` und `reasoning` steuern Verschiedenes
  (ob gedacht wird gegen Parsen von `reasoning_content`), und eine Umstellung ohne Messung waere
  genau die Art stiller Semantikaenderung, gegen die dieser Change antritt. Als eigener Vorgang
  zu fuehren.

## Verifikation

Der Change ist erfolgreich, wenn:

1. `tests/spec/local-llm-proxy/loadout-model-files-exist.bats` **gruen** ist (heute rot).
2. Der neue Guard fuer `mmprojPath`/`draftModelPath` gruen ist (mit dem Change rot eingefuehrt).
3. `tests/spec/local-llm-proxy/gemma-kv-quant.bats` gruen bleibt — es kommt keine q4_0-Wahl hinzu,
   die Ausnahmeliste bleibt unveraendert.
4. `tests/spec/local-llm-proxy/loadouts-format.bats` gruen bleibt.
5. Jedes geaenderte GPU-Loadout laesst sich ueber den Proxy starten und liefert einen
   `toolCallOk` — Output-Verifikation statt Konfigurationslektuere (T002448-M4).

## Risiken

- **`targetMarginMib: 64`** bei vier Loadouts: `--fit` dimensioniert **einmalig beim Start** aus dem
  dann freien VRAM. Waechst der Windows-Desktop spaeter, ist kein Puffer da und WDDM beginnt
  auszulagern. Das ist waehrend dieser Messreihe eingetreten und beobachtet worden: `qwen3-coder`
  kam nach einem Neustart mit 78 592 statt 96 000 Kontext hoch, weil die Karte noch nicht frei war.
  Ruecknahme ist je eine Zahl.
- **q4_0 bei `gemma26-factory` und `gemma4`:** die T002501-Degradation bleibt der erste Verdaechtige
  bei Fehlern in Tool-Call-Argumenten oder Pfaden. Hebel ist q8_0, Kosten sind rund 40 Prozent
  Kontext.
- **MTP haelt den GPU-Takt hoch** (Fremdbericht in #2, ungeprueft). Falls Leerlaufverbrauch stoert,
  ist `--spec-type none` der Schalter.
