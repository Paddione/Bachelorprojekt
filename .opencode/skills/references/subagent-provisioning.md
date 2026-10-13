# Subagent-Provisioning — Smart-Routing-Ladder (T900948)

Wenn ein dev-flow-Skill Arbeit an einen frischen Subagenten delegiert, wähle
**nicht** pauschal ein Modell — der **Orchestrator routet jede Partial nach
ihrer Komplexitätsklasse** auf die passende Worker-Schiene.

Leitsatz: **Korrektheit vor Kosten.** Im Zweifel eine Stufe höher.

> **Kanonical-Referenz:** Diese Datei besitzt die Worker-Leiter und die
> Routing-Signale. Der Orchestrator-Prompt
> (`.opencode/prompts/orchestrator.md`) und die Plan-Phasen
> (`dev-flow-plan-phases.md`) verweisen hierher und wiederholen die Leiter
> nicht. Plan-Format-Regeln gehören dagegen nach
> [`plan-quality-gates.md`](./plan-quality-gates.md) und stehen hier nicht.

## 1. Worker-Leiter — live (reale Rails)

| Stufe | Worker | Modell / Rail | Kapazität | Wofür |
|---|---|---|---|---|
| Begrenzt | `qwen35-2b` (`plan-worker-qwen35-2b`) | Qwen3.5-2B-BP auf `:8096`, 4 Slots, ~65536 shared KV | XS/S-Dispatches | **Kleine begrenzte Partials**: Single-File-Edits, Config, Boilerplate mit exakten Ankern |
| Begrenzt (CPU) | `plan-worker-cpu2b` | Qwen3.5-2B-MTP auf `:18199` (CPU, Ryzen 7 5800X3D) | Overflow-Rail | **Überlauf wenn die GPUs voll sind**: gleiche Klasse wie `qwen35-2b`, nur langsamer |
| Standard | `qwen35-4b` (`plan-worker-qwen35`) | Qwen3.5-4B-MTP auf `:8080`, 3 Slots, ~98304 shared KV | S/M-Dispatches, parallele Slots | **Default für Implementierungs-Partials**: klar spezifizierte Multi-File-Änderungen, Testausführung/Reporting, Boilerplate, Doc-Sync |
| Standard (schnell) | `plan-worker-vllm` | Qwen3.5-4B-QUASAR-NVFP4 auf `:8123` (RTX 5070 Ti, 32k ctx) | N Slots, opt-in (`--vllm-slots`, Default aus; Server bis max-num-seqs 10) | **Durchsatz-Alternative zu Standard**: gleiche Komplexitätsklasse wie `qwen35-4b`, höherer Durchsatz; Preflight degradiert still auf 4B/self wenn `:8123` fehlt |
| Schwer | `local` (`plan-worker-self`) | Qwen3.8-27B auf `:1919`, 153600 ctx, 1 Slot (seriell, weitere Requests queuen) | L-Dispatches bis ~120k | **Review / Oracle / Design + übergroße Arbeit**: Debugging mit Urteil, adversariale Review, Reasoning-lastige Meta-Arbeit, Partials die auf `qwen35-4b` zweimal gescheitert sind |
| Eskalation | `exe-muse` | Muse Spark 1.3 Contributor via OpenCode Go, 1M ctx | Cloud-Rail | Nur per Eskalationskette im Orchestrator-Prompt (lokal 2× gescheitert oder Bedarf über lokalem Fenster) |

Die GPUs sind getrennt: `:1919` und `:8080` können je einen Request parallel
bedienen; `:8080` selbst läuft 3 Slots parallel; `:8096` bedient bis zu 4 Sandbox-Slots parallel.
`:8123` (vLLM, 5070 Ti) ist ein eigener Track und teilt sich mit keinem der anderen Rails ein Slot-Budget.

## 2. Geplant — provisorisch, NICHT live

Feintunte **Qwen3.5-Instruct-Worker** (Modellklassen, keine Agent-IDs — der
Orchestrator mappt sie auf reale Agenten, sobald sie live sind):

- **0.8B-Klasse** — nur triviale mechanische Partials (Rename, Lockfile-Bump,
  reine Doc-Syncs ohne Urteilsvermögen).

Bis zur Inbetriebnahme von 0.8B bleibt `qwen35-2b` die Untergrenze für begrenzte Partials und `qwen35-4b` der Standard.

## 3. Routing-Signale — nach Komplexitätsklasse, nie pro Partial annotiert

Der Plan deklariert **keine** Worker-Stufe pro Partial (keine
per-partial Tier-/Kontext-Spalten — entfernt in T900948). Der Orchestrator
klassifiziert jedes Partial zur Dispatch-Zeit anhand dieser Signale:

- **Datei-Menge und -Streuung**: 1 Datei, exakte Anker → leicht; mehrere
  Dateien über Subsystemgrenzen → schwer.
- **S1-Budget-Lage**: Budget ≈ 0 (Split-/Shrink-Pflicht) erhöht die Klasse —
  zeilenneutrales Arbeiten unter Ratchet-Druck braucht Urteil.
- **Rolle**: `impl` Standard vs. `tests` (mechanischer, eher leicht) vs.
  Review/Oracle/Design (immer schwer).
- **Abhängigkeitstiefe**: `depends_on`-Ketten und disjunkte Subsysteme mit
  geteiltem Interface-Contract → schwer (Kontext- und Koordinationslast).

Faustregel: mechanisch + voll spezifiziert + ein Subsystem → `qwen35-4b`;
Multi-File mit Debugging/Urteil, Review, oder S1-Budget ≈ 0 → `local`;
über lokalem Fenster oder zweimal lokal gescheitert → `exe-muse`.
Im Zweifel **eine Stufe höher**.

## 4. Dispatch-Format (Kompaktheit + Budget-Selbstmeldung)

Der Subagent hat per Konstruktion **keinen** Kontext — gib alles explizit, aber
**verdichtet**:

- **Absoluter Worktree-Pfad:** PFLICHT — beginne JEDEN Subagenten-Prompt mit
  `cd <WORKTREE_PATH>`. Sonst schreibt der Subagent in sein Fallback-CWD
  (oft der Haupt-Checkout statt des Worktrees).
- Branch-Name, Artefakt-Pfade (Spec/Plan/Ticket), `budget_tokens`
  (S ~32k / M ~80k / L ~100k — der Orchestrator sizt jedes Paket selbst).
- Bei mehreren Vorstufen-Ergebnissen: **zusammenfassen, nie Roh-JSON dumpen**.

**Kontext-Budget-Selbstmeldung (PFLICHT-Direktive in jedem Prompt)** [T001571]:
> Überwache dein eigenes Kontext-Budget. Bei Anzeichen von Kontext-Überlauf
> (>100 Tool-Calls, viele große File-Reads/CI-Logs, fehlende frühe Details) —
> NICHT weiterarbeiten, sondern sofort stoppen und als finale Nachricht einen
> strukturierten **Handoff-Report** liefern: (1) erledigte Schritte,
> (2) exakter Git-/Datei-Zustand, (3) offene Schritte in Reihenfolge,
> (4) bekannte Fallen. Ein sauberer Handoff ist Erfolg, kein Versagen.

**Orchestrator-Pflichten beim Ersatz:** alten Agenten stoppen, fachfremde
uncommittete Änderungen verwerfen (`git checkout -- <files>`), frischen Agenten
mit kompaktem Lagebild spawnen statt Volltranskript.
