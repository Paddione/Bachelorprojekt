---
title: "mishap-t002352 — Implementation Plan"
ticket_id: T002352
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002352 — Implementation Plan

_Ticket: T002352_

Mishap-Bundle: skills/dev-flow-execute, openspec, tasks/freshness (3 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

### Mishap 1: Implementer entfernt den Worktree, bevor der Orchestrator darin archivieren kann — cd-Fallback landet im Hauptcheckout
**Typ:** degraded | **Komponente:** skills/dev-flow-execute

Der Implementer-Subagent räumte am Ende von dev-flow-execute den Worktree .worktrees/mcp-postgres-oom eigenmächtig weg. Der Orchestrator brauchte ihn danach noch für die OpenSpec-Archivierung (Skill-Schritt 7.5) und lief ins Leere.

Verschärfend war die Kommandoform des Orchestrators:

    cd <worktree> && git checkout -q main || git checkout -q -B archive/<slug> origin/main

Bei fehlgeschlagenem `cd` läuft der Fallback im *aktuellen* Verzeichnis weiter — hier im Hauptcheckout ~/Bachelorprojekt. Der legte dort einen Branch archive/mcp-postgres-oom an. CLAUDE.local.md verbietet mutierende Chores im Hauptcheckout ausdrücklich (T001880: so sammelten sich ~26 unkommittierte OpenSpec-Archivierungen auf main an). Der Zustand wurde sofort zurückgesetzt (checkout main, branch -D) und die Archivierung in einem frischen Worktree gefahren; es entstand kein bleibender Schaden.

Zwei Lehren:
1. Die Worktree-Cleanup-Verantwortung ist zwischen Implementer und Orchestrator nicht geklärt. dev-flow-execute Schritt 7.5 nennt den Cleanup als Orchestrator-Schritt, der Implementer-Prompt erwähnt ihn nicht — der Implementer macht ihn trotzdem.
2. `cd X && cmd || fallback` ist in dieser Codebasis eine Falle. Richtig ist `cd X || exit 1` als eigener Guard, damit ein fehlgeschlagenes cd nicht stillschweigend im falschen Verzeichnis weiterläuft.

---

### Mishap 2: openspec archive kippt SSOT-Tests, die per Substring über das ganze Spec-Dokument greppen
**Typ:** suspicious | **Komponente:** openspec

Beim Archivieren von mcp-postgres-oom kippte ein bis dahin grüner Test von grün auf rot, ohne dass sich am geprüften Sachverhalt etwas geändert hätte.

Test 28 in tests/spec/mcp-gateway.bats prüfte: "openspec/specs/mcp-gateway.md enthält nirgends 'dekommissioniert|decommissioned'". Beim Archivieren merged openspec.sh das Delta in den SSOT — und der GIVEN-Text des archivierten Scenarios lautet "...trug die Notiz, der Monolith sei dekommissioniert, während...". Das Wort landet also durch die *Beschreibung des behobenen Zustands* wieder im Dokument.

Ein Substring-Grep über ein ganzes Spec-Dokument kann eine Behauptung nicht von ihrer historischen Erwähnung unterscheiden. Behoben in PR #3398: der Test blendet jetzt #### Scenario:-Blöcke aus und prüft nur normative Prosa.

Bemerkenswert am Fix-Verlauf: der erste Filterversuch beendete Scenario-Blöcke erst bei der nächsten #-Überschrift und verschluckte damit den gesamten Dateirest nach dem letzten Scenario — der Test wäre unbemerkt dauerhaft grün gewesen. Aufgefallen nur durch eine explizite Negativ-Probe (Wort in normative Prosa einfügen, Rot erwarten).

Lehre als Konvention: Tests, die ein SSOT-Dokument auf Abwesenheit eines Begriffs prüfen, müssen Scenario-Blöcke ausnehmen — sonst sind sie nach dem Archivieren des zugehörigen Changes garantiert rot. Und jeder Abwesenheits-Test braucht eine Negativ-Probe, sonst ist "grün" nicht von "prüft nichts" unterscheidbar.

---

### Mishap 3: freshness:check meldet "stale" für soeben regenerierte, aber uncommittete Artefakte
**Typ:** suspicious | **Komponente:** tasks/freshness

Beobachtet beim Archivierungs-Commit für T002321:

    $ task freshness:regenerate
    openspec-status-map: wrote .../website/src/data/openspec-status.json
    ✓ 96 goals → .../goals-data.generated.json
    $ task freshness:check
    ✗ website/src/data/openspec-status.json is stale — run 'task freshness:regenerate' locally and commit
    ERROR: 1 generated artifact(s) are stale

Der Check vergleicht gegen den committeten Stand, nicht gegen das Arbeitsverzeichnis. Die Meldung ist korrekt (der Commit fehlt tatsächlich noch), liest sich aber wie ein fehlgeschlagenes regenerate — man läuft leicht in eine Schleife aus regenerate/check, statt zu committen. Nach `git commit` ist der Check sofort grün.

Milderung: Die Fehlermeldung könnte den Fall unterscheiden. Wenn die Datei im Arbeitsverzeichnis aktuell, aber uncommitted ist, wäre "regenerated but not committed — run 'git add <datei>'" die zutreffende Aussage. Der jetzige Text nennt regenerate zuerst und den Commit nur nachgestellt.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [x] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
