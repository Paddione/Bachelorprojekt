## ADDED Requirements

### Requirement: Provider_config ist die einzige Kandidatenquelle des Routers

Der fruehere Phasen-Pin aus der entfernten Tabelle `tickets.factory_model_slots` war eine zweite
Wahrheit neben `tickets.provider_config`: zwei Oberflaechen fuer dieselbe Entscheidung, von denen
nur eine von Runtime-Code gelesen wurde [T013302]. Der Router wertet deshalb ausschliesslich
`tickets.provider_config` aus.

`scripts/factory/route-provider.sh` SHALL evaluate its candidates solely from
`tickets.provider_config`, passing every candidate through the same priority order, the
`provider_health` cooldown check and the atomic slot claim. The router SHALL NOT query any
per-phase pin table, and the script SHALL NOT carry a `ROUTE_SKIP_PINNED` switch, because there
is no pin left to skip: the escalation ladder (`factory-escalation-ladder`) can no longer be
overridden by a local phase preference.

#### Scenario: Retired pin rows are ignored

- **GIVEN** legacy rows still exist in `tickets.factory_model_slots`
- **WHEN** `route-provider.sh factory-implement sonnet` runs against a reachable database
- **THEN** no statement in the script reads that table, and the candidate chain comes entirely
  from `provider_config`

#### Scenario: Exhausted chain is announced, not returned silently

- **GIVEN** every candidate for a source/tier is claimed out or on cooldown
- **WHEN** the router falls through to the emergency branch
- **THEN** it writes a diagnostic naming the source and tier to stderr, and the emitted JSON carries
  `emergency: true` together with a model id that a reachable backend actually serves

## MODIFIED Requirements

### Requirement: Bonsai Provider Registration for Implement and Review

`scripts/factory/provider-register-local.sh` SHALL register the local chat model for implement and review in
`tickets.provider_config`, using the unified gateway `http://127.0.0.1:18235/v1` as `base_url` — never a backend
port directly. The model id SHALL NOT be a source-code literal. It SHALL be resolved in this order, first hit wins:

1. `factory.model` from `scripts/llm/loadouts.json`, read over `GET /admin/factory`
2. the environment variable `FACTORY_MODEL_ID`
3. the script's built-in default

The file outranks the environment because the file is the only one of the three that is validated against the
loadouts that actually exist. The environment variable stays the path for callers with no reachable proxy — CI, a
one-off run against a different model — and therefore keeps its meaning unchanged for every existing caller.

The resolution SHALL live in exactly one place, `factory_model_pin` in `scripts/factory/lib.sh`, and SHALL be
fail-soft with a bounded timeout: an unreachable proxy means "no pin", never an abort. A gateway that stops the
factory because a web UI is not running would be a new failure source in service of a convenience feature.

Seit T013302 schreibt das Skript keine Phasen-Zuweisungen mehr in eine eigene Slot-Tabelle;
`tickets.provider_config` ist der einzige Speicher, den es befuellt und den Runtime-Code liest.

**Renamed-to:** Local Provider Registration for Implement and Review

#### Scenario: Registration writes gateway URL and configurable model id

- **GIVEN** the registration script runs against a brand database
- **WHEN** its idempotent upserts complete
- **THEN** every row it touched has `base_url = http://127.0.0.1:18235/v1` and `model_id` equal to the resolved pin, and re-running it never reintroduces `:8093`

#### Scenario: The file outranks the environment variable

- **GIVEN** `loadouts.json` carries `factory.model = "gemma26-throughput"` and `FACTORY_MODEL_ID` is set to `gemma12-vision`
- **WHEN** any routing surface resolves the model id
- **THEN** it resolves `gemma26-throughput`

#### Scenario: An unreachable proxy falls back, it does not fail

- **GIVEN** nothing is listening on `127.0.0.1:18235`
- **WHEN** `factory_model_pin` runs
- **THEN** it returns empty within its timeout and the caller proceeds with `FACTORY_MODEL_ID` or its built-in default, exactly as before this change

#### Scenario: Retired model ids never reach a routing surface

- **GIVEN** the routing surfaces `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh` and `scripts/factory/pipeline.mjs`
- **WHEN** the spec BATS suite runs in CI
- **THEN** any non-comment line naming a retired model id (`ternary-bonsai-27b`, `gemma-4-12b`) fails the test, because no backend serves those ids and the proxy would silently reroute the request instead of erroring

#### Scenario: Emergency fallback routes through the gateway

- **GIVEN** every candidate provider for a source/tier is claimed or on cooldown
- **WHEN** `route-provider.sh` emits its emergency fallback
- **THEN** the emitted `baseUrl` is the gateway `http://127.0.0.1:18235` and the `modelId` is the resolved pin — not an LM Studio backend port, which since T002551 serves embedding and reranking models only and therefore hosts no chat model at all

### Requirement: A locked factory model overrides every other model choice

When `factory.locked` is true in `scripts/llm/loadouts.json`, the Software Factory SHALL use
`factory.model` for every request it makes, and SHALL NOT consult any other source for the model
id. Specifically:

- `scripts/factory/route-provider.sh` SHALL emit the locked model over the gateway
  `http://127.0.0.1:18235` for **every** tier, including `opus`, before the `provider_config`
  candidate chain is read, and SHALL NOT claim a provider slot for it. No claim means no release obligation — the
  same reasoning that already governs the `opus` branch, which returns `slotId:null` precisely because its callers have no
  release path.
- `scripts/factory/dispatcher-bridge.sh` SHALL export `FACTORY_MODEL_ID` and
  `FACTORY_MODEL_LOCKED=1` into the pipeline process and SHALL pin `model_tier` to `flash`.

#### Scenario: Every tier resolves to the locked model

- **GIVEN** `factory.locked` is true with `factory.model = "gemma26-throughput"`
- **WHEN** `route-provider.sh factory-implement sonnet` and `route-provider.sh factory-scout opus` run
- **THEN** both emit `{"provider":"llamacpp","modelId":"gemma26-throughput","baseUrl":"http://127.0.0.1:18235",...}`

#### Scenario: The lock claims no provider slot

- **GIVEN** `factory.locked` is true
- **WHEN** `route-provider.sh` runs ten times in a row
- **THEN** `tickets.provider_health.active_agents` is unchanged, because the locked branch returns
  before the claim loop and therefore incurs no release obligation

#### Scenario: A locked run does not escalate on retry

- **GIVEN** `factory.locked` is true and a ticket enters its third attempt with `model_tier=sonnet`
- **WHEN** `dispatcher-bridge.sh` launches the pipeline
- **THEN** the pipeline runs on the locked local model, `FACTORY_MODEL_LOCKED=1` is set in its
  environment, and no request reaches an external provider

#### Scenario: The locked branch is not silent

- **GIVEN** `factory.locked` is true
- **WHEN** `route-provider.sh` takes the locked branch
- **THEN** it writes one line to stderr naming the locked model, so a run that never touches the
  candidate chain is distinguishable from one that walked it

#### Scenario: Unlocked leaves the database chain untouched

- **GIVEN** `factory.locked` is false
- **WHEN** `route-provider.sh factory-implement flash` runs
- **THEN** the ordinary `provider_config` candidate chain is evaluated unchanged — priority order,
  cooldown check and claim loop behave exactly as in the locked-absent case

#### Scenario: No proxy means no lock

- **GIVEN** nothing is listening on `127.0.0.1:18235`
- **WHEN** `route-provider.sh factory-implement flash` runs
- **THEN** it walks the ordinary candidate chain, because an unreadable pin is treated as absent

## REMOVED Requirements

### Requirement: Phase Pin Is the First Candidate, Not a Shortcut

**Grund der Entfernung:** Das Requirement verlangte, dass `route-provider.sh` eine Zeile in
`tickets.factory_model_slots` als hoechstprioeritaeren Kandidaten behandelt. Die Tabelle war die
einzige ihrer beiden Modell-Oberflaechen, die von keinem Runtime-Pfad ausser dem eigenen Router-
Pin gelesen wurde, und ihr Phase-Pin war genau der Bypass, den dieses Requirement urspruenglich
eingedaemmt hatte [T002359/T002369]. Mit T013302 entfaellt die Tabelle ersatzlos:
`tickets.provider_config` ist die einzige Routing-Quelle (Nachfolge-Requirement:
"Provider_config ist die einzige Kandidatenquelle des Routers"), und der Factory-Default lebt am
llm-proxy (`factory.model` via `/admin/factory`).
