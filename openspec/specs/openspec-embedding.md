# openspec-embedding

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu openspec-embedding ergänzen._

## Requirements

### Requirement: Plan-Partials aus tasks.d/ werden als Factory-Slot-Einheit eingebettet

The system SHALL embed each plan partial from `tasks.d/*.md` as a single chunk with
`fileType='partial'` in the pgvector index, so that the large multi-slot plans are findable.
The chunk SHALL carry slot identity metadata from the manifest table (`partial_id`, `role`,
`target_files`, `depends_on`, `token_estimate`).

#### Scenario: tasks.d/ ist vierte Embedding-Quelle

- **GIVEN** `scripts/openspec-embed.mjs` baut Chunks
- **WHEN** die Quellen geprüft werden
- **THEN** ist `tasks.d/*.md` als vierte Quelle enthalten
- **AND** je Partial wird ein Chunk mit `fileType='partial'` erzeugt

#### Scenario: Chunk trägt Slot-Metadaten

- **GIVEN** ein Partial wird eingebettet
- **WHEN** die Metadaten geprüft werden
- **THEN** enthalten sie `partial_id`, `role`, `target_files`, `depends_on` und `token_estimate`

### Requirement: Partial-Größe wird begrenzt und ein einziger Schreibpfad genutzt

The system SHALL fail a plan partial larger than 7000 tokens in `scripts/plan-lint.sh`, and
SHALL use a single write path via the `ACTIVE_STATUSES` constant so that exactly one code path
writes to the index.

#### Scenario: Zu großer Partial schlägt fehl

- **GIVEN** ein Partial überschreitet 7000 Token
- **WHEN** `plan-lint.sh` läuft
- **THEN** schlägt der Lint fehl
- **AND** der Partial wird nicht eingebettet

#### Scenario: Ein einziger Schreibpfad existiert

- **GIVEN** die Embedding-Logik wird geprüft
- **WHEN** die Schreibpfade gezählt werden
- **THEN** existiert genau ein Schreibpfad
- **AND** er nutzt die `ACTIVE_STATUSES`-Konstante

<!-- merged from change delta openspec-embedding.md (764cda456460) -->

### Requirement: `--count-skipped` nennt betroffene Slugs und prüft typ-bewusst

The system SHALL, when `node scripts/openspec-embed.mjs --count-skipped` runs, apply a
chunk-type-aware token threshold instead of a single flat limit: chunks with
`fileType='partial'` SHALL be compared against the same 7000-token cap already enforced by
`scripts/plan-lint.sh` (T002453-C), while all other chunk types (`proposal`, `task_section`,
`spec_section`) SHALL be compared against the existing 2048-token default. The system SHALL
list the slug (and its worst chunk's approximate token count and file type) for every document
counted as skipped, in addition to the aggregate summary line.

#### Scenario: Ein plan-lint-legaler Partial wird nicht mehr fälschlich als Skip gezählt

- **GIVEN** ein aktiver Change hat einen `tasks.d/*.md`-Partial mit ~2100 geschätzten Token
  (unter dem 7000-Token-Deckel aus `scripts/plan-lint.sh`)
- **WHEN** `node scripts/openspec-embed.mjs --count-skipped` läuft
- **THEN** wird dieser Slug NICHT in der Skip-Zahl mitgezählt
- **AND** sein Slug erscheint NICHT in der Skip-Liste

#### Scenario: Ein illegal übergroßer Partial bleibt als Skip erkennbar

- **GIVEN** ein aktiver Change hat einen `tasks.d/*.md`-Partial über 7000 geschätzten Token
- **WHEN** `node scripts/openspec-embed.mjs --count-skipped` läuft
- **THEN** wird dieser Slug in der Skip-Zahl mitgezählt
- **AND** sein Slug samt geschätzter Token-Zahl erscheint in der Skip-Liste

### Requirement: `chunkProposal()` teilt übergroße Proposals per Token-Budget

The system SHALL split a `proposal.md` body that exceeds the 400-token chunk target into
multiple chunks using the same token-budget algorithm (`splitByTokenBudget`, 50-token overlap)
already used by `chunkSections()` for `tasks.md`/spec sections, instead of embedding the entire
body as a single unsplit chunk. Bodies at or below the target SHALL continue to produce exactly
one chunk.

#### Scenario: Kurzer Proposal-Body bleibt ein Chunk

- **GIVEN** ein `proposal.md`-Body liegt unter dem 400-Token-Zielwert
- **WHEN** `chunkProposal()` aufgerufen wird
- **THEN** wird genau ein Chunk erzeugt

#### Scenario: Langer Proposal-Body wird aufgeteilt

- **GIVEN** ein `proposal.md`-Body überschreitet den 400-Token-Zielwert
- **WHEN** `chunkProposal()` aufgerufen wird
- **THEN** werden mehrere Chunks erzeugt, jeder innerhalb des Budgets plus Overlap-Toleranz

<!-- merged from change delta openspec-embedding.md (3e68e53d44bd) -->

### Requirement: Port-Forward identity is verified before use

`scripts/openspec-embed-local.sh` SHALL verify, after starting its own `kubectl port-forward`
for `svc/shared-db`, that the process actually listening on `127.0.0.1:$PF_PORT` is the process
it just started (or a child of it) — not merely that some process is listening on that port. On
mismatch the script SHALL abort with a non-zero exit and a remediation message naming the
foreign process, instead of silently using a pre-existing, unrelated port-forward.

#### Scenario: Own port-forward is confirmed

- **GIVEN** `openspec-embed-local.sh` starts its own port-forward on `$PF_PORT`
- **WHEN** the port-forward's listener PID is checked
- **THEN** it matches the PID of the process the script just started
- **AND** the script proceeds to use the DB connection

#### Scenario: Colliding foreign listener is rejected

- **GIVEN** a foreign process already listens on `$PF_PORT` (e.g. an orphaned unrelated
  `kubectl port-forward`) before or instead of the script's own forward binding successfully
- **WHEN** `openspec-embed-local.sh` checks the port-forward's listener identity
- **THEN** the script exits non-zero
- **AND** it does NOT proceed to query through that port

### Requirement: Wrapper success check fails on a completeness-gate warning

`scripts/openspec-embed-local.sh` SHALL treat `openspec-embed.mjs` output as a failure (exit
non-zero) whenever the output contains a `WARN: completeness gate` line, even if the same
output also contains an `indexed slug='` success marker. `.githooks/post-commit-embed` remains
unaffected (still non-fatal on wrapper failure — safety-net semantics unchanged); the explicit
`dev-flow-plan` C.4 invocation of the wrapper (no `|| true`) becomes the effective escalation
point.

#### Scenario: Completeness-gate warning is escalated

- **GIVEN** `openspec-embed.mjs` output contains both `indexed slug='<slug>'` and a
  `WARN: completeness gate` line
- **WHEN** `openspec-embed-local.sh` evaluates the output
- **THEN** the wrapper exits non-zero

#### Scenario: Clean success stays a success

- **GIVEN** `openspec-embed.mjs` output contains `indexed slug='<slug>'` and no
  `WARN: completeness gate` line
- **WHEN** `openspec-embed-local.sh` evaluates the output
- **THEN** the wrapper exits zero

### Requirement: post-commit-embed hook skips during an active rebase

`.githooks/post-commit-embed` SHALL detect an in-progress `git rebase` (presence of
`rebase-merge` or `rebase-apply` under the git directory) and exit immediately without invoking
`openspec-embed-local.sh`, so replayed commits during a rebase do not each pay the embedding
cost. A regular commit made after the rebase completes (no rebase markers present) SHALL trigger
the hook normally.

#### Scenario: Hook is skipped while a rebase is in progress

- **GIVEN** a `rebase-merge` or `rebase-apply` directory exists under the git directory
- **WHEN** a commit is made and `post-commit-embed` runs
- **THEN** the hook exits without invoking `openspec-embed-local.sh`

#### Scenario: Hook runs normally outside a rebase

- **GIVEN** no rebase is in progress
- **WHEN** a commit touching `openspec/changes/<slug>/` is made and `post-commit-embed` runs
- **THEN** the hook invokes `openspec-embed-local.sh` for the touched slug(s)

<!-- merged from change delta openspec-embedding.md (df614505aa3f) -->

### Requirement: Der DB-Port-Forward wird pro Lauf dynamisch gewählt, nicht fest geteilt

The system SHALL, when `OPENSPEC_EMBED_PF_PORT` is not explicitly set, let `kubectl
port-forward` choose a free local port for its `svc/shared-db` forward instead of sharing a
fixed default port across all invocations, so that a permanently running, unrelated port-forward
on the same host does not block every commit's embedding step. When `OPENSPEC_EMBED_PF_PORT` is
explicitly set, the system SHALL retain the existing fixed-port behaviour including foreign-
process detection and fail-fast on collision.

#### Scenario: Kein OPENSPEC_EMBED_PF_PORT gesetzt, Port bereits fremd belegt

- **GIVEN** ein fremder Prozess läuft dauerhaft auf Port 15432
- **AND** `OPENSPEC_EMBED_PF_PORT` ist nicht gesetzt
- **WHEN** `scripts/openspec-embed-local.sh` einen Commit einbettet
- **THEN** kollidiert der eigene Port-Forward NICHT mit dem Fremdprozess
- **AND** das Embedding schlägt nicht wegen einer Portkollision fehl

#### Scenario: OPENSPEC_EMBED_PF_PORT explizit gesetzt und belegt

- **GIVEN** `OPENSPEC_EMBED_PF_PORT=15432` ist explizit gesetzt
- **AND** ein fremder Prozess belegt Port 15432
- **WHEN** `scripts/openspec-embed-local.sh` läuft
- **THEN** bricht das Skript mit einer Fehlermeldung ab, die den Fremdprozess benennt

<!-- merged from change delta openspec-embedding.md (b4b27b1d3132) -->