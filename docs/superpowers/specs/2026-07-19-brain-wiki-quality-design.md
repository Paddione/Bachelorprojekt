---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-19
---

# Brain-Wiki Quality Uplift — Design Spec

**Datum:** 2026-07-19
**Branch:** `feature/brain-wiki-quality`
**Parent-SSOT:** `openspec/specs/brain-foundation.md`

## Problem

Der volle Ingest-Lauf (2026-07-15, T001951) hat das Wiki auf 468 Seiten gebracht — aber die
Qualitätsmessung zeigt vier strukturelle Defekte:

| Befund | Ausmaß | Ursache |
|---|---|---|
| Stale-Seiten: Quelle im Bachelorprojekt gelöscht (Doc-Purge T001869/T001874), Wiki-Seite lebt weiter | 338/468 (72 %) | `brain-ingest.sh` kennt nur Quelle→Seite, keine Löschsynchronisation |
| Seiten ohne einen einzigen Body-Wikilink | 396/468 (85 %) | Prompt fordert Wikilinks nur weich; keine Output-Validierung |
| Seiten ohne `source::`-Rückverweis | 150 | Prompt-Regel wird vom lokalen Modell ignoriert; keine Validierung |
| Denglisch-Mangling („Three coupled Lücken", „Planes" statt Pläne), teils 1:1-Kopien statt Destillat | Stichproben durchgängig | Schwaches lokales Modell + `max_tokens: 2048` + Quell-Truncation; keine Sprachregel-Durchsetzung |

Zusätzlich: Die brain-Repo-Lints (`lint-frontmatter.sh`, `lint-wikilinks.sh`) sind grün, weil
sie keinen dieser Defekte prüfen (G-BRAIN-Gates messen Syntax, nicht Substanz).

## Goals

1. **Deletion-Sync (Prune):** `brain-ingest.sh` erhält eine Prune-Phase, die Wiki-Seiten
   entfernt, deren `source::`-Quelle im Bachelorprojekt nicht mehr existiert bzw. nicht mehr
   in der Manifest-Worklist ist. State-File-Einträge werden mitbereinigt.
2. **Einmaliger Purge:** Prune-Lauf gegen `Paddione/brain` entfernt die 338 Stale-Seiten
   (separater PR ins brain-Repo, inkl. MOC-Regeneration + log.md-Eintrag).
3. **Transform-Härtung:** `brain-ingest-transform.sh` validiert seinen Output fail-closed:
   `source::`-Zeile Pflicht, ≥1 Body-Wikilink aus der Slug-Liste Pflicht, ein Retry bei
   Verstoß, danach harter Fehler (zählt als Ingest-Fehlschlag, kein stilles Durchwinken).
   Prompt wird geschärft (strikte Sprachregel: deutsche Prosa ODER englisches Original
   belassen — nie Wort-für-Wort-Mischübersetzung).
4. **Lint-Härtung im brain-Repo:** `lint-frontmatter.sh` prüft zusätzlich `source::`-Pflicht;
   neues advisory Orphan-Audit (Seiten ohne eingehenden Link aus einem MOC).

## Non-Goals

- Kein Modellwechsel / keine Cloud-LLM-Pflicht — das lokale LM-Studio-Setup bleibt;
  Qualität wird über Validierung + Retry erzwungen, nicht über ein anderes Modell.
- Kein Re-Transform aller bestehenden guten Seiten (nur Stale-Purge; Re-Ingest passiert
  organisch über Quell-Hash-Änderungen).
- Keine neuen harten CI-Gates im brain-Repo über die source::-Pflicht hinaus
  (User-Entscheidung aus T001608 Scope B bleibt: Targets dokumentieren, nicht blockieren).
- `raw/`, handgeschriebene Meta-Seiten (SCHEMA, index, quality-goals, usage, cheatsheet,
  first-aid, llm-workflows, MOCs) sind vom Prune ausgenommen.

## Decisions

**D1 — Prune-Kriterium ist source::-basiert, nicht Slug-basiert.** Eine Seite wird nur
gelöscht, wenn (a) ihr `source::` auf `Bachelorprojekt <pfad>` zeigt, (b) `<pfad>` im Repo
nicht mehr existiert, UND (c) der Pfad nicht in der aktuellen Worklist steht. Seiten ohne
`source:: Bachelorprojekt`-Präfix (handgeschrieben, `self`) sind per Konstruktion sicher.
*Trade-off:* Die 150 Seiten ohne `source::` kann der Prune nicht zuordnen — für diese gilt:
Slug-Reverse-Mapping über die Worklist (Slug existiert in State-File, Quellpfad des
State-Eintrags weg → löschen). Was weder source:: noch State-Eintrag hat, bleibt liegen und
fällt ins Orphan-Audit (Mensch entscheidet).

**D2 — Prune läuft default-dry, `--prune` schaltet scharf.** Löschen in einem externen Repo
ist destruktiv; der Default-Lauf listet nur. `--dry-run` zeigt beides.

**D3 — Validierung im Transform-Skript, nicht nur im Prompt.** Lokale Modelle ignorieren
Prompt-Regeln unzuverlässig; die harte Grenze gehört in Bash (grep auf `source::` und
`\[\[`), mit genau einem Retry (Temperatur bleibt 0.2, Retry hängt Fehlerhinweis an den
Prompt an). *Trade-off:* Mehr Fehlschläge im Ingest-Log — gewollt, sichtbar > still kaputt.

**D4 — Dual-Target-Lieferung.** Bachelorprojekt-PR (Skripte + Tests + Spec-Delta) zuerst;
brain-Repo-PR (Purge + Lint-Erweiterung + MOC-Rebuild) als expliziter Task danach, wie beim
brain-quality-goals-Muster (Memory: „Dual-Target: nach Merge separater PR ins live
Paddione/brain nötig").

**D5 — max_tokens 2048 → 3072, MAX_SOURCE_CHARS unangetastet.** 2048 Tokens schneiden bei
1500-Wort-Ziel ab (Mangling-Verstärker am Seitenende); 3072 gibt Luft, ohne den lokalen
Kontext zu sprengen.

## Betroffene Subsysteme

- `scripts/brain-ingest.sh` (Prune-Phase), `scripts/brain-ingest-transform.sh` (Validierung,
  Prompt, Retry), `scripts/brain-ingest-worklist.sh` (nur lesend genutzt)
- `tests/spec/brain-foundation.bats` (RED-first Tests für Prune-Kriterium + Output-Validierung)
- `openspec/specs/brain-foundation.md` (Delta: Prune-Requirement + Transform-Validierungs-Requirement)
- Extern: `Paddione/brain` — `wiki/*` Purge, `scripts/lint-frontmatter.sh`, neues Orphan-Audit,
  `log.md`, MOCs

## Messbare Abnahme

- Nach Purge: 0 Wiki-Seiten mit totem `source::`-Pfad; Seitenzahl ≈ 130 + Meta.
- Neuer Transform-Output besteht ausnahmslos: `source::` vorhanden, ≥1 auflösbarer Wikilink.
- `brain-ingest.sh --dry-run` zeigt Prune-Kandidaten deterministisch (idempotent).
