---
title: "Messbericht und Empfehlung — FreeToken vs. llama.cpp"
ticket_id: "T900087"
domains: ["ops", "llm-local-dev"]
status: "draft"
---

# p6 — Messbericht und Empfehlung (freetoken-vs-llamacpp)

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md` | 0 (neu) | kein S1-Limit (`.md` ohne Extension-Limit, `docs/code-quality/gates.yaml`) |
| `docs/runbooks/freetoken-native.md` | 425 | kein S1-Limit (`.md` ohne Extension-Limit) |

Kein Budget-Druck — beide Dateien tragen keine Zeilenschwelle. Die Runbook-Änderung
ist ein **Zusatz** (Beobachtungslücke + zwei Korrekturen), kein Rewrite: die
bestehenden Abschnitte „Messwerte", „Fallstricke", „Kalibrierte Profile" und die
gesamte OpenDesign-Historie bleiben unangetastet stehen.

## Problem

P6 ist der Zweck des ganzen Changes: aus den Rohdaten von P2–P5 wird eine
**Entscheidungsgrundlage**, keine Migration. Ohne P6 bleiben P2–P5 vier isolierte
Messläufe, aus denen niemand eine Empfehlung ableiten kann — genau der Zustand,
den `CLAUDE.md` (Mess-Konvention T002717) verhindern soll: „Ein Metadaten-Block
ohne das konkrete Suchmuster dokumentiert die Sorgfalt, nicht die reproduzierbare
Messung." P6 verdichtet, es misst nicht selbst neu — jede Zahl im Bericht stammt
aus einem der vorgelagerten Partials und wird hier nur zitiert, mit dem Befehl,
der sie erzeugt hat.

**Voraussetzung:** P2 (Alias-Telemetrie), P3 (Kontextmessung), P4
(Engine-Isolation) müssen abgeschlossen sein, bevor P6 geschrieben werden kann.
P5 (Modellvergleich) ist bedingt — siehe Abbruchpunkt 2 unten.

## Design-Entscheidungen

**Reihenfolge im Bericht folgt der Reihenfolge der Abbruchpunkte, nicht der
Partial-Nummerierung.** Zuerst Kontextbedarf (P3, entscheidet über Abbruchpunkt 1),
dann Alias-Nutzung (P2, unabhängig von beiden Abbruchpunkten), dann
Engine-Isolation (P4, entscheidet über Abbruchpunkt 2), dann — nur falls
Abbruchpunkt 2 nicht griff — Modellvergleich (P4/P5), zuletzt die Empfehlung.
Diese Reihenfolge macht dem Leser sichtbar, an welcher Stelle der Bericht ggf.
kürzer ausfällt, weil ein Abbruchpunkt gegriffen hat, statt die Kürzung
kommentarlos zu verstecken.

**Abbruchpunkte sind Ergebnisse, keine Fehlschläge (proposal.md, tasks.md).**
Greift einer, wird das im jeweiligen Abschnitt explizit als Messergebnis
benannt — nicht als „P5 konnte nicht durchgeführt werden", sondern als
„P4 zeigt X, deshalb entfällt der in `tasks.md` vorgesehene Modellvergleich
mit Begründung Y". Der Bericht bleibt vollständig, auch wenn P5 nie lief.

**Bestandsmesswerte-Tabelle wird unverändert aus `proposal.md` übernommen, mit
der dortigen Warnung wortgleich.** Diese vier Zeilen sind die Ausgangslage, mit
der der Change begründet wurde — sie gehören an den Anfang des Berichts, damit
der Leser den Ausgangspunkt vor der neuen Messung sieht:

| Backend | Modell | Kontext | Decode |
|---|---|---|---|
| llama.cpp `gemma26-throughput` | Gemma 4 26B A4B QAT-Q4_K_XL (MoE, 4B aktiv) | 118.016 | 159–169 t/s |
| llama.cpp `gemma4` | Gemma 4 26B A4B UD-IQ4_XS (MoE, 4B aktiv) | 177.920 | 126–128 t/s |
| FreeToken `qwen-200k` | Qwen3.6-35B-A3B-NVFP4 (MoE, 3B aktiv, Offload) | 200.000 | 115 t/s |
| llama.cpp `qwen38-220k` | Qwen3.8-27B UD-IQ3_XXS (dicht/hybrid) | 131.072 | 30–43 t/s |

> **Diese vier Zeilen sind NICHT kommensurabel** — verschiedene Modelle, Quants,
> Kontexte, Build-Stände und Messtage. Ausgangslage, nicht Beleg.

**Zwei Faktenkorrekturen sind bereits verifiziert (Schritt 1) und werden mit dem
tatsächlichen Beleg statt der bisherigen Behauptung in Bericht UND Runbook
übernommen** — nicht als offene Prüfung, sondern als abgeschlossene Korrektur mit
Befehl:

- `gemma26-throughput`-Notiz (`scripts/llm/loadouts.json:331`) nennt „QAT-Q4_K_XL
  Quant (15,2 GB)". Repo `unsloth/gemma-4-26B-A4B-it-qat-GGUF`, Datei
  `gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf`: **14.249.047.104 Bytes = 14,25 GB**
  (verifiziert per Hugging-Face-Hub-Filesystem-Lookup, 2026-09-04). Die Notiz in
  `loadouts.json` bleibt unverändert (außerhalb der `target_files` dieses
  Partials und dieses Changes — `loadouts.json` ist laut `tasks.md` bewusst kein
  Ziel) — der Messbericht trägt die korrigierte Zahl.
- `docs/runbooks/freetoken-native.md:14` nennt „Qwen3.6-35B-A3B-NVFP4 (23,5 GB)".
  Das Modellverzeichnis auf Platte
  (`C:\Users\PatrickKorczewski\models\Qwen3.6-35B-A3B-NVFP4`) ist **19,5 GB**
  groß. Diese Datei IST `target_files` — die Korrektur wird direkt im Runbook
  vorgenommen (Schritt 7).

**Runbook-Änderung ist additiv, an zwei Stellen — kein Abschnitt wird entfernt.**
Ein neuer Abschnitt „Beobachtungslücke" dokumentiert, warum
`tickets.llm_proxy_request_log` keine FreeToken-Zeile enthält und wo die
Ersatz-Telemetrie seit P2 liegt; die 23,5-GB-Angabe in Zeile 14 wird durch die
gemessene Zahl ersetzt, mit Beleg-Kommentar im Stil der bereits im Runbook
vorhandenen Korrekturen (siehe Zeile 270–276, „NVFP4 ist für LM Studio NICHT
unbrauchbar").

## Implementation Steps

- [ ] **1. Faktenkorrekturen verifizieren und Belege festhalten.**
  ```bash
  # Commit-Stand für diesen Schritt:
  git rev-parse HEAD
  ```
  HF-Hub-Lookup (bereits während der Planerstellung durchgeführt, hier zur
  Nachstellung — kein lokaler Download nötig, `find` liest nur Metadaten):
  ```
  hf_fs: find hf://models/unsloth/gemma-4-26B-A4B-it-qat-GGUF --name "*UD-Q4_K_XL*"
  # -> gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf, size=14249047104 (= 14,25 GB)
  ```
  Lokale Verzeichnisgröße (Windows, PowerShell — auf dem Host mit installiertem
  FreeToken-Modell auszuführen):
  ```powershell
  (Get-ChildItem -Recurse -File 'C:\Users\PatrickKorczewski\models\Qwen3.6-35B-A3B-NVFP4' |
    Measure-Object -Property Length -Sum).Sum / 1GB
  ```
  Beide Werte gehen in Schritt 5 (Bestandsmesswerte-Abschnitt des Berichts) und
  Schritt 7 (Runbook-Korrektur) ein.

- [ ] **2. Kontextbedarf-Abschnitt aus P3 übernehmen.**
  P3 (`scripts/llm/measure-factory-context.mjs`) misst den Kontextbedarf der
  acht Fixtures unter `tests/factory-eval/fixtures/`. Ausführen und Rohausgabe
  archivieren:
  ```bash
  node scripts/llm/measure-factory-context.mjs > /tmp/p3-context-output.txt
  git rev-parse HEAD   # Commit-Stand fuer diese Messung
  ```
  Exakte CLI-Flags stehen in `tasks.d/p3-context-measurement.md` (eigenes
  Partial) — dieser Schritt ruft das dort definierte Skript mit seinem
  dokumentierten Standardaufruf auf. Im Bericht: die gemessene Token-Zahl je
  Fixture, das Maximum, und ausdrücklich die **offene Frage**, ob die acht
  Eval-Fixtures für Live-Prompts repräsentativ sind (`proposal.md`: „Ob die
  acht Eval-Fixtures für Live-Prompts repräsentativ sind, ist ungeprüft"). Diese
  Frage wird NICHT beantwortet, sondern explizit offengehalten und auf die
  Live-Telemetrie aus P2 (Schritt 3) als Korrektiv verwiesen — dieselbe Rolle,
  die `proposal.md` ihr zuweist: „P2 ist das Korrektiv für P3".
  Greift Abbruchpunkt 1 (Kontextbedarf nahe 200.000 Tokens), wird das hier als
  Ergebnis benannt: das Hauptargument gegen FreeToken (200k-Kontextbedarf ist
  mit llama.cpp-Loadouts der Größenordnung `qwen38-220k` nicht ohne Weiteres
  erreichbar) entfällt, und Schritt 4/5 (Modellvergleich) fällt entsprechend
  kürzer aus — mit Verweis auf genau diesen Absatz.

- [ ] **3. Alias-Nutzung aus P2 aggregieren.**
  P2 schreibt Append-Only-JSONL nach
  `%LOCALAPPDATA%\FreeToken\logs\alias-telemetry.jsonl` (Pfad und Schema:
  `tasks.d/p2-alias-telemetry.md`). Aggregation:
  ```bash
  jq -s 'group_by(.alias) | map({alias: .[0].alias, count: length}) |
    sort_by(-.count)' "$LOCALAPPDATA/FreeToken/logs/alias-telemetry.jsonl"
  ```
  Ergänzend die grobe Kontext-Umrechnung je Alias (Faustwert
  `Zeichen / 4 ≈ Tokens`, wie in `tasks.d/p2-alias-telemetry.md` für den
  Bericht vorgesehen):
  ```bash
  jq -s 'group_by(.alias) | map({alias: .[0].alias,
    count: length, avgPromptChars: (map(.promptChars) | add / length)})' \
    "$LOCALAPPDATA/FreeToken/logs/alias-telemetry.jsonl"
  ```
  Im Bericht: absolute und relative Häufigkeit `active-thinking` gegenüber
  `active-fast`, plus Bewertung der offenen Frage aus `proposal.md`: llama.cpp
  kann `enable_thinking` nur per Serverneustart umschalten, FreeToken pro
  Request (`chat_template_kwargs.enable_thinking`, gesetzt im Plugin-Wrapper,
  `.opencode/plugin/freetoken-active.ts` Zeile 128/131). Ob das ein
  K.-o.-Kriterium ist, entscheidet die Mischung: bleibt ein Alias über die
  Messperiode klar dominant (z. B. > 90 % `active-fast`), trägt ein statisch
  konfiguriertes llama.cpp-Loadout denselben Betrieb ohne Nachteil — wechseln
  beide Aliase im Betrieb regelmäßig ab, kostet jeder Wechsel unter llama.cpp
  einen Serverneustart (Sekunden bis zweistellig, siehe Ladezeiten in den
  Bestandsmesswerten), und der Pool wird zum K.-o.-Kriterium gegen llama.cpp.
  Der Bericht benennt explizit, welcher der beiden Fälle in der Messperiode
  vorlag — keine Vorwegnahme ohne Datenbasis (`proposal.md`: „das entscheidet
  die Nutzungsmessung … nicht dieser Change im Voraus").

- [ ] **4. Engine-Isolation aus P4 übernehmen.**
  P4 (`scripts/llm/bench-engine-ab.sh`) misst `gpt-oss-20b` auf FreeToken
  (`:1919`, Profil `gptoss-65k`) gegen `llama-server` mit
  `gpt-oss-20b-MXFP4.gguf`, identische Prompts, identische Gewichte:
  ```bash
  bash scripts/llm/bench-engine-ab.sh > /tmp/p4-engine-ab-output.txt
  git rev-parse HEAD   # Commit-Stand fuer diese Messung
  ```
  Exakte Flags/Prompt-Satz: `tasks.d/p4-engine-ab.md` (eigenes Partial). Im
  Bericht: Durchsatz (Prefill + Decode) je Engine, Streuung über mehrere Läufe
  (Vorbild für die Darstellungsform: `scripts/llm/measurements/2026-08-19-gemma12-slots.md`,
  Abschnitt „Vollständige Abfolge" — Einzelwerte tabellarisch, keine
  geglättete Mittelwert-Behauptung ohne Streuungsangabe).
  **Abbruchpunkt 2:** Verliert llama.cpp bereits hier bei identischen
  Gewichten, wird das als Ergebnis benannt — der Modellvergleich in Schritt 5
  entfällt dann, inklusive der Begründung, warum die ~26 GB Download für
  Gemma/Qwen-GSQ-RCO nicht mehr gerechtfertigt sind. Der Bericht macht diesen
  Kurzschluss transparent, statt Schritt 5 unkommentiert wegzulassen.

- [ ] **5. Modellvergleich aus P4/P5 übernehmen — NUR falls Abbruchpunkt 2 in
  Schritt 4 nicht griff.**
  Gemma 4 26B A4B QAT-Q4_K_XL + MTP-Head gegen Qwen3.8-27B GSQ-RCO IQ3_S-mtp
  gegen den FreeToken-Amtsinhaber, Durchsatz und Schema-Treue:
  ```bash
  bash scripts/llm/bench-ifstruct.sh > /tmp/p5-ifstruct-output.txt
  git rev-parse HEAD   # Commit-Stand fuer diese Messung
  ```
  `bench-ifstruct.sh` (`tasks.d/p5-ifstruct.md`) misst gegen
  `LiquidAI/ifstruct-v1.0` (2.000 Prompts, binäre Wertung, ohne constrained
  decoding) — reine JSON/YAML-Schema-Treue, der Fehlermodus, an dem die Factory
  bei `tool_calls` tatsächlich scheitert. Im Bericht: Durchsatz je Modell aus
  P4, Schema-Treue-Quote je Modell aus P5, nebeneinander — nicht vermischt, weil
  es zwei unabhängige Metriken sind.
  Griff Abbruchpunkt 2, entfällt dieser Schritt vollständig; der Bericht
  verweist an dieser Stelle auf Schritt 4 statt eine leere Sektion zu lassen.

- [ ] **6. Empfehlung schreiben.**
  Ein eigener Abschnitt „Empfehlung" am Ende des Berichts, mit drei Pflichtteilen:
  1. Die Empfehlung selbst (FreeToken behalten / auf llama.cpp migrieren /
     weitere Messung nötig) — in einem Satz.
  2. **Welche Zahl sie trägt** — Verweis auf den konkreten Abschnitt/die
     konkrete Tabellenzeile aus Schritt 2–5, nicht auf den Bericht als Ganzes.
  3. **Welche Gegenevidenz es gibt** — mindestens eine Beobachtung aus Schritt
     2–5, die gegen die Empfehlung spricht oder ihre Reichweite einschränkt
     (Vorbild: `2026-08-19-gemma12-slots.md`, Abschnitt „Was die Zahlen tragen
     — und was nicht" hält Gegenevidenz genauso fest wie die Kernaussage).
  Migriert wird in diesem Change **nicht** — die Empfehlung ist die
  Entscheidungsgrundlage für einen eigenen Folge-Change (`proposal.md`: „Fällt
  die Empfehlung für llama.cpp aus, folgt ein eigener Change mit eigenen
  Spec-Deltas").

- [ ] **7. Runbook editieren: Beobachtungslücke dokumentieren.**
  Neuer Abschnitt nach „## Setup (Stand 2026-08-23)" in
  `docs/runbooks/freetoken-native.md`, vor „## Start / Stop":
  ```markdown
  ## Beobachtungslücke: FreeToken-Verkehr umgeht den Proxy

  `scripts/llm-proxy/` enthält keine Referenzen auf FreeToken
  (`grep -rn -i 'freetoken' scripts/llm-proxy/` → 0 Treffer). Der Provider
  zielt in `.opencode/agent-models.jsonc` direkt auf `http://127.0.0.1:1919/v1`
  — am mitschneidenden Proxy (`:18235`) vorbei. `tickets.llm_proxy_request_log`
  enthält deshalb keine einzige FreeToken-Zeile und wird für dieses Backend nie
  eine haben, solange dieses Routing gilt.

  Seit T900087/P2 existiert stattdessen Plugin-Telemetrie:
  `.opencode/plugin/freetoken-active.ts` schreibt jeden Request-Alias (mit
  Zeitstempel und Prompt-Zeichenzahl) als JSONL nach
  `%LOCALAPPDATA%\FreeToken\logs\alias-telemetry.jsonl`. Auslesen:

  ```bash
  jq -s 'group_by(.alias) | map({alias: .[0].alias, count: length}) |
    sort_by(-.count)' "$LOCALAPPDATA/FreeToken/logs/alias-telemetry.jsonl"
  ```

  Diese Datei ersetzt `llm_proxy_request_log` NICHT vollständig — sie kennt
  weder Latenz noch HTTP-Status, nur Alias und Prompt-Größe. Vollständige
  FreeToken-Beobachtbarkeit bräuchte einen eigenen Change, der den Proxy in den
  Pfad zwingt oder den Provider auf `:18235` umbiegt; das ist außerhalb des
  Scopes von T900087.
  ```

- [ ] **8. Runbook editieren: Größenkorrektur Zeile 14.**
  ```diff
  - **Modell:** `Qwen3.6-35B-A3B-NVFP4` (23,5 GB) als lokales Verzeichnis mit
  + **Modell:** `Qwen3.6-35B-A3B-NVFP4` (19,5 GB — korrigiert 2026-09-04,
  +   T900087/P6; die zuvor genannten 23,5 GB waren die HF-Repo-Größe, nicht die
  +   lokale Verzeichnisgröße nach NTFS-Hardlink) als lokales Verzeichnis mit
  ```
  Verifikationsbefehl (auf dem Host mit installiertem Modell):
  ```powershell
  (Get-ChildItem -Recurse -File 'C:\Users\PatrickKorczewski\models\Qwen3.6-35B-A3B-NVFP4' |
    Measure-Object -Property Length -Sum).Sum / 1GB
  # erwartet: ~19,5
  ```

- [ ] **9. Mess-Konvention-Selbstprüfung (T002717).**
  Jede im Bericht genannte Zahl muss einen ausführbaren Befehl UND einen
  Commit-Stand tragen. Grep-Gegenprobe vor dem Commit:
  ```bash
  grep -c '```bash\|```powershell\|```diff' \
    scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md
  # Anker: > 0 — mindestens ein Befehlsblock pro Abschnitt (2-6), sonst fehlt
  # der Beleg fuer die dort genannten Zahlen
  grep -c 'git rev-parse HEAD\|Repo-Stand\|Commit-Stand' \
    scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md
  # Anker: > 0
  ```

## Acceptance Criteria

- [ ] `scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md` existiert
      und enthält, in dieser Reihenfolge: Bestandsmesswerte + Warnung,
      Kontextbedarf (P3) mit offener Repräsentativitätsfrage und Verweis auf P2,
      Alias-Nutzung (P2) mit Bewertung des Dynamic-Thinking-Pool-Kriteriums,
      Engine-Isolation (P4), Modellvergleich (P4/P5, bedingt), Empfehlung mit
      den drei Pflichtteilen aus Schritt 6.
- [ ] Jede Zahl im Bericht trägt einen ausführbaren Befehl und einen
      Commit-Stand (Schritt 9 grün).
- [ ] Beide Abbruchpunkte sind, falls sie griffen, als Ergebnisse benannt —
      nicht als ausgelassene Abschnitte.
- [ ] `docs/runbooks/freetoken-native.md` enthält den neuen Abschnitt
      „Beobachtungslücke: FreeToken-Verkehr umgeht den Proxy" und die
      korrigierte Zeile 14 (19,5 GB statt 23,5 GB); alle bestehenden Abschnitte
      (Messwerte, Fallstricke, Kalibrierte Profile, OpenDesign-Historie)
      bleiben unverändert erhalten.
- [ ] Die Faktenkorrektur zu `gemma26-throughput` (14,25 GB statt 15,2 GB) steht
      im Messbericht mit dem HF-Beleg aus Schritt 1; `scripts/llm/loadouts.json`
      selbst bleibt unangetastet (kein `target_file` dieses Partials).

## Not in Scope

- **Die eigentlichen Messläufe P2–P5** — dieses Partial liest ihre Ausgaben,
  produziert sie nicht. Ohne abgeschlossene P2–P5 kann P6 nicht geschrieben
  werden (siehe Problem-Abschnitt).
- **Migration auf llama.cpp** — auch bei eindeutiger Empfehlung dafür bleibt die
  Umsetzung einem eigenen Folge-Change vorbehalten (`proposal.md`).
- **Änderungen an `scripts/llm/loadouts.json`** — bewusst außerhalb aller
  `target_files` dieses Changes (`tasks.md`: Konflikt mit
  `tests/spec/freetoken-local-backend/routing.bats` und dem offenen Change
  `decommission-orphaned-loadouts-T014339`).
- **Vollständige FreeToken-Beobachtbarkeit über den Proxy** — der neue
  Runbook-Abschnitt dokumentiert die Lücke und den Workaround (Plugin-
  Telemetrie), schließt sie aber nicht; das wäre ein eigener Change.
