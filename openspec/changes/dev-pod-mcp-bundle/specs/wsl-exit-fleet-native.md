## MODIFIED Requirements

### Requirement: Dev-in-Pod and proxy migration are reconsidered on evidence

ADR-007 rejected two alternatives that this change adopts. The rejection SHALL be revised, and
the revision SHALL carry the measurement that invalidates it rather than a bare reversal.

#### Scenario: The capacity argument is re-measured

- **GIVEN** ADR-007 rejected "Dev-in-Pod / Thin-Client" citing worker RAM at 85–112 %
- **WHEN** node memory is measured again with `kubectl --context fleet top nodes`
- **THEN** the recorded figures accompany the revision, so that the reversal rests on evidence
  and can be re-checked

#### Scenario: The unrefuted objections keep their scope

- **GIVEN** ADR-007 also cited WAN latency and the loss of the native toolchain
- **WHEN** the rejection is revised
- **THEN** those objections remain in force for interactive development, and the revision claims
  the pod only as a server bundle

#### Scenario: The proxy is migrated rather than retired

- **GIVEN** ADR-007 recorded "retire statt portieren" for the llm-proxy because FreeToken-native
  had made it obsolete
- **WHEN** the proxy moves into the cluster without its loadout machinery
- **THEN** the ADR records which part was retired (the local GPU loadouts) and which part was
  migrated (the routing layer), so that the entry is not read as a plain contradiction
