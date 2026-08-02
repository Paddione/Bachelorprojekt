---
title: "opencode-gemma26-agents — Implementation Plan"
ticket_id: T002545
domains: [bachelorprojekt-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# opencode-gemma26-agents — Implementation Plan

_Ticket: T002545_

## File Structure

```
scripts/llm/loadouts.json                                        (geändert; JSON, keine S1-Grenze)
.opencode/agent-models.jsonc                                     (geändert; .jsonc, keine S1-Grenze)
tests/spec/local-llm-proxy/opencode-agent-model-drift.bats       (liegt bereits auf dem Branch, RED)
docs/agent-guide/registry/agents.yaml                            (evtl. +/- Einträge; keine S1-Grenze)
```

Berührt werden ausschließlich Konfigurations- und Testdateien (JSON, JSONC,
YAML, BATS). Für keine dieser Endungen führt `docs/code-quality/gates.yaml` ein
S1-Limit, ein Verkleinerungsschritt entfällt daher.

## Kontext: zwei Drifts und eine Betreibervorgabe

**Drift 1 — falsches Modell.** `.opencode/agent-models.jsonc` verdrahtet die
Subagenten auf `llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf`. Gemessen per
`/props` auf :8091 läuft dort `gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf`. Die
Definitionen benennen ein Modell, das nicht geladen ist.

**Drift 2 — falsche Kontextzahl.** Die Beschreibung verspricht „the full
262144-token context". Gemessen: **`n_ctx=99840`**. Wer der Beschreibung glaubt,
plant mit dem 2,6-fachen des Verfügbaren; das fällt erst beim Abschneiden auf.

**Betreibervorgabe 2026-08-02:** Alle lokalen LLM-Jobs laufen auf
`gemma26-factory`, und dieses Loadout soll **unified context für drei Agenten**
fahren — drei **Slots**, aber weiterhin **eine** Anfrage gleichzeitig
(`max_inflight` bleibt 1).

## Was `-kvu` tatsaechlich tut — gemessen, nicht abgeleitet

`llama-server --help` (b10223): *"use single unified KV buffer shared across all
sequences"*. Ein **geteilter Puffer**, keine feste Aufteilung.

Gegenmessung mit demselben Modell, `-c 8192 -np 4`, nur das Flag unterschiedlich:

```
-kvu      n_slots = 4, n_ctx_slot = 8192, kv_unified = 'true'
-no-kvu   n_slots = 4, n_ctx_slot = 2048, kv_unified = 'false'
```

Mit `-kvu` sieht **jeder Slot den vollen Kontext**. Die Sequenzen konkurrieren um
denselben Speicher, statt starr zugeteilte Scheiben zu bekommen.

**Eine fruehere Fassung dieses Plans behauptete das Gegenteil** ("aus 99840
werden ~33000 je Agent, `fit.minCtx` muss mitwachsen"). Das war aus der
`gemma-multiagent`-Notiz abgeleitet statt gemessen und ist falsch. `fit.minCtx`
bleibt unveraendert.

Die Kontexttrennung zwischen den Agenten leisten die **Factory-Slots** samt
Sandbox-Isolation (T002483), nicht getrennte KV-Puffer — genau deshalb ist ein
unified Buffer hier richtig.

Zu beachten bleibt die Konkurrenz: drei Agenten, die gleichzeitig den vollen
Kontext ziehen, passen nicht zusammen in den Puffer. Das ist ein Auslastungs-,
kein Konfigurationsproblem — und im Betrieb zu beobachten, nicht vorab
wegzukonfigurieren.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die BATS-Datei liegt auf diesem Branch;
      6 von 7 Tests sind rot. Der siebte (`loadouts.json bleibt kanonisch`) ist
      korrekt grün — er ist Regressionsschutz für die kommende Änderung, keine
      Vorbedingung.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/opencode-agent-model-drift.bats
# expected: FAIL — 6 not ok (parallel≠3, kein -kvu, 12B-Referenzen, 262144, llamacpp-mtp)
```

## 1. Loadout auf drei Slots mit unified context

- [ ] **1.1** In `scripts/llm/loadouts.json` bei `gemma26-factory`:
      `args.parallel` von 1 auf **3**, und `-kvu` in `extraArgs` aufnehmen
      (Vorbild: `gemma-multiagent`, das `["-kvu"]` führt).

- [ ] **1.2** `fit.minCtx` **unveraendert lassen** (32768). Mit `-kvu` sieht
      jeder Slot den vollen Kontext; eine Anhebung waere wirkungslos. Gemessen,
      siehe Abschnitt oben — eine fruehere Planfassung forderte hier faelsch-
      licherweise eine Erhoehung.

- [ ] **1.3** KV bleibt `q4_0` — bereits gesetzt. Bei einem geteilten Puffer
      bestimmt die Quantisierung, wie viel Kontext insgesamt hineinpasst, also
      wie weit drei Agenten gleichzeitig kommen. **Nicht** auf q8_0 anheben.

- [ ] **1.4** Nach jeder Änderung an der Datei: `task llm:loadouts:check`
      (Guard aus T002554). Bei Abweichung `task llm:loadouts:format`. Die Datei
      mit einem fremden JSON-Werkzeug zu schreiben erzeugt einen
      Vollzeilen-Diff.

## 1b. Was `parallel: 3` bewirkt — und was NICHT

`llama-server --help`: `-np, --parallel N` = **number of server slots**. Ein
Slot ist ein **Zustandshalter**: er behaelt den KV-Cache seiner Sequenz zwischen
Anfragen. Ob gleichzeitig gerechnet wird, entscheidet `--cont-batching`, nicht
`-np`.

Der Gewinn von drei Slots ist deshalb **erhaltener Kontext je Factory-Slot**,
nicht Durchsatz. Teilen sich drei Tickets einen Slot, wird bei jedem Wechsel der
Prompt verworfen und neu berechnet — bei ~99840 Kontext ist das teuer.

**`max_inflight` bleibt bei 1** (Betreibervorgabe 2026-08-02). Bei einer
einzelnen GPU ist echte Nebenlaeufigkeit kaum ein Gewinn: die Inferenz ist
GPU-gebunden, drei gleichzeitige Laeufe teilen sich dieselbe Rechenzeit. Ein
Wert von 1 ist hier kein Verzicht, sondern die passende Einstellung.

Gemessener IST-Zustand der Kette (2026-08-02):

```
Factory                      llm-proxy                 llama-server
FACTORY_SLOTS_PER_BRAND=3  → llamacpp-gemma          → :8091
(scripts/factory/slots.sh)   max_inflight = 1          total_slots = 1
                             ^ bleibt so               ^ wird 3
```

- [ ] **1b.1** `tickets.llm_proxy_backends.max_inflight` fuer `llamacpp-gemma`
      **nicht anfassen** — der Wert 1 ist korrekt. Diese Aufgabe existiert, damit
      niemand ihn "passend zu parallel=3" mitzieht: eine fruehere Fassung dieses
      Plans forderte genau das, mit falscher Begruendung.

- [ ] **1b.2** **Nicht mit erledigt betrachten:** die Zuordnung
      `pipeline_slot` → llama.cpp-Slot-ID ist **T002483** (`in_progress`). Ohne
      sie existieren zwar drei Slots, aber kein Ticket haelt verlaesslich seinen
      eigenen — llama.cpp waehlt den Slot dann selbst. Erst die feste Bindung
      macht aus drei Slots drei getrennte Ticket-Kontexte. Dieser Plan schafft
      die Voraussetzung, er ersetzt T002483 nicht.

      Verwandt: `--slot-save-path` (KV-Cache eines Slots persistieren) ist der
      Hebel hinter T002482, von dem T002483 abhaengt. Hier nicht setzen — das
      gehoert in jenen Vorgang.

## 2. Unit neu starten und messen

- [ ] **2.1** `llama-gemma26-factory.service` neu starten — die Änderungen aus
      Aufgabe 1 wirken erst dann. Der Neustart ist ausdrücklich freigegeben
      (Betreiber, 2026-08-02).

      Nebeneffekt, der dabei mitkommt: die Unit läuft danach erstmals mit dem
      Hardening aus T002555 (`ProtectHome=tmpfs`). Startet sie nicht, ist das
      die erste Stelle zum Nachsehen — `journalctl --user -u
      llama-gemma26-factory` zeigt bei Namespace-Problemen `226/NAMESPACE`
      oder `203/EXEC`.

- [ ] **2.2** **Den tatsächlichen Kontext messen, nicht rechnen** — erwartet
      wird `n_ctx_slot` nahe dem Single-Slot-Wert (~99840), NICHT ein Drittel
      davon:
      `curl -s localhost:8091/props | jq '{total_slots, n_ctx:
      .default_generation_settings.n_ctx}'`. Die `--fit`-Automatik entscheidet
      den Endwert, nicht die Config. Ergebnis ins Ticket.

- [ ] **2.3** Belegen, dass drei Slots **existieren und ihren Kontext behalten**
      — nicht, dass sie gleichzeitig rechnen. `/slots` muss drei Eintraege
      zeigen, jeder mit vollem `n_ctx`.

      Danach zwei aufeinanderfolgende Anfragen mit unterschiedlichem Prompt
      absetzen und pruefen, dass die zweite nicht den Prompt der ersten
      verwirft. Genau dieses Neuberechnen ist der Kostenpunkt, den drei Slots
      vermeiden — Durchsatz ist hier nicht das Ziel.

## 3. Agentendefinitionen korrigieren

- [ ] **3.1** In `.opencode/agent-models.jsonc` alle Verweise auf das 12B-Modell
      durch `gemma26-factory` ersetzen (der Alias, unter dem der Server sich in
      `/v1/models` meldet).

- [ ] **3.2** Genau **drei** Agenten definieren, passend zu `parallel=3`. Die
      bisherige Struktur versprach mehr Parallelität, als der Single-Slot-Server
      liefern konnte.

- [ ] **3.3** Provider-Name `llamacpp-mtp` ersetzen. `gemma26-factory` hat
      **bewusst kein Draft-Modell**: `mtp-gemma-4-26B-A4B-it.gguf` lässt sich
      unter b10223 nicht laden (`vector::_M_range_check`) und bricht den
      Serverstart komplett ab. Ein Name, der MTP verspricht, führt in die Irre.

- [ ] **3.4** Die Kontextzahl in den Beschreibungen auf den in 2.2 **gemessenen**
      `n_ctx_slot` setzen. Dazuschreiben, dass der Puffer geteilt ist: die Zahl
      gilt je Agent, aber drei Agenten koennen sie nicht gleichzeitig
      ausschoepfen. Ohne diesen Zusatz liest sie sich als Garantie.

## 4. Drift-Klasse schließen

- [ ] **4.1** Prüfen, ob die Kontextzahl aus `loadouts.json` **generiert** statt
      handgepflegt werden kann — dieselbe Klasse, die T002300 für die
      MCP-Configs mit `task mcp:sync`/`mcp:check` gelöst hat.

      Ergebnis dokumentieren, auch wenn es „nein" lautet: eine Zahl, die von
      Hand gepflegt wird, driftet wieder, und der nächste Leser soll wissen, ob
      das geprüft wurde. Bei „ja" ist die Umsetzung ein eigenes Ticket, kein
      Anhängsel dieses Fixes.

- [ ] **4.2** `docs/agent-guide/registry/agents.yaml` gegenlesen: nennt sie noch
      `gemma-4-12b`-Rollen? Falls ja, mit anpassen — sonst widerspricht die
      generierte `agents-map.md` der Config.

## 5. Verifikation

- [ ] **5.1** `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/` —
      alle grün, insbesondere die sieben aus `opencode-agent-model-drift.bats`.

- [ ] **5.2** Ein echter opencode-Subagenten-Aufruf gegen den neuen Stand:
      belegen, dass er antwortet und das Modell `gemma26-factory` nennt. Ein
      grüner Config-Test sagt nichts darüber, ob der Agent tatsächlich läuft.

- [ ] **5.3** Abschluss:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
