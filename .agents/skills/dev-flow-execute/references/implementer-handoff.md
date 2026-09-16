# Implementer-Handoff — dev-flow-execute Schritt 2 (Detail)

Auftrags-Runbook für den frischen Implementer-Subagenten. Der Orchestrator übernimmt den
Abschnitt „Auftrag" wörtlich in den Subagenten-Prompt.

## Spawn-Matrix je Harness

Spawne den Subagenten, provisioniert gemäß [subagent-provisioning](.agents/skills/references/subagent-provisioning.md):

* **Gemini/Antigravity CLI:** call `invoke_subagent` with `TypeName: "self"` (inherits permissions and tools), `Role: "Implementer <TICKET_ID>"`, and `Workspace: "share"` (or `"inherit"`).
* **Claude Code CLI:** nativer Subagenten-Dispatch, `general-purpose` — Modell nach Plan-Charakter (Default `sonnet`; mechanisch `haiku`, komplex/riskant `opus`), Effort per Prompt-Direktive.
* **opencode:** `background-agents.ts`-Plugin: `delegate(prompt, agent="researcher")` für read-only Subagenten oder die native write-capable Delegation. Worktree-`cd`-Pflicht und Effort-Formulierungen: Reference (SSOT).

Kein Per-Task-Fan-out über `superpowers:subagent-driven-development`: diese Skill läuft oft
schon als delegierte Ebene, verschachtelte Delegation sprengt den Kontext (162k-Prompt-Lehre,
[subagent-provisioning](.agents/skills/references/subagent-provisioning.md)). Der Implementer ruft
`superpowers:executing-plans` **in-context** auf. Fan-out nur als bewusste Eskalation, wenn viele
unabhängige Tasks den Einzel-Implementer ans Kontext-Limit bringen.

## Kontext-Injektion (PFLICHT — der Subagent hat sonst KEINEN Kontext)

Kompaktheits-Regeln: subagent-provisioning §3.

- Plan-Datei `$PLAN_FILE` (aus Schritt 1, via DB aufgelöst) + Ticket-ID.
- Attachment-Verzeichnis `$ATTACHMENT_DIR` — bei UI-Arbeit ALLE Bilder/Texte mit dem `Read`-Tool einlesen.
- **Plan Intel Bundle (Optional):** `bash scripts/task-context.sh <slug>` liefert den Kern aus `intel.json` plus frische Signale. Format: [plan-intel-bundle](.agents/skills/references/plan-intel-bundle.md). Fehlt es, ist das kein Blocker.

## BATS-Pflicht

Neue `@test`-Einträge gehören in `tests/spec/<spec-slug>.bats` — die OpenSpec-Spec, die das
Verhalten abdeckt. Existiert die Datei nicht, anlegen (Vorlage: `tests/spec/software-factory/`);
ohne klare Spec-Zuordnung `tests/unit/` erweitern. Ticket-nummerierte Dateien (`FA-SF-42.bats`)
sind Legacy und werden **nicht** neu angelegt.
Details: [dev-flow-execute-phases](.agents/skills/references/dev-flow-execute-phases.md) §BATS.

## Auftrag (wörtlich Teil des Implementer-Prompts)

- **Ein-Ebenen-Regel (PFLICHT, wörtlich Teil dieses Prompts):** Spawne selbst KEINE Subagenten/Sub-Implementer — rufe `superpowers:executing-plans` IN-CONTEXT auf. Brauchst du einen Sub-Implementer, STOPPE und eskaliere an den Orchestrator zurück. Verschachtelte Delegation ist nicht erlaubt.
- **SID-Propagation (PFLICHT, T006365):** Ermittle deine Session-SID mit `bash scripts/agent-lock.sh mine` und weise den Implementer an, in jedem Bash-Call zuerst `export AGENT_LOCK_SID=<deine-sid>` auszuführen — sonst blockiert der Worktree-Write-Guard seine Edit/Write-Tools im geclaimten Worktree.
- **/goal: Finish dev-flow-execute and merge the PR cleanly.**
- *Feature:* Rufe `superpowers:executing-plans` (opencode: inlinede Steps in `dev-flow-execute`) + `test-driven-development` (opencode: `vitest/SKILL.md`) auf und arbeite den Plan vollständig ab. Nach jedem Meilenstein Checkbox im Plan abhaken (`- [ ] M1` → `- [x] M1`), committen, pushen.
- *Fix:* Zuerst verifizieren, dass ein failing Test existiert, dann Rot-Grün bis grün.
- **PFLICHT vor PR-Erstellung — Freshness-Artefakte regenerieren und committen** (sonst CI "stale artifact"; `finishing-a-development-branch` überspringt das). Befehle + Artefakt-Pfadliste (SSOT): [verification-block](.agents/skills/references/verification-block.md) — der Subagent MUSS die Datei lesen und den `git add`-Block daraus verwenden.
- **Hintergrund-Monitore für lange Test-Runs verboten [T001969 Mishap 1].** Lange Läufe synchron mit Timeout ausführen (`timeout 600 task test:changed`), nicht auf einen Monitor-Loop warten.
- Erstelle einen PR (OHNE Auto-Merge-Anforderung — die folgt nach dem Code-Review-Gate, Schritt 3.8).
- **ENDE (T002365):** Ergebnis zurückmelden. Review-Gate, CI-Fix-Schleife, Merge-Wait, Abschluss und Archivierung laufen im Orchestrator. **Der Worktree wird NICHT von dir entfernt** (T002352-M1). Der Orchestrator fährt bei Schritt 3.8 fort — nicht Schritt 8.
