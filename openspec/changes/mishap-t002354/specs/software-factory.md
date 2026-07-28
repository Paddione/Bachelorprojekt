## ADDED Requirements

### Requirement: LLM-Proxy-Preflight vor dem Dispatch

`wakeup.sh` SHALL test the reachability of `ANTHROPIC_BASE_URL` (if set) before
the first dispatch of a tick. If the proxy is unreachable, the tick SHALL be
aborted with a log message — no headless `claude -p` sessions SHALL be launched.
The preflight SHALL be a simple TCP/HTTP-HEAD check per brand, best-effort
(non-fatal if the env var is unset — that means the real Anthropic API is the
target and its reachability is out of scope).

This prevents the Livelock-from-infrastructure-failure pattern: a dead
llm-proxy starts sessions that die immediately (before writing any phase
events), wasting INFRA attempt budget and adding load to the proxy during
restart. The watchdog already distinguishes INFRA from MODEL failures
(T002389), but avoiding the sessions entirely is cheaper than counting them.

#### Scenario: Proxy down → Tick skipped

- **GIVEN** `ANTHROPIC_BASE_URL` ist auf einen lokalen llm-proxy gesetzt
- **AND** dieser Proxy antwortet nicht (Connection Refused / Timeout)
- **WHEN** `wakeup.sh` startet
- **THEN** logged die Preflight-Prüfung "LLM-Proxy unreachable — skipping tick"
- **AND** der Tick wird abgebrochen, ohne dass `dispatcher-bridge.sh` läuft

### Requirement: Watchdog-Kommentare deduplizieren

The watchdog SHALL avoid writing consecutive identical comments to the same
ticket. It SHALL track the last comment body per ticket (via
`tickets.factory_control` key `watchdog_last_comment:<ticket>`) and SHALL skip
the comment if the new body equals the stored one, unless the comment includes
a counter that changed (e.g. "Attempt 3/3" after "Attempt 2/3").

This prevents the "seven identical comments" signal-noise problem observed on
T002282: when every watchdog round writes the same text, the repetition itself
becomes invisible.

#### Scenario: Identischer Watchdog-Kommentar wird unterdrückt

- **GIVEN** ein Ticket hat den Watchdog-Kommentar "Pipeline stale > 30min"
  bereits einmal erhalten
- **WHEN** die nächste Watchdog-Runde denselben Text schreiben würde
- **THEN** wird der Kommentar unterdrückt (nicht gespeichert)
- **AND** falls ein Attempt-Zähler vorhanden ist (z.B. " [MODEL 2/3]"), wird der
  Kommentar trotzdem geschrieben, weil der Text sich unterscheidet
