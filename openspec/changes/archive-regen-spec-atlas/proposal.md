# Proposal: archive-regen-spec-atlas

## Why

**Symptom (Fakt):** Der Archiv-PR #5835 scheiterte am Freshness-Gate
(`docs/spec-atlas.md regenerated but not staged`) und brauchte einen zweiten Commit.

**Ursache (belegt):** `cmd_archive` in `scripts/openspec.sh` regeneriert und stagt nach dem Move nur
`components/website/src/data/openspec-status.json` (Block T003136/T006371). `docs/spec-atlas.md`
(`scripts/openspec-atlas.sh`, T015012) haengt ebenfalls an `openspec/specs` und
`openspec/changes/archive`, wird dort aber nie erzeugt. Von den Freshness-Artefakten in
`Taskfile.yml` (`freshness:check`) sind genau diese beiden aus `openspec/` abgeleitet.

```bash
# Messung: welche Generatoren ruft cmd_archive auf?
grep -n "openspec-status-map.sh\|openspec-atlas" scripts/openspec.sh
```

Nebenbefund beim Schreiben des Tests, eigenes Ticket T900342: Sandbox-Tests, die `scripts/*`
verlinken, mergen nie, weil der Main-Check von `openspec-merge.mjs` ueber Symlinks still
scheitert. Der neue Test kopiert die `.mjs`-Einstiegspunkte deshalb.

## What

Im selben Block wie die Status-Map zusaetzlich `openspec-atlas.sh` ausfuehren und
`docs/spec-atlas.md` stagen, mit derselben Bedingung (echtes Repo) und demselben
Fehlerverhalten (fail-closed).

_Ticket: T900341_
