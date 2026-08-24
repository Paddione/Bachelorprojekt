## ADDED Requirements

### Requirement: Nebenpfad-Pod-Selektionen nutzen die Zwei-Schichten-Verteidigung

Every script with its own shared-db pod selection outside `scripts/vda/ticket/_ticket-core.sh`
— `scripts/factory/lib.sh` (`factory_pgpod`), `scripts/factory/conflict-check.sh` (`_pgpod`),
`scripts/mishap-categorize.sh`, `scripts/batch-gap-analysis.sh` — SHALL apply the same
two-layer defense as the T015168 reference fix before returning a pod:

1. **Pod-Singleton-Assertion:** more than one Running pod on the selector fails loudly instead
   of silently picking `head -1`.
2. **DB-Marker-Probe:** the resolved pod must serve the database carrying the SSOT identity
   marker (`SELECT identity FROM tickets.db_identity` equal to the expected value); missing or
   mismatched markers abort with the remediation hint.

Existing output contracts stay intact: `factory_pgpod` keeps emitting valid JSON on its error
path (callers parse stderr with jq); plain-text scripts keep their human-readable errors.

#### Scenario: Ghost pod beside the real one

- **GIVEN** two Running pods match the selector in the namespace of a side-path script
- **WHEN** the script resolves its DB pod
- **THEN** it exits non-zero listing both pods and naming the ghost-pod remediation, instead of
  picking an arbitrary one

#### Scenario: Marker-less instance answers

- **GIVEN** exactly one Running pod matches, but its database lacks the `tickets.db_identity`
  marker or carries a foreign value
- **WHEN** the script resolves its DB pod
- **THEN** it exits non-zero with the marker remediation hint before any query runs

### Requirement: BATS-Sentinel-Regime bleibt ausgenommen

Under the BATS sentinel regime the added probes SHALL skip exactly like `_assert_db_identity`
in the reference fix (sentinel detection plus explicit opt-in variable), so offline tests stubbing
the cluster are not closed off by the probe.

#### Scenario: Sentinel test run passes without a cluster

- **GIVEN** a BATS test stubs kubectl and does not opt in via the probe's test-ok variable
- **WHEN** a side-path script resolves its pod inside that test
- **THEN** the marker probe skips and the test proceeds against the stub
