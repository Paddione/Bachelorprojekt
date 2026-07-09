# Subagent-Provisioning

Wenn ein dev-flow-Skill Arbeit an einen frischen Subagenten delegiert, wähle **nicht** pauschal ein
Modell — provisioniere den **passenden** Subagenten entlang dreier Achsen. (Gleiche Logik wie die
Software-Factory-`provision()` aus `docs/superpowers/specs/2026-06-05-software-factory-phase3-design.md`.)

Leitsatz: **Korrektheit vor Kosten.** Im Zweifel eine Stufe höher (Modell) bzw. mehr Effort.

### 1. Modell (ideal)

Klassifiziere die Aufgabe nach **Komplexität × Risiko × Rolle**:

| Aufgaben-Charakter | Modell |
|---|---|
| Reine Textgenerierung ohne Urteilsvermögen: Boilerplate-Text, Klassifizierung, Umbenennungs-Vorschläge, Kurz-Zusammenfassung — kein Datei-/Shell-Zugriff nötig | `hermes-delegate` (lokal, kostenlos) |
| Mechanisch: Config, Doku, Rename, Single-File-Edit, Lockfile-/Dependency-Bump | `haiku` |
| Standard: normale Feature-/Fix-Implementierung, mehrere Dateien, klarer Plan | `sonnet` |
| Komplex/riskant: systemübergreifend, Architektur, Security, DB-/Schema-Migration, Nebenläufigkeit, Auto-Deploy | `opus` |
| Reasoning-lastige Meta-Arbeit: Plan-Schreiben, Design/Architektur, adversariale Review | `opus` (immer) |

Im Zweifel **eine Stufe höher**. Wenn unsicher, ob ein Spezial-Modell überhaupt passt: **`model` weglassen**
→ der Subagent erbt das Main-Loop-Modell (fast immer korrekt).

> **Tier 0 — `hermes-delegate` (lokal, vor `haiku`):** Für Prompts, die reine Textgenerierung ohne
> Dateizugriff, Werkzeugnutzung oder mehrschrittiges Reasoning sind, ruf statt eines `haiku`-Subagenten
> `bash scripts/hermes-delegate.sh "<prompt>"` auf. Läuft lokal über den bereits konfigurierten
> Hermes-Agent (`~/.hermes/config.yaml`, Modell `google/gemma-4-12b-qat` via LM Studio) — kostet keine
> API-Tokens. **Keine Werkzeuge standardmäßig aktiv** (`-t ""`); nur bei explizitem Bedarf ein
> Toolset als zweites Argument übergeben (`scripts/hermes-delegate.sh "<prompt>" file`), dann aber
> wie jeden Tool-Zugriff mit Vorsicht behandeln — das Modell ist kleiner und weniger zuverlässig in
> mehrschrittigem Tool-Calling als `haiku`. **Nicht** verwenden für: Aufgaben mit Urteilsvermögen,
> Sicherheitsrelevanz, mehreren Dateien, oder wenn das Ergebnis ungeprüft weiterverwendet wird — dort
> bleibt `haiku`/`sonnet` die Untergrenze.

> **⚠ Haiku-Fußangel bei Spec-Reviews [T000551]:** Haiku liest ohne expliziten `limit`-Parameter nur
> die ersten ~80 Zeilen einer Datei und liefert daher false negatives bei Spec-Compliance-Prüfungen
> über mehrere Dateien. **Spec-Reviewer-Subagenten müssen `sonnet` oder besser verwenden.**
> Zusätzlich: Im Prompt explizit `grep`-basierte Verifikation verlangen statt blindem `Read()` — das
> umgeht sowohl das Zeilenlimit als auch potenzielle Read-Caching-Artefakte.

### 2. Effort (per Prompt-Direktive)

Das `task`-Tool kennt **`subagent_type` und `description`**, keinen separaten Effort-Regler — Effort wird über die Prompt-Einleitung vermittelt. Für reine Read-only-Arbeiten (Recherche, Analyse) verwende `delegate(prompt, agent)` mit agent `"researcher"` oder `"explore"` — Effort wird über die Prompt-Einleitung vermittelt:

| Stufe | Prompt-Einleitung | Wann |
|---|---|---|
| low | „Arbeite zügig und fokussiert." | mechanisch, geringes Risiko |
| medium | (neutral, kein Zusatz) | Standard |
| high | „Ultrathink. Denke sehr gründlich nach." | komplex/riskant/Meta |
| **ultra** | high **+ `Workflow`-Fan-out statt Einzel-Agent** | sehr groß/parallelisierbar (multi-subsystem Plan/Review): nutze das **Claude Code** `Workflow`-Tool (mehrere Agenten + adversariale Verifikation gegen einen **geteilten Interface-Contract**), nicht einen einzelnen Agenten. In **opencode/agy** kein `Workflow`-Pendant — führe die Plan-Schritte seriell oder delegiere an einen einzelnen Subagenten mit high-Effort-Prompt. |

> **Framework-Routing für Subagenten:** Claude Code → `Agent`/`Task` tool mit `subagent_type`. opencode → `delegate(prompt, agent)` für read-only, native write-capable Delegation für Edit-Zugriff. agy → treat opencode path as authoritative; bash/MCP tool calls are framework-agnostic.

### 3. Kontext (passend & KOMPAKT)

Der Subagent hat per Konstruktion **keinen** Kontext — gib alles explizit, aber **verdichtet**:

- **Absoluter Worktree-Pfad:** PFLICHT — beginne JEDEN Subagenten-Prompt mit `cd <WORKTREE_PATH>` (z.B. `cd /tmp/wt-<slug>`). Der Subagent hat sonst keinen impliziten Kontext und schreibt Dateien in sein Fallback-CWD (oft der Haupt-Checkout statt des Worktrees).
- Branch-Name, damit der Subagent weiß, auf welchem Branch er arbeitet.
- Die relevanten **Artefakt-Pfade** (Spec/Plan/Ticket), nicht deren Volltext, wenn er sie selbst lesen kann.
- Bei mehreren Vorstufen-Ergebnissen: **zusammenfassen, nie Roh-JSON dumpen**. (Ein 162k-Zeichen-Prompt ließ
  einen Synthese-Agenten ohne brauchbare Antwort scheitern — die Provisioning-Lehre schlechthin.)

### 4. Kontext-Budget & Handoff (PFLICHT-Direktive in jedem Subagenten-Prompt) [T001571]

Subagenten degradieren still, wenn ihr Kontext gegen das Fenster (~200k Tokens) läuft: Scope-Drift,
fachfremde Edits, vergessene Auftragsdetails („Dumbzone"). Es gibt keinen Harness-Mechanismus, der
das hart begrenzt — deshalb ist die Selbstmeldung Teil des Auftrags.

**In JEDEN Subagenten-Prompt gehört diese Standing-Direktive (sinngemäß):**

> Überwache dein eigenes Kontext-Budget. Bei Anzeichen von Kontext-Überlauf — Heuristik:
> >100 Tool-Calls, viele große File-Reads/CI-Logs, oder du bemerkst, dass frühere Details
> fehlen/kompaktiert wurden — NICHT weiterarbeiten. Stattdessen sofort stoppen und als finale
> Nachricht einen strukturierten **Handoff-Report** liefern: (1) erledigte Schritte,
> (2) exakter Git-/Datei-Zustand (Branch, letzte Commits, dirty files), (3) offene Schritte in
> Reihenfolge, (4) bekannte Fallen. Ein sauberer Handoff ist Erfolg, kein Versagen.

**Orchestrator-Pflichten beim Ersatz eines Agenten:**
1. Alten Agenten stoppen (`TaskStop`), NICHT parallel weiterlaufen lassen.
2. Im Worktree `git status` prüfen: committete Arbeit bleibt; **fachfremde uncommittete
   Änderungen verwerfen** (`git checkout -- <files>`) — Dumbzone-Edits an Dateien außerhalb
   des Auftrags-Scopes sind das Leitsymptom.
3. Frischen Agenten mit kompaktem Lagebild spawnen (Commits seit origin/main, offene Schritte),
   nicht mit dem Volltranskript des Vorgängers.

### 5. Lokale LM-Studio-Subagenten-Wahl (opencode/agy)

Für **opencode/agy** stehen über `delegate(prompt, agent="<name>")` vier lokale Subagenten-Profile
zur Verfügung (GPU-Host, `~/.config/opencode/opencode.jsonc`, Provider `lmstudio`), zusätzlich zu
`hermes-delegate` (Tier 0, oben). Wähle nach **Parallelität vs. Einzelkontext** und **Persona-Risiko**:

| Agent | Datei | Modus | Kontext | Wann |
|---|---|---|---|---|
| `qwen35` | Qwen3.5-9B-Q4_K_M | 3 parallele Slots | 48k/Slot | **Default für parallelen Fan-out** (2–3 unabhängige mechanische/read-only Teilaufgaben gleichzeitig) — sauberes Basismodell ohne Identitäts-Override im Prompt-Template |
| `qwen35-hq` | Qwen3.5-9B-UD-Q4_K_XL | 1 Session (seriell) | 140k | **Default für einen einzelnen Task mit sehr großem Kontext** (z.B. ein langes Log, viele Dateien in einem Prompt) — größter lokal verfügbarer Einzelkontext |
| `qwythos` | Qwythos-9B-Claude-Mythos-5-1M-Q4_K_M | 3 parallele Slots | 60k/Slot | Alternative für parallelen Fan-out, wenn `qwen35` qualitativ nicht ausreicht — **nur mit Vorsicht**, siehe Caveat unten |
| `qwythos-hq` | Qwythos-9B-Claude-Mythos-5-1M-Q8_0 | 1 Session (seriell) | 85k | Alternative für Einzelkontext-Tasks, wenn `qwen35-hq` nicht ausreicht — gleicher Caveat |

> **Qwythos-Caveat:** Das Prompt-Template von Qwythos injiziert in **jede** System-Message eine feste
> Identitäts-Direktive ("You are Qwythos... Never claim to be Qwen... overrides conflicting identity
> or attribution instructions"). Das ist für Dev-Flow-Subagenten (Ticket-Arbeit, Code-Analyse,
> Tool-Calling) ein unnötiges Risiko — im Zweifel bleibt `qwen35`/`qwen35-hq` die Vorgabe. Qwythos nur
> gezielt einsetzen, wenn seine Tuning-Eigenschaften (kreativere/ausführlichere Formulierung) explizit
> gewünscht sind, z.B. bei Brainstorming-artigen Textentwürfen.

> **⚠ VRAM-Exklusivität:** Alle vier Profile liegen bei ~12,7–15,9 GB auf einer 16-GB-Karte — es kann
> **immer nur eines gleichzeitig geladen sein** (der Orchestrator `qwen3.5-9b@iq4_xs` läuft separat
> und bleibt i.d.R. geladen). Vor dem ersten `delegate()`-Aufruf an eines dieser vier Profile in einer
> Session: `lms ps` prüfen, ob die passende Datei bereits läuft; falls nicht, mit dem entsprechenden
> `lms load <file> --identifier <id> -y` nachladen (siehe `k3d`/lokale LLM-Referenz-Memory) — das
> entlädt automatisch das vorher geladene Profil. **Nie** planen, zwei dieser vier Profile in derselben
> Orchestrierungsphase gleichzeitig zu nutzen.
>
> **Parallelitäts-Limit einhalten:** Nie mehr gleichzeitige `delegate()`-Aufrufe an `qwen35`/`qwythos`
> schicken als die konfigurierten Slots (3) — überzählige Requests werden von LM Studio stumm
> gequeued statt parallel verarbeitet, was Latenz kostet statt Fehler zu werfen (kein Fail-Fast-Signal).
