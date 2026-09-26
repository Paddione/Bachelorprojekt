# ADR-009: Brain 3-Layer-Architektur + Auto-Docs-Removal

**Status:** Final (Scope abgenommen 2026-09-26, Questionnaire `brain-3layer-v1`)
**Datum:** 2026-09-26 · Ticket: T900447
**Entscheidungssession:** Grilling 2026-09-26 (dev-flow-plan Schritt −3)

## Kontext — Befunde

Vermessen 2026-09-26 (Repo-Stand, keine Annahmen):

1. **K1/K3 sind NICHT merge-frisch.** `core.hooksPath` ist in diesem Clone nicht
   gesetzt (kein Hook läuft); selbst wenn: `post-commit-index`/`index-repo.ts`
   nehmen nur Code-Extensions (`.md` abgewiesen, Tabelle `code_embeddings`),
   `post-commit-embed` bettet nur `openspec/changes/<slug>/` ein (keine
   `openspec/specs/`), `post-merge` macht nur `freshness:regenerate`. Kein
   CI-Workflow referenziert `index-repo`, `openspec-embed` oder
   `index_repository`. Der K3-Graph (97k Nodes/228k Edges, Status ready) ist ein
   manueller Snapshot ohne Auto-Trigger.
2. **K4 ist zu 83 % Spec-Spiegel.** Worklist: 173 Quellen, 3,6 MB — davon
   `ssot-specs` 129 Dateien / 83 % der Bytes. Ein `--from-scratch`-Lauf ist
   praktisch ein Spec-Reingest.
3. **Auto-Docs-Maschinerie:** `build-docs.yml`, `freshness-regen.yml`,
   `brain-merge-hook.yml`, `scripts/docs-gen/` (~30 Dateien),
   `k3d/docs-content-built/` (HTML-Artefakte), Tasks `freshness:*` + `docs:*`.
4. **Tragweite:** `task docs:deploy` betreibt zwei öffentliche Prod-Sites
   (`https://docs.korczewski.de`, `https://docs.mentolder.de`).
   Freshness-Artefakte (`repo-index.json`, `test-inventory.json`,
   `openspec-status.json` u.a.) sind Gate-Input (Quality-Gates, Plan-Preflight,
   E2E-Auswahl), keine Lesedoku.

## Entscheidung

| # | Punkt | Stand |
|---|-------|-------|
| 1 | **Graph = Präzisionsschicht**, Refresh automatisiert (keine manuellen Snapshots) | beschlossen |
| 2 | **Embeddings = Roh-Recall** über Code + Specs + Docs, merge-getrieben, ohne Kuratierung | beschlossen |
| 3 | **K4-Spiegel abschaffen**; kleiner autorisierter Kern (ADRs, Runbooks, Gotchas, Karten), erfasst zum Entstehungszeitpunkt | beschlossen |
| 4 | **Auto-Docs-Erzeugung entfernen** inkl. ihrer Doku | beschlossen (Details in Q1–Q3 geklärt) |
| 5 | **Vorgehen:** dieses ADR + Zerlegung in N Changes, jeder durch den normalen dev-flow-plan-Pfad | beschlossen |
| 6 | docs.*.de-Sites + Deploy-Pipeline stilllegen (k8s-Manifeste drin, DNS-Einträge draußen) | beschlossen (Q1) |
| 7 | Paddione/brain archivieren: Repo-Pipeline entfernen, authored Kern nach docs/, Archiv-Klick = Owner-Akt | beschlossen (Q2) |
| 8 | Gate-Artefakte bleiben als Gate-Input (kein Lesedoku-Removal; Feinschnitt in Planung) | beschlossen (Q3) |

## Scope-Vertrag (abgenommen 2026-09-26)

**Drin:** dieses ADR; Changes (a) K1-CI-Embeds (merge-getriebene Roh-Embeds für
Code + Specs + Docs), (b) K3-Auto-Refresh (Graph ohne manuelle Snapshots),
(c) K4-Surgery (ssot-specs aus Manifest, Prune der Spec-Seiten, authored Kern
nach docs/, brain-mcp-Anpassung, Cockpit-Verweis-Rückbau), (d) Auto-Docs-Removal
(build-docs.yml, freshness-regen.yml im Lesedoku-Anteil, brain-merge-hook.yml,
scripts/docs-gen/, docs-content-built/, k3d/docs.yaml, docs:deploy, zugehörige
Doku), (e) Agent-Routing-Doku (Schichtwahl), (f) Eval-Baseline. Inkl. SSOT-Deltas
(brain-*, sdlc-cockpit u.a.) und Guards-Anpassung (bats).
**Draußen:** Folge-Specs, Laufzeit-Code der Marken, Paddione/brain-Archiv-Klick
(Owner-Akt), DNS-Einträge docs.*.de, Gate-/Plumbing-Artefakte (repo-index,
test-inventory, openspec-status, agent-guide.generated, spec-atlas) und ihre
Generatoren.
**Done-means:** alle Changes gemergt; genannte Workflows/Generatoren/Artefakte/
Wiki-Seiten entfernt; keine hängenden Links auf entfernte Ziele;
`task test:changed` + `freshness:check` grün; K1-Embeds + K3-Graph nachweislich
merge-frisch (Kriterium je Change).
**Staged:** jeder Change braucht einen eigenen dev-flow-plan-Durchlauf; die
ADR-Abnahme genehmigt keine Implementierung.

## Offene Fragen

- Q1–Q3: entschieden. Scope-Abnahme: erteilt (Chat 2026-09-26).

## Konsequenzen

- **Gewonnen:** Full-Reingest-Kosten entfallen; K1/K3 mit Frische-Garantie; keine
  Cross-Repo-Pipeline; kleinere Driftfläche.
- **Gekostet:** docs.*.de offline (Doku nur noch im Repo lesbar); ~350 Wiki-Seiten
  + MOCs gelöscht; Cockpit-Kontextslot verliert Brain-Verweise (bis Ersatz im
  K4-Change); Paddione/brain-Archivierung als Owner-Akt fällig.
- **Risiken:** `index-repo.ts` und `codeql.yml` lesen `docs-content-built`
  (Rückbau-Reihenfolge im Removal-Change!); Agenten-Qualität ohne kuratierte
  Specs (Eval-Baseline als Absicherung); übersehene Linkziele auf Wiki/docs-Sites.
