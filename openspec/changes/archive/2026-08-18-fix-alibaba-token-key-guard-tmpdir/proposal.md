# Proposal: fix-alibaba-token-key-guard-tmpdir

## Why

Seit T002554 steht `.*tmp.*` in der gitleaks-Allowlist (`.gitleaks.toml:52`). Test 1 des Alibaba-Token-Keys-Guards kopiert die Fixture nach `$BATS_TEST_TMPDIR` (unter `/tmp`) — der Pfad matcht die Allowlist, gitleaks meldet "no leaks found" (Exit 0) statt des erwarteten Funds (Exit 1). Der Test ist lokal dauerhaft rot und prüft damit nichts mehr (vakuos). Der REPRO ist im Ticket belegt und am 2026-08-17 mit gitleaks 8.18.2 bestätigt.

## What

Der Test kopiert die Fixture künftig in ein Verzeichnis ohne `tmp`-Segment im Pfad (`mktemp -d /dev/shm/alk.XXXXXX`), mit Verfügbarkeits-Guard (`[ -d /dev/shm ] || skip`) und `trap`-Cleanup. Die Allowlist bleibt unverändert — die dokumentierte T002554-Entscheidung wird respektiert. Die Scanpfad-Konvention wird als MODIFIED-Delta im SSOT-Spec `secrets-deploy-automation` festgehalten (neues Scenario unter "gitleaks-Gegenscan").

_Ticket: T011580_
