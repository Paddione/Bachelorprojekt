---
ticket_id: T001612
plan_ref: openspec/changes/agent-guide-harness-badge/tasks.md
status: active
date: 2026-07-09
---

# Agent-Guide-Sidekick: Harness-Badge + opencode-Start-Affordance — Design

## Angenommene Entscheidungen (autonom getroffen, bitte gegenlesen)

Dieser Plan wurde ohne interaktives Brainstorming mit dem User erstellt (Hintergrund-Agent,
Lavish-Board bewusst übersprungen — kein Browser für einen Hintergrund-Agenten sinnvoll). Die
folgenden Design-Entscheidungen wurden autonom getroffen und sollten vor der Umsetzung
gegengelesen werden:

1. **Ticket-Prämisse #2 ist teilweise veraltet.** Das Ticket beschreibt, die 4 neuen
   opencode-Skills hätten "kein `init_prompt_de`". Das stimmt nicht mehr: Commit `1e114fc14`
   (Teil von T001611, gemergt 2026-07-04) hat `init_prompt_de` für alle 4 opencode-Skills
   bereits nachgetragen (natürlichsprachige Trigger-Formulierungen statt Claude-Slash-Syntax,
   z. B. `"Lade opencode-git-workflow – ich brauche Git-Operationen in einer OpenCode-Session."`).
   Der "Prompt kopieren"-Button existiert also bereits für diese Karten.
   **Der tatsächlich verbleibende Gap:** `GuideCard.svelte` beschriftet diesen Button
   **hart codiert** mit `"In Claude Code einfügen"` (Zeilen 227 + 231), unabhängig vom
   `harness`-Feld des Tools — für die 4 opencode-Skills ist das eine irreführende Beschriftung
   (der Prompt ist für eine opencode-Session gedacht, nicht für Claude Code). Scope von
   Gap #2 wird daher umdefiniert: **Label/Sektionsüberschrift harness-bewusst machen**, nicht
   fehlenden `init_prompt_de` nachtragen.
2. **`harness` bleibt ein Tool-Attribut, keine Goal-Eigenschaft.** In der Registry
   (`docs/agent-guide/registry/tools.yaml`) tragen ausschließlich `tools[]`-Einträge ein
   `harness`-Feld (`claude`/`opencode`/`both`); `goals[]` (Ziele/Flows) haben keins, weil ein
   Ziel-Flow mehrere Tools über beide Harnesses hinweg verketten kann. Harness-Badge und
   -Filter gelten daher nur für **Tool-Karten** (`kind: 'skill'|'agent'|'task'`), nicht für
   Ziel-Karten. Ziel-Karten werden vom Harness-Filter **nie ausgeblendet** (sie passen
   „immer", da sie kein Harness-Attribut tragen).
3. **Alle 20 aktuellen Tools sind bereits mit `harness` getaggt** (`validate.mjs` erlaubt
   `harness` zwar als optional, aber jedes der 20 `tools[]`-Einträge hat es gesetzt: 7×
   `claude`, 9× `both`, 4× `opencode`). `emit-webapp.mjs` muss trotzdem robust gegen ein
   künftig fehlendes `harness`-Feld sein → Fallback `t.harness ?? 'both'` beim Emittieren
   (kein harter Fehler wie bei fehlendem `kind`).
4. **Badge-Darstellung: nur bei `claude` und `opencode` sichtbar, nicht bei `both`.**
   Ein "Beide"-Badge auf 9 von 20 Karten wäre visuelles Rauschen ohne Informationsgehalt
   (die meisten Karten funktionieren harness-übergreifend — das ist der Normalfall, keine
   Ausnahme). Badge erscheint nur, wenn ein Tool an genau einen Harness gebunden ist
   (`claude` → Badge "Claude Code", `opencode` → Badge "opencode").
5. **Filter-Semantik: Set-basiert, leer = alle, analog zum bestehenden Gefahrenstufen-Filter.**
   `harnessFilter: Set<'claude'|'opencode'>` in `AgentGuideView.svelte`, exakt wie
   `tierFilter`. Zwei Toggle-Buttons ("Claude Code", "opencode") in `GuideFindBar.svelte` —
   **kein dritter Button für "both"**, weil `both`-Tools ohnehin bei jedem aktiven Filter
   sichtbar bleiben (sie matchen beide Harnesses). Ein Tool ist sichtbar, wenn
   `harnessFilter.size === 0 OR entry.harness === undefined OR entry.harness === 'both' OR
   harnessFilter.has(entry.harness)`.
6. **Keine neue Gruppierungs-Achse ("Art"-Achse bleibt unangetastet).** Das Ticket verlangt
   explizit nur "Badge + Filter, analog zum Gefahrenstufen-Filter" — keine vierte
   Gruppierungs-Achse (`axis: 'harness'`) neben `thema`/`gefahr`/`art`. Bewusste
   Scope-Begrenzung, um `groupBy()` und die drei bestehenden Achsen-Buttons nicht
   aufzublähen.
7. **Schnellstart-Leiste (`AgentGuideView.svelte` Zeilen 292–310, Label "⚡ Schnellstart /
   Für Claude") bleibt unverändert.** Sie ist eine kuratierte, hardcodierte Auswahl
   ausschließlich `harness: claude`-getaggter Skills (`superpowers`, `brainstorming`,
   `dev-flow-plan`) und nicht Teil des generischen Karten-Renderings. Das Ticket nennt sie
   nicht; eine Erweiterung um ein opencode-Pendant wäre Scope-Creep dieses eng gefassten
   Fast-Follows.
8. **Label-Matrix für den Init-Prompt-Bereich in `GuideCard.svelte`:**
   - `harness === 'claude'` → Sektionsüberschrift "In Claude Code einfügen" (unverändert,
     bestehendes Verhalten für die Mehrheit der Karten).
   - `harness === 'opencode'` → Sektionsüberschrift "In opencode einfügen" (neu).
   - `harness === 'both' | undefined` → harness-neutrale Sektionsüberschrift "Prompt
     einfügen" (neu — ersetzt die bisher pauschale "In Claude Code einfügen"-Beschriftung
     für harness-übergreifende Tools wie `task-oracle`, `agent-website` etc., die
     bislang implizit "nur für Claude Code" suggerierte, obwohl sie auch in opencode
     funktionieren).
   Der Copy-Button-Text selbst bleibt kurz ("Kopiert ✓" / passende Kurzform je Zustand),
   nur die Sektionsüberschrift + Button-Label wird harness-bewusst.
9. **Kein echter Live-Dispatch.** Wie im Ticket explizit ausgeschlossen: nur Copy-Paste- /
   Beschriftungs-Änderungen, kein neuer Web-Request-getriebener Agent-Trigger.

## Ausgangslage

`website/src/components/assistant/AgentGuideView.svelte` (+ `GuideMap.svelte`,
`GuideCard.svelte`, `GuideGroup.svelte`, `GuideFindBar.svelte`) ist die bereits bestehende
interaktive Agent-Guide-Sidekick-UI (Portal-Sidekick-Panel). Sie rendert Ziel- und
Tool-Karten aus `website/src/lib/agent-guide.generated.json`, das
`scripts/agent-guide/emit-webapp.mjs` aus `docs/agent-guide/registry/*.yaml` erzeugt.

T001611 (harness-workflow-split, gemergt) hat der Registry ein `harness`-Feld pro Tool
hinzugefügt (`claude`/`opencode`/`both`), dieses Feld aber bewusst NICHT nach `emit-webapp`
durchgereicht ("webapp churn begrenzen"). Die UI kann daher aktuell weder nach Harness
filtern noch ein Harness-Badge zeigen, obwohl das Backend die Info hat.

## Ziel dieses Fast-Follows

1. `harness` von der Registry bis in die UI durchreichen (Emitter → Typ → Suchindex →
   Badge + Filter).
2. Die Init-Prompt-Sektion in `GuideCard.svelte` harness-bewusst beschriften, statt
   pauschal "In Claude Code einfügen" zu zeigen (siehe Annahme #8).

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `scripts/agent-guide/emit-webapp.mjs` | `harness: t.harness ?? 'both'` in die `tools[]`-Projektion aufnehmen (Zeile ~71–91) |
| `scripts/agent-guide/emit-webapp.test.mjs` | Test: `harness` landet im emittierten Tool-Objekt; Fallback `both` bei fehlendem Feld |
| `website/src/lib/agentGuide.ts` | `Tool`-Interface: `harness: 'claude' \| 'opencode' \| 'both';` |
| `website/src/lib/agentGuideSearch.ts` | `GuideEntry`-Interface: `harness?: 'claude' \| 'opencode' \| 'both';`; `buildEntries()` setzt es für Tool-Entries aus `t.harness`, lässt es bei Goal-Entries `undefined` |
| `website/src/lib/agentGuideSearch.test.ts` | Test: `buildEntries()` überträgt `harness` korrekt für Tools, lässt es bei Goals weg |
| `website/src/components/assistant/agent-guide/GuideFindBar.svelte` | Neue Harness-Filter-Rail (zwei Toggle-Buttons "Claude Code" / "opencode"), analog zur Tier-Rail; neue Props `harnessFilter`, `harnessCounts`, `onToggleHarness` |
| `website/src/components/assistant/AgentGuideView.svelte` | `harnessFilter`-State (Set, leer=alle), `harnessCounts`-Derivation, Einbindung in `preFiltered`-Filterprädikat, Weiterreichen an `GuideFindBar` |
| `website/src/components/assistant/agent-guide/GuideCard.svelte` | Harness-Badge im Card-Head (nur bei `harness==='claude'\|'opencode'`, nicht bei `both`); harness-bewusstes Label für die Init-Prompt-Sektion (Annahme #8) |

## Nicht betroffen (bewusst außerhalb des Scopes)

- `docs/agent-guide/registry/tools.yaml` — `harness`-Daten sind bereits vollständig gepflegt (T001611).
- `GuideMap.svelte`, `GuideGroup.svelte` — keine Harness-Darstellung auf der Flow-/Territory-Karte oder in Gruppen-Headern.
- `AgentGuideView.svelte` Schnellstart-Leiste (Annahme #7).
- Live-Dispatch / echter Agent-Trigger aus dem Portal (Annahme #9).
