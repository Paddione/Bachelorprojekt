## ADDED Requirements

### Requirement: Spec-Tests spiegeln die umformulierte Doku-Prosa

The system SHALL keep the spec-test assertions in sync with the rewritten prose of
`SKILL.md`/`AGENTS.md`, so that documentation assertions do not assert stale wording. Where a
requirement is structurally checkable (frontmatter key present, task exists), the test SHALL
use the structural form instead of a brittle wording assertion.

#### Scenario: Doku-Assertion folgt der umformulierten Prosa

- **GIVEN** die Prosa in `SKILL.md`/`AGENTS.md` wurde umgeschrieben
- **WHEN** die zugehörige Spec-Test-Assertion geprüft wird
- **THEN** prüft sie den neuen Wortlaut
- **AND** sie behauptet keinen veralteten Text

#### Scenario: Strukturell prüfbare Anforderung nutzt strukturelle Form

- **GIVEN** eine Anforderung ist strukturell prüfbar (Frontmatter-Key, Task-Existenz)
- **WHEN** der Test formuliert wird
- **THEN** nutzt er die strukturelle Assertion
- **AND** nicht eine spröde Wortlaut-Assertion

### Requirement: Spec-Tests ziehen die absichtlich veränderte Realität nach

The system SHALL update spec tests that assert states which were intentionally changed, so
that the tests reflect the current reality. This includes removing references to dead LLM
configuration, updating the delegation-fallback behavior, and aligning with the Flux
OCIRepository-based sync.

#### Scenario: Tote LLM-Konfiguration ist aus den Tests entfernt

- **GIVEN** die alte LLM-Gateway-Konfiguration wurde entfernt
- **WHEN** die Spec-Tests geprüft werden
- **THEN** referenzieren sie keinen toten Dienst und keine toten Variablen
  (`LLM_LMSTUDIO_URL`, `LLM_CHAT_MODEL`, `LLM_CODING_MODEL`, `LLM_EMBED_MODEL_NOMIC`)

#### Scenario: Delegation-Fallback-Verhalten ist abgebildet

- **GIVEN** die Delegation nutzt einen Fallback
- **WHEN** die Spec-Tests geprüft werden
- **THEN** bilden sie `fallbackFor`/`fallbackTriggered` und den `qwen35-hq`-Fallback ab
- **AND** `qwen35-hq` ist in `agent-models.jsonc` registriert

#### Scenario: Flux-Sync nutzt die OCIRepository-Quelle

- **GIVEN** Flux synchronisiert aus einem OCIRepository
- **WHEN** die Spec-Tests geprüft werden
- **THEN** bilden sie die OCIRepository-Quelle und die Kustomization-`dependsOn`-Kette ab
