# Test Framework Design — Homeoffice MVP

## Overview

Automated and manual test framework for verifying all 37 requirements (AK, FA, L, NFA, SA) of the Homeoffice MVP Docker Compose stack (Mattermost + Jitsi + Nextcloud + Keycloak + LLDAP + Traefik).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test tiers | 2-tier (local + production) | Docker Compose stack IS the integration env; no separate dev tier needed |
| Tooling | Bash + Playwright hybrid | Bash for API/config/infra checks, Playwright for browser E2E |
| Result format | JSON + Markdown | JSON as canonical log, Markdown for human-readable Abnahme reports |
| Test structure | Per-requirement files | 1:1 mapping to requirement IDs for direct traceability |

## Directory Structure

```
tests/
  runner.sh                      # main entrypoint
  lib/
    assert.sh                    # assertion helpers (assert_eq, assert_http, ...)
    report.sh                    # JSON logging + Markdown generation
    compose.sh                   # docker compose lifecycle helpers
  local/                         # Tier 1: local docker compose stack
    AK-03.sh                     # technical feasibility
    AK-04.sh                     # prototype operation
    FA-01.sh                     # messaging via API
    FA-02.sh                     # channels/workspaces via API
    FA-04.sh                     # file upload via API
    FA-05.sh                     # user management (LLDAP, Keycloak, roles)
    FA-06.sh                     # notifications config
    FA-07.sh                     # search via API
    FA-08.sh                     # status/homeoffice features via API
    NFA-03.sh                    # availability (restart, health)
    NFA-06.sh                    # maintainability (compose lifecycle, logs)
    NFA-07.sh                    # licensing (edition, image tags)
    SA-02.sh                     # authentication (login, lockout, SSO)
    SA-03.sh                     # password hashing (bcrypt, policy)
    SA-04.sh                     # session timeout (token lifespan)
    SA-05.sh                     # audit log (events API)
    SA-06.sh                     # RBAC (role permissions)
  prod/                          # Tier 2: live deployment
    NFA-01.sh                    # data privacy (DNS leak, geo check)
    NFA-02.sh                    # performance (response times, load)
    NFA-04.sh                    # scalability (concurrent sessions)
    SA-01.sh                     # TLS (ciphers, HSTS, certs)
    SA-07.sh                     # backup (logs, files, retention)
  e2e/                           # Playwright browser tests
    package.json
    playwright.config.ts
    specs/
      fa-01-messaging.spec.ts    # real-time DM, group DM, channels
      fa-02-channels.spec.ts     # create/join/archive
      fa-03-video.spec.ts        # Jitsi meeting, A/V, screen share
      fa-04-files.spec.ts        # upload, download, persistence
      fa-05-user-mgmt.spec.ts    # SSO login flow via Keycloak
      fa-08-status.spec.ts       # custom status visibility
      nfa-05-usability.spec.ts   # German locale, mobile viewport
      sa-02-auth.spec.ts         # 2FA TOTP, SSO redirect in browser
  results/                       # output (gitignored)
```

## Runner Interface

```bash
./tests/runner.sh local              # full local tier: compose up, bash tests, e2e, compose down
./tests/runner.sh prod               # full prod tier against live URLs
./tests/runner.sh local FA-01 SA-03  # run specific tests only
./tests/runner.sh report             # regenerate Markdown from latest JSON
```

### Local Tier Lifecycle

1. Validate prerequisites (`docker`, `jq`, `curl`)
2. `docker compose up -d` — poll health checks until all services ready
3. Bootstrap test data (test users, channels, roles — idempotent)
4. Run `local/*.sh` test files (all or specified subset)
5. Run Playwright e2e specs (`npx playwright test`)
6. Merge JSON results into `results/<date>-local.json`
7. Generate `results/<date>-local.md`
8. `docker compose down -v`

### Production Tier Lifecycle

1. Read target URLs from `.env` or `--env <file>`
2. Validate connectivity to all domains
3. Run `prod/*.sh` test files
4. Optionally run Playwright e2e against prod URLs
5. Write `results/<date>-prod.json` + `.md`

### Flags

- `--keep` — don't tear down after local tests (debugging)
- `--verbose` — print each assertion as it runs
- `--env <file>` — .env file for prod URLs (default: `.env`)

## Assertion Library (`lib/assert.sh`)

Each assertion takes: requirement ID, test case ID (T1–T5 from requirements), description.

```bash
assert_eq       "actual" "expected"          "SA-03" "T1" "bcrypt hash format"
assert_contains "haystack" "needle"          "FA-07" "T1" "search finds result"
assert_http     200 "https://localhost/api"  "NFA-03" "T3" "ping returns 200"
assert_http_redirect "http://..." "https://..." "SA-01" "T1" "HTTP-HTTPS redirect"
assert_lt       "$ms" 2000                   "NFA-02" "T1" "response under 2s"
assert_gt       "$count" 0                   "SA-05" "T1" "audit events exist"
assert_cmd      "docker exec mm pg_isready"  "FA-01" "T4" "DB accessible"
assert_not_contains "$output" "password"     "SA-03" "T3" "no cleartext in logs"
```

## JSON Result Format

```json
{
  "meta": {
    "tier": "local",
    "date": "2026-03-28T14:30:00Z",
    "host": "ubuntu-laptop",
    "compose_file": "docker-compose.yml"
  },
  "results": [
    {
      "req": "FA-01",
      "test": "T1",
      "desc": "DM appears via API within 1s",
      "status": "pass",
      "duration_ms": 342,
      "detail": ""
    }
  ],
  "summary": {
    "total": 47,
    "pass": 45,
    "fail": 2,
    "skip": 0
  }
}
```

## Markdown Report Format

Generated from JSON. Grouped by requirement category. Includes:

- Automated test results table (Req, Test, Beschreibung, Status, Dauer)
- Manual checklist section for AK/L requirements
- Summary line (pass/fail/skip counts)

## Test Coverage Map

### Tier 1: Local Stack (24 automated requirements)

| Req | Bash | Playwright | What's Tested |
|-----|:---:|:---:|---|
| AK-03 | x | | compose starts, stable image tags |
| AK-04 | x | | setup.sh --check, no proprietary images |
| FA-01 | x | x | API: send/persist messages. E2E: real-time delivery |
| FA-02 | x | x | API: public/private channels. E2E: join/archive |
| FA-03 | | x | E2E: Jitsi room, A/V indicators, screen share button |
| FA-04 | x | x | API: upload/persist files. E2E: drag-drop, download |
| FA-05 | x | x | API: CRUD users, LDAP sync. E2E: SSO login |
| FA-06 | x | | API: notification settings, mute, DND |
| FA-07 | x | | API: search messages/files/channels, <2s response |
| FA-08 | x | x | API: custom status. E2E: visibility to others |
| NFA-03 | x | | docker kill recovery, health endpoints, data persistence |
| NFA-06 | x | | compose lifecycle, logs, .env changes |
| NFA-07 | x | | team-edition check, license table |
| SA-02 | x | x | API: failed login, lockout. E2E: 2FA, SSO |
| SA-03 | x | | DB query $2b$12$ hash, Keycloak password policy |
| SA-04 | x | | Keycloak token lifespan, Mattermost session config |
| SA-05 | x | | Keycloak events API, admin action logs |
| SA-06 | x | | Guest 403 on channel create, user can't access admin |

### Tier 2: Production

| Req | What's Tested |
|-----|---|
| NFA-01 | DNS leak check (nmap), no telemetry endpoints, container IP in DE |
| NFA-02 | curl response <2s, ab load test <5% errors |
| NFA-04 | 10 concurrent sessions, memory limits, DB host configurable |
| SA-01 | TLS 1.3 ciphers, HSTS header, HTTP redirect, cert validity |
| SA-07 | Backup container logs, files on target, 30-day retention |

### Manual Checklist (13 requirements)

| Req | Reason |
|-----|--------|
| AK-01 | Marktanalyse — Betreuer review |
| AK-02 | USPs — human quality judgement |
| AK-05 | Geschaeftsmodell — plausibility check |
| AK-06 | DMS completeness — manual checklist |
| AK-07 | Presentation — timing, participation |
| L-01 | Konzept documents P1-P5 |
| L-02 | Marktanalyse document |
| L-03 | Prototyp (partially covered by AK-03/AK-04 automated tests) |
| L-04 | Geschaeftsmodell document |
| L-05 | Systemarchitektur document |
| L-06 | Deploymentanleitung document |
| L-07 | Endbericht (page count, structure) |
| L-08 | Abschlusspresentation |

## Playwright Configuration

- Base URL configurable via env var (`TEST_BASE_URL`)
- Two projects: `chromium` (primary), `firefox` (cross-check)
- Global setup: login as test user, save auth state
- Timeout: 30s per test (Jitsi can be slow to initialize)
- Screenshots on failure saved to `results/screenshots/`

## Test Data Bootstrap

Before Bash and Playwright tests run, `runner.sh` creates:

- **test-admin** — system admin account (for admin-only API calls)
- **test-user1**, **test-user2** — regular users (for messaging, channel, file tests)
- **test-guest** — guest role (for RBAC negative tests)
- **test-channel-public**, **test-channel-private** — channels for messaging tests

Created via Mattermost REST API + LLDAP API. Idempotent (skip if exists).
