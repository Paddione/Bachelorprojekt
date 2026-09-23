## p2 — Finalizer reicht die Archiv-Flags durch

Target files: `scripts/devflow-post-merge-finalize.sh`

`scripts/devflow-post-merge-finalize.sh` hat 803 Zeilen, Restbudget 9. Die Aenderung ersetzt eine
Zeile, Netto-Zuwachs 0. T900340 aendert dieselbe Datei parallel (Schritt 10, +2 Zeilen); beide
zusammen bleiben im Budget. Bei einem Merge-Konflikt beide Aenderungen behalten.

- [ ] **Beide Aufrufe in Schritt 8 aendern** (Archiv-Commit und Freshness-Amend, Zeilen ~637 und
  ~646). Jede Zeile `archive_stage_commit "$SLUG"` wird zu
  `archive_stage_commit "$SLUG" ${ARCHIVE_ARGS[@]+"${ARCHIVE_ARGS[@]}"}`. `ARCHIVE_ARGS` setzt
  `openspec_archive_args` im Nicht-Resume-Zweig; im Resume-Zweig ist es ungesetzt, die Expansion
  liefert dann nichts (sicher unter `set -u`).

- [ ] **Finalize-Tests gruen.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/archive-stage-new-ssot.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats tests/spec/agent-skills/finalize-archive-state.bats tests/spec/agent-skills/finalize-hardening.bats
# expected: alle ok
```
