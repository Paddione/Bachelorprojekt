# Delta Spec: Auth-Schnitt für Cockpit-Schreibaktionen und Brain-Anbindung

> Parent SSOT: `sdlc-cockpit`
> Änderungstyp: ADDED (legt den Auth-Schnitt für K4 und K6 fest)

## ADDED Requirements

### Requirement: Schreibaktionen laufen über die authentifizierte Admin-Fläche

The system SHALL execute the write actions from E5 that are runnable in the
cluster — setting ticket status and merging pull requests — through the
website's admin API, using the existing session authentication
(`getSession` + `isAdmin`, `403` otherwise). No separate authentication
mechanism SHALL be introduced for them.

The graded confirmation by reversibility (D5/D6), the audit log and the
four-state action slot (D4) SHALL remain in force regardless of which component
performs the action.

#### Scenario: An unauthenticated request is rejected

- **GIVEN** a write request to a cockpit admin endpoint
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`
- **AND** no action is performed

#### Scenario: A non-reversible action names its target

- **GIVEN** an action classified as non-reversible (merging a pull request)
- **WHEN** the user triggers it
- **THEN** the confirmation names the concrete target that must be confirmed
- **AND** the action is only performed after that confirmation

#### Scenario: Every write action is recorded

- **GIVEN** a performed write action
- **WHEN** it completes, whether successfully or not
- **THEN** the audit log holds an entry with timestamp, action and target

### Requirement: Local-only actions stay out of the browser write path

The system SHALL NOT route the write actions that can only run on a developer
machine — killing an agent session, removing a worktree, breaking a lock,
attaching a terminal — through the browser-to-daemon path while that path lacks
a designed authentication.

The reason is not difficulty but impossibility: there is no network route from
the cluster to a developer machine. Agent locks live in the local checkout's
`git-common-dir`, worktrees in the local filesystem, agent processes in the
local process table. These actions remain available on the command line.

#### Scenario: The daemon exposes no unauthenticated write path

- **GIVEN** the cockpit daemon is running
- **WHEN** a write request arrives without the local token
- **THEN** it is rejected with `401`
- **AND** the token is not obtainable over HTTP

### Requirement: Brain is read through the cluster-internal service

The system SHALL read the Brain wiki from the website's admin API via the
cluster-internal service address, not through the `oauth2-proxy` edge and not
from the local daemon. The endpoint SHALL enforce `isAdmin` itself, so that the
protection removed at the edge is restored at the API.

#### Scenario: Brain content requires an admin session

- **GIVEN** a request for Brain content through the cockpit
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`

#### Scenario: An unreachable Brain service is named, not hidden

- **GIVEN** the Brain service does not answer
- **WHEN** Brain content is requested
- **THEN** the response carries an `error` field
- **AND** an empty result set remains distinguishable from a failure (D13)

### Requirement: The adapter resolves each endpoint's host separately

The system SHALL decide **per endpoint** which host serves it, not by a single
base address for all of them. Each endpoint SHALL declare whether its data is
available from the website, only from the local daemon, or from both.

A single base switch is not sufficient and would break the admin page: of the
eight endpoints the adapter requests today, the website serves only three
(`portfolio`, `pods-list`, `factory-control`). Switching the base wholesale
would leave five panels on `404`.

The split follows from where the data actually lives, not from preference:

| Endpoint | Source | Available from |
|---|---|---|
| `portfolio`, `pods-list`, `factory-control` | database, kubectl, factory | website (exists today) |
| `epics` | ticket database | website (buildable) |
| `styles` | repository files | website (buildable) |
| `ci` | GitHub API | website (buildable) |
| `agents` | local agent locks in the checkout's `git-common-dir` | **local daemon only** |
| `models` | local model health ports on `127.0.0.1` | **local daemon only** |

`agents` and `models` are not merely unbuilt on the website — they read state
that exists only on a developer machine. They SHALL remain daemon-only.

#### Scenario: A website-backed endpoint is served by the website

- **GIVEN** the cockpit is served from the admin area
- **WHEN** the adapter requests an endpoint the website serves
- **THEN** it addresses the website's own origin

#### Scenario: A daemon-only endpoint is not silently requested from the website

- **GIVEN** the cockpit is served from the admin area
- **WHEN** a panel needs a daemon-only endpoint
- **THEN** the adapter does not request it from the website
- **AND** the panel reports that the source is unavailable in this context,
  rather than showing an empty result (D13)

#### Scenario: Standalone serves everything from the daemon

- **GIVEN** the cockpit is served as a standalone page
- **WHEN** the adapter requests any endpoint
- **THEN** it addresses the local daemon

### Requirement: The website reaches Brain through an explicit ingress policy

The system SHALL carry a NetworkPolicy that allows ingress from the `website`
namespace to the `brain` pod on its container port. Without it the request is
dropped: the `workspace` namespace carries `allow-intra-namespace-ingress` with
an empty pod selector, which denies everything from outside by default. Every
other service the website reaches has such a policy
(`allow-website-to-{shared-db,pocket-id,nextcloud,vaultwarden,docuseal}-ingress`);
`brain` is the one that is missing.

#### Scenario: The website reaches the Brain service

- **GIVEN** the website pod and the brain pod are running
- **WHEN** the website requests the brain service on its container port
- **THEN** the connection succeeds
- **AND** it does not pass through the `oauth2-proxy` edge
