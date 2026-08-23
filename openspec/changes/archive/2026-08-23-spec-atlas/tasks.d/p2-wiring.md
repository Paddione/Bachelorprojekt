---
title: "spec-atlas P2 — Freshness-Verdrahtung + Artefakt"
ticket_id: T015012
domains: [scripts, dev-tooling]
status: planned
---

# spec-atlas — Implementation Plan (P2 Wiring)

_Ticket: T015012 · Partial P2 (implement), depends_on: P1. SSOT-Delta:
MODIFIED „Freshness-Check sichert Konsistenz der generierten Artefakte" in
`specs/openspec-workflow.md` dieses Changes._

## File Structure

| Datei | Ist | Budget | Notiz |
|---|---|---|---|
| `Taskfile.yml` | 5500 | nicht gebaselined; kein `.yml`-Eintrag in `docs/code-quality/gates.yaml` limits → wirksame Schwelle unbegrenzt | Netto-Zuwachs ~+12 Zeilen |
| `docs/spec-atlas.md` | neu (generiert) | kein S1-Betreff (.md nicht limitiert) | Erstes committetes Artefakt, deterministisch |
| `.gitattributes` | klein (nicht gebaselined, keine Limit-Relevanz) | +1 Zeile | merge=ours für das Artefakt |

Disjunkt zu P1 (Scripts) und P3 (Tests) — D1 verletzt keine Partials.

## Kontext-Fakten (verifiziert)

Die Menge „generierte Artefakte" ist an VIER Stellen zu registrieren — der
Guard-Test `tests/spec/ci-cd/generated-artifacts-registry.bats` prüft genau
diese Register gegeneinander [T002686]. Alle vier gehören in diesen Partial:

1. `freshness:regenerate` — welche Generatoren laufen
2. `freshness:check` FILES-Liste — was auf Drift geprüft wird
3. `.gitattributes` — Merge-Schutz (`merge=ours linguist-generated=true`)
4. Der Task selbst

## Tasks

- [ ] **1. Task `openspec:atlas` anlegen.** In `Taskfile.yml` direkt unter dem
      bestehenden Muster (ab Zeile 1219):

      ```yaml
      openspec:atlas:
        desc: "Regenerate docs/spec-atlas.md from openspec/specs + changes archive"
        cmds:
          - bash scripts/openspec-atlas.sh
      ```

- [ ] **2. In `freshness:regenerate` registrieren.** Die `- task:`-Liste am Ende
      des Tasks (Zeile ~1313–1318) erhält nach dem Status-Map-Eintrag:

      ```yaml
      - task: openspec:status-map
      - task: openspec:atlas        # T015012: Spec Atlas — Requirement-Index + Provenance
      ```

- [ ] **3. In die FILES-Liste von `freshness:check` eintragen.** Nach
      `components/website/src/data/openspec-status.json` (Zeile ~1414) kommt
      `docs/spec-atlas.md` dazu. WICHTIG (Kommentar im Taskfile, T002686): die
      Liste wird per Wortsplitting durchlaufen — der Eintrag steht allein auf
      einer Zeile, KEIN Inline-Kommentar daneben.

- [ ] **4. `.gitattributes` ergänzen.** Im Block „Freshness-checked generated
      JSON/data artifacts" (Zeile ~38–43), neben `openspec-status.json`:

      ```gitattributes
      docs/spec-atlas.md                            merge=ours linguist-generated=true
      ```

- [ ] **5. Artefakt erzeugen und committen.**

      ```bash
      export AGENT_LOCK_SID=3487101
      task openspec:atlas
      git add docs/spec-atlas.md && wc -l docs/spec-atlas.md   # Positiv-Anker: > 100 Zeilen
      ```

- [ ] **6. Registry-Guard grün sehen.** Der Vier-Register-Abgleich muss ohne
      Fehlende durchlaufen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/generated-artifacts-registry.bats
      ```

## Verify

```bash
export AGENT_LOCK_SID=3487101
task test:changed && task freshness:regenerate && task freshness:check
```
