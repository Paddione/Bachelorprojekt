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
| **ultra** | high **+ `Workflow`-Fan-out statt Einzel-Agent** | sehr groß/parallelisierbar (multi-subsystem Plan/Review): nutze das `Workflow`-Tool (mehrere Agenten + adversariale Verifikation gegen einen **geteilten Interface-Contract**), nicht einen einzelnen Agenten |

### 3. Kontext (passend & KOMPAKT)

Der Subagent hat per Konstruktion **keinen** Kontext — gib alles explizit, aber **verdichtet**:

- **Absoluter Worktree-Pfad:** PFLICHT — beginne JEDEN Subagenten-Prompt mit `cd <WORKTREE_PATH>` (z.B. `cd /tmp/wt-<slug>`). Der Subagent hat sonst keinen impliziten Kontext und schreibt Dateien in sein Fallback-CWD (oft der Haupt-Checkout statt des Worktrees).
- Branch-Name, damit der Subagent weiß, auf welchem Branch er arbeitet.
- Die relevanten **Artefakt-Pfade** (Spec/Plan/Ticket), nicht deren Volltext, wenn er sie selbst lesen kann.
- Bei mehreren Vorstufen-Ergebnissen: **zusammenfassen, nie Roh-JSON dumpen**. (Ein 162k-Zeichen-Prompt ließ
  einen Synthese-Agenten ohne brauchbare Antwort scheitern — die Provisioning-Lehre schlechthin.)
