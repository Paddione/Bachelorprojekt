## p1 — `cmd_archive` erzeugt und stagt den Atlas

Target files: `scripts/openspec.sh`

`scripts/openspec.sh` hat 506 Zeilen, Restbudget 294. Die Aenderung bringt rund 4 Zeilen.

- [ ] **Im Status-Map-Block nach dem Move** (Kommentar `[T003136]`, Zweig
  `if [[ "${OPENSPEC_ROOT:-}" == "${REPO}/openspec" || -z "${OPENSPEC_ROOT:-}" ]]`) nach dem
  Stagen der Status-Map ergaenzen:
  `bash "$HERE/openspec-atlas.sh" >/dev/null` und
  `git -C "$REPO" add -- "$REPO/docs/spec-atlas.md"`. Kein `|| true` (design.md D1).
- [ ] **Im else-Zweig (Fixture)** best-effort: `bash "$HERE/openspec-atlas.sh" >/dev/null 2>&1 || true`.
- [ ] **Kommentar** um einen Satz zu T900341 ergaenzen (warum der Atlas hierher gehoert).

- [ ] **Tests gruen.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-regen-spec-atlas.bats
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-status-offline-staging.bats tests/spec/openspec-workflow/archive-terminal-ticket-status.bats
# expected: alle ok
```
