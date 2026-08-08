# local-llm-loadout-cleanup

**Ticket:** T002753
**Ziel-Spec:** local-llm-proxy (primär), opencode-local-model-runner (sekundär)

## Purpose

Der lokale LLM-Satz ist zur Hälfte tot, und niemand merkt es. Von den Loadouts in
`scripts/llm/loadouts.json` zeigen drei auf Modelldateien, die auf diesem Host nicht
existieren — ein Start scheitert. `.opencode/agent-models.jsonc:5` hält die Folge schon
seit dem 2026-08-03 fest: die Provider-Blöcke `llamacpp-gemma26` und `llamacpp-gemma9`
wurden entfernt, weil „jeder Dispatch auf die Gemma-Agenten ins Leere lief". Die Loadouts
selbst blieben stehen. Es gibt keinen Guard, der das bemerkt.

Sichtbar wird der Zustand an den beiden Primäragenten: sie heißen `gemma26-primary` und
`gemma26-vision`, zeigen aber beide auf `gptoss-context`. Der Kommentar in der Datei sagt
es selbst — „Der Name stammt aus der Gemma-Zeit". `gemma26-vision` verspricht im Namen
Bildfähigkeit und ist ausdrücklich text-only.

Dieser Change entfernt die gewichtslosen Loadouts, verdrahtet die beiden funktionsfähigen
Setups mit **gemessenem** statt geschätztem Kontext, hängt die opencode-Agenten darauf um
und zieht einen Guard ein, der die Wiederkehr verhindert.

### Symptom gegen Hypothese (Bug-Triage, T002448-M5)

**Beobachtet, reproduzierbar:** `resolveModelPath()` liefert für `gemma-factory`,
`gemma-multiagent` und `gemma9-factory` `null`. Der neue BATS-Guard zeigt es im RED-Lauf
vom 2026-08-09 und nennt genau diese drei. Die Dateien fehlen unter beiden `modelRoots`.

**Ebenfalls beobachtet:** `gemma9-factory` streckt per
`--override-kv gemma2.context_length=int:98304` auf das Zwölffache des trainierten
Bereichs. Belegt aus `unsloth/gemma-2-9b-it/config.json` — `max_position_embeddings: 8192`,
`sliding_window: 4096`, `rope_theta: 10000.0` unskaliert. Die Zahl steht im Log; trainiert
ist sie nicht.

**Keine Hypothese nötig:** Ursache und Symptom fallen zusammen, die Dateien sind nicht da.
Was fehlte, war die Erkennung — nicht die Erklärung.

## Messgrundlage

RTX 5070 Ti (16303 MiB, Desktop belegte 1365 MiB), llama.cpp b10241, `-fa on`,
`n_ctx_slot` aus dem Serverlog, tok/s aus `timings.predicted_per_second`. **Jeder Punkt
mindestens zweimal gemessen** — der erste Lauf nach dem Download meldete 122,3 tok/s und
war nicht reproduzierbar (vier Folgeläufe: 100,2 / 101,7 / 100,3 / 101,7). Einzelmessungen
taugen auf dieser Karte nicht.

Gemma 4 26B A4B UD-IQ4_XS (np=1, q8_0): fitt 256 → 103424 ctx; 128 → 111872; 64 → 115968
bei 84,3 tok/s. In Loadout-Konfiguration (np=3, `-kvu`, q4_0, fitt 128): **161024** als
gemeinsamer Pool über die drei Slots. Gedeckt — `config.json` meldet
`max_position_embeddings: 262144`.

Qwen3-Coder-30B UD-IQ3_XXS (np=1, q4_0): fitt 64 → **96000** ctx / 177,4 tok/s. Gegen den
vorherigen Quant Q3_K_M bei gleicher Marge: Faktor 3,32 allein durch den Quantwechsel,
bezahlt mit rund 10 Prozent Decode-Tempo.

Der Margen-Effekt ist modellspezifisch: bei gemma26 bricht das Tempo unter 128 ein
(T002534 bestätigt), bei qwen bleibt die Kurve flach. Wer ihn für ein drittes Modell
annimmt, muss neu messen.

## Requirements

- Every loadout that carries weights MUST resolve its model file under one of the
  configured `modelRoots`; loadouts marked `managed: external` are exempt.
- The loadouts `gemma9-factory`, `gemma-factory` and `gemma-multiagent` MUST be removed,
  together with their guard entries and test fixtures.
- `gemma26-factory` MUST use the measured operating point and MUST load its chat template
  from `scripts/llm/templates/gemma4-26b-tools.jinja` instead of the template embedded in
  the GGUF, because a re-download silently restores the unpatched one.
- The opencode agents `gemma26-primary`, `gemma26-vision`, `gemma` and `qwen` MUST point at
  surviving local loadouts, and their `limit.context` values MUST equal measured
  `n_ctx_slot` values.

## Aktenvermerk: die q4_0-Ausnahme für qwen steht gegen die Evidenz

Die für 96000 Kontext nötige Ausnahme wird auf ausdrückliche Betreiber-Anweisung gesetzt.
Sie widerspricht einer vorliegenden Messung: der T002501-Befund vom 2026-08-08 wurde an
genau diesem Modell erhoben und war **negativ** — bei 39k Tokens und temperature 0
lieferten zwei Läufe verschiedene Fehler (Symbole vertauscht, Pfade mit ähnlichen Strings
aus dem Kontext verwechselt, Tool-Call-Argument nicht wortgetreu). Die bestehende Ausnahme
für `gemma26-factory` ist dagegen durch eine **bestandene** Probe gedeckt (T002579, 39388
Tokens, 30/30 zeichengenau).

Bei Fehlern in Tool-Call-Argumenten oder Pfaden ist diese Ausnahme der erste Verdächtige.
Rücknahme ist ein Feldwechsel auf `q8_0` und kostet 43008 Kontext.

## Nicht im Scope

- Die Wörtlichkeitsprobe für qwen unter q4_0 nachzuholen. Sie wäre die saubere Grundlage
  für die Ausnahme, ist aber ein eigener Messvorgang.
- T002645 (Qwen3-Coder als zusätzliches Chat-Loadout, `plan_staged`) bleibt getrennt.
- `gemma4-base` und `gemma4-tuned` — das Eval-Paar aus T002634 wird nicht angefasst, weil
  jede Abweichung zwischen beiden die Messung wertlos macht.
