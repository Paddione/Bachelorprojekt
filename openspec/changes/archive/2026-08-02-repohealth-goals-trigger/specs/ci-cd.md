## ADDED Requirements

### Requirement: Repohealth-Dashboard-Datenquelle triggert den Website-Build

Health-Goal-Werte erreichen `/admin/repohealth` ausschliesslich ueber ein neu gebautes
Website-Image, weil `website/src/lib/goals-data.generated.json` per statischem ESM-Import in
`website/src/lib/goals-data.ts` ins Astro-Bundle gebacken wird. `.claude/lib/goals.md` ist der
SSOT dieses Artefakts.

The system SHALL trigger `build-website.yml` on changes to `.claude/lib/goals.md`, so that a
goals-only commit produces a fresh website image. The workflow's existing
`Regenerate freshness artifacts before build` step SHALL remain the transformation path —
no separate emit step is required.

#### Scenario: T002158-A: build-website triggert auf die Repohealth-Datenquelle *(BATS)*

- **GIVEN** `.github/workflows/build-website.yml` ist vorhanden
- **WHEN** die `paths`-Liste des `push`-Triggers geprueft wird
- **THEN** enthaelt sie `.claude/lib/goals.md`
- **AND** eine Aenderung, die nur die Health-Goals fortschreibt, loest einen Website-Build aus

---

### Requirement: Freshness-Bot-Commit unterdrueckt keinen Website-Build

`freshness-regen.yml` ist der einzige Ort, an dem generierte `website/**`-Artefakte
*ausserhalb* eines Pull Requests fortgeschrieben werden. Ein unbedingtes `[skip ci]` im
Commit-Titel unterdrueckt dort genau den Pfad, der `build-website.yml` ausloesen wuerde, und
friert damit den ausgelieferten Dashboard-Stand ein.

The system SHALL append `[skip ci]` to the freshness bot commit ONLY when the regenerated diff
contains no `website/**` paths. When a `website/**` artifact changed, the bot SHALL produce a
normal commit so the target workflows react through their own `paths` filters. The check SHALL
inspect the staged diff (`git diff --cached --name-only`) with a start-of-line anchored match
on `website/`, evaluated between `git add` and `git commit`.

The workflow SHALL continue to contain the literal `[skip ci]` for the non-website case,
preserving the existing G-CI01-E requirement.

#### Scenario: T002158-B: [skip ci] ist nicht unbedingt im Commit-Titel *(BATS)*

- **GIVEN** `.github/workflows/freshness-regen.yml` ist vorhanden
- **WHEN** die `git commit -m`-Zeile des Commit-Steps geprueft wird
- **THEN** enthaelt sie kein hart eingebautes `[skip ci]`, sondern eine Variable
- **AND** der Regen-Commit eines `website/**`-Artefakts loest `build-website.yml` aus

#### Scenario: T002158-B: Regen-Diff wird auf website/-Pfade geprueft *(BATS)*

- **GIVEN** `.github/workflows/freshness-regen.yml` ist vorhanden
- **WHEN** der Commit-Step geprueft wird
- **THEN** enthaelt er einen am Zeilenanfang verankerten `^website/`-Match auf den
  Staged-Diff, der steuert, ob `[skip ci]` angehaengt wird
- **AND** ein Pfad wie `docs/website-notes.md` zaehlt dadurch NICHT als Website-Artefakt
