## ADDED Requirements

### Requirement: Windows-Native FreeToken Auto-Start and Install Scripts

The system SHALL provide PowerShell management scripts under `scripts/llm/` for Windows-native FreeToken installation (`install-freetoken.ps1`) and logon auto-start (`freetoken-autostart.ps1`). The install script SHALL enforce Python 3.12, verify wheel existence in `%USERPROFILE%\Downloads\ft-wheels`, install PyTorch cu130 (`>=2.11,<2.12`), and verify CUDA GPU availability. The autostart script SHALL register a ScheduledTask (`FreeToken-Serve`) executing local binaries under `%LOCALAPPDATA%\FreeToken\bin` on Windows logon without depending on WSL paths.

#### Scenario: Install script checks Python version and CUDA GPU
- **GIVEN** `scripts/llm/install-freetoken.ps1` is invoked on Windows
- **WHEN** the script verifies the environment
- **THEN** it enforces Python 3.12 and asserts PyTorch sees CUDA GPU availability before finishing

#### Scenario: Autostart script registers logon scheduled task
- **GIVEN** `scripts/llm/freetoken-autostart.ps1` is invoked with `-Register`
- **WHEN** the task is created
- **THEN** it registers ScheduledTask `FreeToken-Serve` targeting `%LOCALAPPDATA%\FreeToken\bin\restart-freetoken.ps1` at logon

### Requirement: Local LLM Proxy FreeToken Thinking Fixup and Local Recognition

The local LLM proxy SHALL treat `kind='freetoken'` as a local backend in `scripts/llm-proxy/discovery.mjs`. The proxy SHALL apply the `freetoken-thinking` fixup in `scripts/llm-proxy/fixups.mjs` to set `chat_template_kwargs.enable_thinking = true` for model aliases ending with `-thinking` and `false` for model aliases ending with `-fast`.

#### Scenario: Proxy recognizes FreeToken as local backend
- **GIVEN** a request carrying `x-llm-local-only: 1`
- **WHEN** the backend selection evaluates a backend with `kind: 'freetoken'`
- **THEN** `isLocalBackend` returns `true` and the backend is eligible for selection

#### Scenario: Proxy sets enable_thinking for thinking and fast model aliases
- **GIVEN** a request with model alias `freetoken-local/active-thinking`
- **WHEN** `freetoken-thinking` fixup is applied
- **THEN** `chat_template_kwargs.enable_thinking` is set to `true`
