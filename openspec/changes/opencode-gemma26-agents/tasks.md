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
fahren.

## Die Falle, die dieser Plan vermeiden muss

Mit `-kvu` ist der Kontext ein **gemeinsamer Pool über alle Slots**, kein Wert
je Slot. Das ist die *Umkehrung* der bge-Konstellation aus T002546, wo
`ctx/parallel` **je** Slot geteilt wird — dieselbe Zahl bedeutet je nach Flag
das Gegenteil. Die Warnung steht bereits in der `gemma-multiagent`-Notiz.

Konkret: aus heute gemessenen 99840 bei einem Slot werden mit drei Slots grob
**~33000 je Agent**, nicht 3 × 99840. `fit.minCtx` steht auf 32768 — als
*Pool*-Untergrenze wären das nur ~10900 je Agent, also unter dem Brauchbaren.
Der Wert muss mitwachsen, sonst regelt `--fit` unbemerkt darunter.

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

- [ ] **1.2** `fit.minCtx` neu bemessen — als **Pool**-Untergrenze für drei
      Agenten, nicht als Single-Slot-Wert. Der alte 32768 ergäbe ~10900 je
      Agent. Den Zielwert aus dem ableiten, was ein Agent mindestens braucht,
      mal drei.

- [ ] **1.3** KV bleibt `q4_0` — bereits gesetzt und Voraussetzung dafür, dass
      drei Slots überhaupt in den Pool passen. **Nicht** auf q8_0 anheben.

- [ ] **1.4** Nach jeder Änderung an der Datei: `task llm:loadouts:check`
      (Guard aus T002554). Bei Abweichung `task llm:loadouts:format`. Die Datei
      mit einem fremden JSON-Werkzeug zu schreiben erzeugt einen
      Vollzeilen-Diff.

## 2. Unit neu starten und messen

- [ ] **2.1** `llama-gemma26-factory.service` neu starten — die Änderungen aus
      Aufgabe 1 wirken erst dann. Der Neustart ist ausdrücklich freigegeben
      (Betreiber, 2026-08-02).

      Nebeneffekt, der dabei mitkommt: die Unit läuft danach erstmals mit dem
      Hardening aus T002555 (`ProtectHome=tmpfs`). Startet sie nicht, ist das
      die erste Stelle zum Nachsehen — `journalctl --user -u
      llama-gemma26-factory` zeigt bei Namespace-Problemen `226/NAMESPACE`
      oder `203/EXEC`.

- [ ] **2.2** **Den tatsächlichen Kontext messen, nicht rechnen:**
      `curl -s localhost:8091/props | jq '{total_slots, n_ctx:
      .default_generation_settings.n_ctx}'`. Die `--fit`-Automatik entscheidet
      den Endwert, nicht die Config. Ergebnis ins Ticket.

- [ ] **2.3** Belegen, dass drei Slots wirklich nebeneinander arbeiten: drei
      gleichzeitige Anfragen gegen :8091 absetzen und über `/slots` prüfen,
      dass sie sich auf verschiedene Slots verteilen statt zu serialisieren.

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
      Wert setzen — je Agent, nicht den Pool. Und dazuschreiben, dass es der
      geteilte Pool ist; sonst entsteht dieselbe Verwechslung erneut.

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
