# P2 — Abschalten und Agenten umhängen

**Rolle:** impl · **Zieldateien:** `scripts/llm/loadouts.json`, `.opencode/agent-models.jsonc`,
`scripts/migrations/2026-08-10-disable-gptoss-devstral.sql` · **depends_on:** P1

## Tasks

- [x] **`gptoss-context` und `devstral-quality` deaktivieren.** Je `"enabled": false` im Eintrag
      in `scripts/llm/loadouts.json`. Die Einträge bleiben **vollständig** stehen — Ports,
      Modellpfade, `fit`-Werte, alles.

- [x] **`notes` um die Begründung ergänzen, nicht ersetzen.** Die vorhandenen Messwerte bleiben
      (`gptoss-context`: „MXFP4-nativ … 198-215 tok/s decode bei 131.072 Kontext"). Angehängt
      wird, warum abgeschaltet wurde — bei `devstral-quality` die Dominanz in allen Dimensionen,
      bei `gptoss-context` die Operator-Entscheidung. Der ganze Zweck des Flags ist, dass die
      Zahlen die Entscheidung überleben; sie zu überschreiben nähme dem Vorgehen seinen Sinn.

- [x] **`brain-ingest` NICHT anfassen — außer beim Reasoning.** Das Loadout fährt dieselbe
      Modelldatei wie `gptoss-context` (`gptoss20/gpt-oss-20b-UD-Q4_K_XL.gguf`), ist aber ein
      eigener Eintrag auf `:8100`. Es bleibt aktiv. Geändert wird allein `args.reasoning`:
      `"auto"` → aus. Begründung: Formattreue bei `temperature 0.2` braucht keine Denkphase, die
      Tokens kostet ohne die Einhaltung der sechs harten Constraints zu verbessern.

      **Verwechslungsgefahr ausdrücklich benannt:** Wer nach `gpt-oss-20b` sucht, findet zwei
      Treffer. Nur der auf `:8098` wird abgeschaltet.

- [x] **`qwen3-coder-30b` unverändert lassen.** Weder aktivieren noch abschalten — es lauscht
      ohnehin nicht auf `:8094`. Ein `enabled: false` dort wäre eine Aussage, die dieses Ticket
      nicht belegt hat.

- [x] **Migration für die Proxy-Backends.** `scripts/migrations/2026-08-10-disable-gptoss-devstral.sql`
      setzt die zugehörigen Zeilen in `tickets.llm_proxy_backends` auf `enabled=false`.
      Idempotent formulieren (`UPDATE … WHERE name IN (…)`), damit ein zweiter Lauf unschädlich
      ist. Die Migration prüft nicht, ob die Zeilen existieren — ein `UPDATE` auf null Zeilen ist
      kein Fehler und darf keiner sein.

- [x] **Vier Agent-Definitionen umhängen** (`.opencode/agent-models.jsonc`):

| Agent | Zeile (Stand main) | heute | nachher |
|---|---|---|---|
| Familien-Subagent `gptoss` | ~270 | `llamacpp-local/gptoss-context` | `llamacpp-local/gemma26-throughput` |
| Familien-Subagent `devstral` | ~283 | `llamacpp-local/devstral-quality` | `llamacpp-local/gemma26-factory` |
| `gptoss-primary` | ~363 | `llamacpp-local/gptoss-context` | `llamacpp-local/gemma26-throughput` |
| `devstral-primary` | ~373 | `llamacpp-local/devstral-quality` | `llamacpp-local/gemma26-factory` |

- [x] **Beschreibungen mitziehen.** Die `description`- und `name`-Felder nennen Modell, Quant,
      Kontextzahl und Port („gpt-oss-20b Q8_0 (105.472 ctx, MXFP4-nativ) … Port 8098"). Diese
      Angaben werden nach dem Umhängen **falsch**. `opencode` nutzt die deklarierte Kontextzahl
      zur Laufzeit für Auto-Compact (fasst bei 95 % der Grenze zusammen) — eine falsche Zahl
      dort ist kein Schönheitsfehler, sie führt zu falsch getimtem Compact.
      Der Guard `opencode-routes-via-proxy.bats` prüft die Deklaration gegen den **laufenden**
      Server in einem ±20-%-Korridor; die neuen Zahlen müssen also zum tatsächlichen Loadout
      passen (`gemma26-throughput` 118.016, `gemma26-factory` 177.920).

- [x] **Agent-Namen erwägen, nicht automatisch ändern.** Die Subagenten heißen `gptoss` und
      `devstral` — nach Modellen, die sie nicht mehr fahren. Der Name ist aber die
      Aufruf-Schnittstelle des Orchestrators (`"gptoss": "allow"` in der Permission-Liste, ~Z. 497)
      und steht in `docs/agent-guide/registry/agents.yaml` sowie in Skill-Dokumentation.
      Umbenennen ist ein eigener Vorgang mit eigener Prüfung. In diesem Change bleiben die Namen;
      die `description` sagt, welches Modell dahintersteht. Der Widerspruch wird im Proposal
      benannt statt still gelassen.

- [x] **`gemma12-vision` als Agent-Ziel aufnehmen.** 262.144 ctx bei 137–149 tok/s und das
      einzige Modell mit Vision. Als Familien-Subagent nach dem Muster der bestehenden Einträge,
      inklusive Eintrag in der Permission-Liste des Orchestrators — sonst existiert er, ist aber
      nicht dispatchbar.

- [x] **Permission-Liste des deepseek-Orchestrators prüfen** (~Z. 486–498). Sie nennt die
      Familien namentlich. Der neue Eintrag muss dort auftauchen, die bestehenden bleiben (die
      Namen ändern sich ja nicht).
