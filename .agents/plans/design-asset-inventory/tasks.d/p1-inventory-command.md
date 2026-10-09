# p1 — Inventory command and baseline manifest

Files: `scripts/design-assets-inventory.sh`, `docs/design-assets/manifest.json`
(new, additive; no existing file changes).

## Task 1: Write the bounded read-only inventory command

Create `scripts/design-assets-inventory.sh` (`set -euo pipefail`, `--help`
output, non-zero exit on misuse):

- Scope roots, fixed in the script: `assets/`, `.design-sync/`,
  `packages/design-system/`, `design/leitstand-ds/`,
  `components/website/public/brand/`, `components/brett/public/assets/`.
- Bounded `find` without `-L` (never follow symlinks). Skip list: `.git/`,
  `node_modules/`, `__pycache__/`, plus name patterns for secrets, history,
  weights, caches and backups (`*secret*`, `*history*`, `*.pt`, `*.bin`,
  `*.safetensors`, `*cache*`, `*backup*`). Never read file contents except
  for hashing and `file --mime-type`.
- Per file emit: stable ID (repo-relative path), SHA-256, byte size, MIME
  type and extension-derived format. Stable sort by ID. Duplicate groups:
  files sharing one hash listed once with all members.
- Output: JSON manifest to stdout, or to a path via `--out`. The hash core
  carries no timestamps, hostnames or absolute paths, so two runs produce
  identical bytes.
- The script never invokes the destructive sync script and performs no
  writes outside the requested manifest path.

Verify by hand: run with `--help`, then scan one small scope root and
eyeball the JSON shape.

## Task 2: Generate and commit the PRE baseline manifest

Run the command from Task 1 over all scope roots and write
`docs/design-assets/manifest.json`. Re-run into a temp file and compare
SHA-256 checksums — the comparison must show identical bytes, otherwise fix
the command (ordering, locale, stray timestamps) before proceeding.

Commit both files as `docs(T901038): add bounded design-assets inventory
command and PRE baseline` and push the branch.

Acceptance for p1: a second run on a clean checkout reproduces the
committed manifest byte-identically; the manifest covers every in-scope
file with ID, hash, size and format plus duplicate groups.
