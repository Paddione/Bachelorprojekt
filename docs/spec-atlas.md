# Spec Atlas

<!-- generiert von scripts/openspec-atlas.sh [T015012] — nicht handeditieren -->

Specs: 145 · Requirements: 2286 · Scenarios: 5082

## factory-pipeline

### agent-skills
Reqs: 61 · Scenarios: 131 · Lines: 1626
Last touches:
  - Interrupted git operations in worktrees are surfaced as a finding | T015784 | 2026-08-24 | MODIFIED
  - Post-Merge-Finalisierung als idempotente Skript-Einheit | T015916 | 2026-08-24 | MODIFIED
  - Der Post-Merge-Archivpfad unterscheidet archiviert von halb archiviert | T015783 | 2026-08-24 | ADDED
  - Schritt 8 nimmt eine unterbrochene Archivierung wieder auf | T015783 | 2026-08-24 | ADDED
  - Schritt 8 belegt seinen Abschluss am Positiv-Signal | T015783 | 2026-08-24 | ADDED
In-flight:
  - Plan-Frontmatter wird im Archiv-Arbeitsbaum auf completed gesetzt | T015916 | active | ADDED

### dev-flow-plan
Reqs: 31 · Scenarios: 68 · Lines: 842
Last touches:
  - JUnit-Shard-Artefakte sind gitignored — Worktree-Cleanup unblockiert | T006368 | 2026-08-15 | ADDED
  - plan-preflight pre-commit evaluates the staged set | T005114 | 2026-08-14 | ADDED
  - Worktree removal SHALL respect live agent-lock claims | T005115 | 2026-08-14 | ADDED
  - plan-context.sh filters by role | T002614 | 2026-08-13 | MODIFIED
  - plan-context.sh flags proposals without a domain anchor | T002614 | 2026-08-13 | ADDED

### health-goals
Reqs: 55 · Scenarios: 100 · Lines: 1265
Last touches:
  - Ein Health-Goal muss unter realistischen Umständen rot werden können | T013916 | 2026-08-23 | ADDED
  - Ein Messbefehl misst, was sein Titel behauptet | T013916 | 2026-08-23 | ADDED
  - Bewusste korczewski-Brand-Pause und hängende Admin-Jobs sind nachvollziehbar | T014537 | 2026-08-23 | ADDED
  - Runtime health measurements fail closed | T013429 | 2026-08-22 | ADDED
  - G-FLUX01 measures Flux reconciliation health | T013429 | 2026-08-22 | ADDED

### openspec-workflow
Reqs: 67 · Scenarios: 150 · Lines: 1654
Paths: scripts/openspec, openspec/
Last touches:
  - Atlas-Generierung erzeugt einen Requirement-granularen SSOT-Index | T015012 | 2026-08-23 | ADDED
  - Atlas nutzt die kanonische Delta-Grammatik | T015012 | 2026-08-23 | ADDED
  - Curatierte Gruppen sind View-Metadaten ohne SSOT-Eingriff | T015012 | 2026-08-23 | ADDED
  - Freshness-Check sichert Konsistenz der generierten Artefakte | T015012 | 2026-08-23 | MODIFIED
  - Der Archiv-Flow verifiziert die Status-Map vor dem Push | T006369 | 2026-08-15 | ADDED
In-flight:
  - Half-archive detection does not spawn a process per archive entry | T013673 | active | ADDED

### software-factory
Reqs: 207 · Scenarios: 633 · Lines: 5710
Paths: scripts/factory
Last touches:
  - Post-merge closure verifies ticket identity via pre-merge anchors (Identity-Guard) | T015670 | 2026-08-24 | ADDED
  - Identity-Guard decision is fail-closed and precedes the closure write | T015670 | 2026-08-24 | ADDED
  - Factory Dispatcher Runs In-Cluster | T016422 | 2026-08-24 | ADDED
  - Dev-Stack Pods Have a Writable Temp Directory | T016422 | 2026-08-24 | ADDED
  - SDLC Console Runs Fleet-Natively Without Host Endpoints | T016422 | 2026-08-24 | ADDED

## delivery

### ci-cd
Reqs: 113 · Scenarios: 332 · Lines: 3509
Paths: .github/workflows, scripts/tests, tests/
Last touches:
  - Baseline Guard PR Body Fallback and Hard Fail | T015384 | 2026-08-24 | ADDED
  - Die CI-Gegenprobe entlastet nur mit Belegen | T014466 | 2026-08-24 | ADDED
  - PR-Gate — Vitest (website) mit `--changed` Smart-Selection | T013468 | 2026-08-22 | MODIFIED
  - Factory Shard Setup Minimization | T013528 | 2026-08-22 | ADDED
  - Spec Runtime Manifest Completeness | T013528 | 2026-08-22 | ADDED
In-flight:
  - A unit test never removes itself from CI because a dependency was not installed | T013674 | active | ADDED
  - GitLab CI image refs carry a full registry host | T014566 | active | ADDED
  - Staging cronjobs run against a schema-complete database | T014566 | active | ADDED
  - Installed ticket-mcp-go binary staleness is detectable | T014735 | active | ADDED
  - Build embeds the git revision | T014735 | active | ADDED

### fleet-operations
Reqs: 45 · Scenarios: 88 · Lines: 907
Paths: wireguard/, scripts/fleet, scripts/wg-mesh, prod-fleet/
Last touches:
  - Staging Stack Is Wired Into Flux | T015004 | 2026-08-23 | ADDED
  - Rendered Staging CronJobs Target the Staging Website | T015004 | 2026-08-23 | ADDED
  - No failing CronJobs in the korczewski overlay | T012964 | 2026-08-22 | ADDED
  - Wildcard-Certificate ohne Reflector-Annotationen (T002880) | T002880 | 2026-08-14 | ADDED
  - Cluster Membership Matches the Declared Node Registry | T002630 | 2026-08-10 | ADDED

### workspace-deploy
Reqs: 90 · Scenarios: 167 · Lines: 1926
Paths: k3d/, prod/, prod-fleet/, prod-mentolder/, prod-korczewski/, Taskfile, environments/
Last touches:
  - Post-Deploy-Schritte nach dem Kustomize-Apply | T002184 | 2026-08-03 | ADDED
  - LiveKit-Rückstände sind weder im Repo noch im Cluster erlaubt | T002184 | 2026-08-03 | ADDED
  - The built image tag reaches the rendered manifest | T002209 | 2026-08-02 | ADDED
  - The image tag placeholder never renders empty | T002209 | 2026-08-02 | ADDED
  - discover-versions.sh ermittelt Tool-Versionen ohne Flux | T002083 | 2026-08-02 | MODIFIED

## llm

### llm-pipeline
Reqs: 86 · Scenarios: 202 · Lines: 2001
Paths: website/src/lib/llm, website/src/lib/embeddings, k3d/llm
Last touches:
  - LLM-GPU-Deployments laufen als Non-Root | T014553 | 2026-08-23 | ADDED
  - startUrl-Schema-Allowlist (http/https) | T005901 | 2026-08-14 | ADDED
  - bge-embed Memory-Limit ueber gemessenem Peak | T002580 | 2026-08-10 | ADDED
  - bge-m3 als primärer Embedding-Provider mit Voyage-Fallback | T002570 | 2026-08-10 | ADDED
  - LLM_EMBED_URL in knowledge-ingest CronJobs verdrahtet | T002570 | 2026-08-10 | ADDED

### local-llm-proxy
Reqs: 76 · Scenarios: 175 · Lines: 2023
Last touches:
  - Proxy as sole LLM gateway | T013302 | 2026-08-22 | MODIFIED
  - Backend registry and admin API | T013909 | 2026-08-22 | MODIFIED
  - Qwen3-Coder is available as an additive chat loadout | T013302 | 2026-08-22 | MODIFIED
  - A loadout pin blocks foreign start and stop | T013593 | 2026-08-22 | ADDED
  - A pin dies with its owner and fails closed when unreadable | T013593 | 2026-08-22 | ADDED
In-flight:
  - Decommissioned loadouts are excluded from GGUF-resolution verification | T004339 | active | ADDED
  - only surviving active loadouts are asserted as present | T004339 | active | ADDED

## product

### sdlc-cockpit
Reqs: 101 · Scenarios: 200 · Lines: 2406
Last touches:
  - Satellite Absorption Redirects | T013302 | 2026-08-22 | MODIFIED
  - Das KI-Deck führt genau eine Phase→Modell-Tabelle | T013302 | 2026-08-22 | ADDED
  - Der Factory-Default ist im KI-Deck sichtbar und setzbar | T013302 | 2026-08-22 | ADDED
  - Die Modellauswahl kennt die Modelle des Proxy | T013302 | 2026-08-22 | ADDED
  - The cockpit is the only administration surface for the llm-proxy | T013909 | 2026-08-22 | ADDED

### ticket-system
Reqs: 79 · Scenarios: 227 · Lines: 2102
Paths: scripts/ticket
Last touches:
  - Lesepfade unterscheiden kein-Treffer von falscher-Frage | T014386 | 2026-08-23 | ADDED
  - Filter-Validierung läuft vor dem Datenbankzugriff | T014386 | 2026-08-23 | ADDED
  - Ticket-Status-Werte sind in einem zentralen SSOT-Modul definiert | T007955 | 2026-08-15 | ADDED
  - backfill-id BATS-Verhaltenstests laufen bei erreichbarem Cluster tatsächlich | T002871 | 2026-08-10 | ADDED
  - Ticket listings hide test data by default | T002781 | 2026-08-10 | ADDED

### website-core
Reqs: 56 · Scenarios: 118 · Lines: 1139
Paths: website/src
Last touches:
  - Admin-Sidebar-Navigation | T003826 | 2026-08-11 | MODIFIED
  - routes:manifest suppresses raw Node stderr from the failed primary attempt | T002666 | 2026-08-10 | ADDED
  - The model id is resolved at runtime | T002612 | 2026-08-10 | ADDED
  - The model receives a semantic extract, not raw HTML | T002612 | 2026-08-10 | ADDED
  - Thinking is disabled client-side | T002612 | 2026-08-10 | ADDED

## Ungrouped

### active-sessions-hub
Reqs: 19 · Scenarios: 55 · Lines: 630
Last touches:
  - Session-Registry als Single Source of Truth | T016250 | 2026-08-24 | MODIFIED
  - Branch-scoped release refuses while the cwd is inside the lock's worktree | T006290 | 2026-08-15 | ADDED
  - Harness-Stable Session Identity for agent-lock | T005676 | 2026-08-14 | MODIFIED
  - Pre-Commit Guards in dev-flow-plan | T003116 | 2026-08-10 | MODIFIED
  - Mandatory Worktree Scoping for File-Writing Tools | T003116 | 2026-08-10 | MODIFIED

### admin-cockpit
Reqs: 45 · Scenarios: 132 · Lines: 1114
Paths: website/src/pages/admin, website/src/components/CockpitApp, website/src/components/Cockpit, website/src/api/admin/cockpit
Last touches:
  - External URLs render only with http/https schemes | T005900 | 2026-08-14 | ADDED
  - Dev-Status-Seite mit Tab-Navigation | T003826 | 2026-08-11 | MODIFIED
  - Cockpit Ticket-Expand-Row | T003826 | 2026-08-11 | MODIFIED
  - AdminLayout-Navigation enthält nur freigegebene Routen | T003826 | 2026-08-11 | MODIFIED
  - Admin-Sidebar-Struktur ohne Akkordeon | T003826 | 2026-08-11 | ADDED

### admin-nav-accordion
Reqs: 1 · Scenarios: 2 · Lines: 31
Last touches:
  - Sessions-Eintrag in Sidebar-Sektion Geschäft | T001638 | 2026-07-08 | ADDED

### admin-redirect-map
Reqs: 3 · Scenarios: 7 · Lines: 76
Last touches:
  - Legacy admin paths redirect via a central middleware map | T001789 | 2026-08-02 | ADDED
  - Dynamic conditional-redirect routes are preserved | T001789 | 2026-08-02 | ADDED
  - Redirect resolution is a pure, unit-tested function | T001789 | 2026-08-02 | ADDED

### admin-token-consolidation
Reqs: 4 · Scenarios: 7 · Lines: 107
Last touches:
  - Single color-token source in the Tailwind @theme layer | T002200 | 2026-07-26 | MODIFIED
  - Admin semantic color tokens are thin @theme aliases | T002200 | 2026-07-26 | MODIFIED
  - Single owner for sidebar width tokens | T001787 | 2026-07-11 | ADDED
  - Deliberate visual-regression baseline for the token migration | T001787 | 2026-07-11 | ADDED

### admin-ui-modal-drawer
Reqs: 4 · Scenarios: 8 · Lines: 103
Last touches:
  - Native dialog-based AdminModal primitive | T001788 | 2026-07-11 | ADDED
  - Snippet-based modal content API | T001788 | 2026-07-11 | ADDED
  - Side-anchored AdminDrawer variant | T001788 | 2026-07-11 | ADDED
  - Migrated dialogs preserve stable test selectors | T001788 | 2026-07-11 | ADDED

### agent-behavior
Reqs: 7 · Scenarios: 12 · Lines: 143
Last touches:
  - Domain agents declare no tools allowlist | T002651 | 2026-08-04 | ADDED
  - Prod-namespace write block | T001954 | 2026-07-19 | ADDED
  - Guard emits structured output | T001954 | 2026-07-19 | ADDED
  - Override requires explicit flag | T001954 | 2026-07-19 | ADDED

### agentic-review
Reqs: 8 · Scenarios: 13 · Lines: 169

### agentic-tooling-quality-goals
Reqs: 17 · Scenarios: 23 · Lines: 303
Last touches:
  - G-AGENTIC01 Subagent Tool-Scope Baseline Tracked | T002494 | 2026-08-02 | MODIFIED
  - G-AGENTIC09 God-Skill Line Budget Tracked | T002094 | 2026-08-02 | MODIFIED
  - G-AGENTIC08 No Dead Script/Task References In Skills Gate | T002303 | 2026-07-27 | MODIFIED
  - G-AGENTIC02 Subagent Routing Table Drift Gate | T001398 | 2026-07-01 | ADDED
  - G-AGENTIC03 Subagent Frontmatter Completeness Gate | T001398 | 2026-07-01 | ADDED

### agentic-trends-radar
Reqs: 6 · Scenarios: 7 · Lines: 112

### asset-generation
Reqs: 4 · Scenarios: 7 · Lines: 69

### astro-type-check
Reqs: 4 · Scenarios: 4 · Lines: 63

### auth-sso
Reqs: 36 · Scenarios: 76 · Lines: 837
Paths: website/src/lib/auth, website/src/middleware, website/src/pages/login, website/src/pages/logout, scripts/keycloak
Last touches:
  - Verhaltens-SSOT beschreibt Pocket ID als OIDC-Provider | T002179 | 2026-08-03 | ADDED
  - Historischer Keycloak-Kontext bleibt erhalten | T002179 | 2026-08-03 | ADDED
  - REQ-AUTHSSO-DBINIT-001 — Deterministic Pocket-ID database role provisioning | T002187 | 2026-08-02 | ADDED
  - REQ-AUTHSSO-DBINIT-002 — Database bootstrap fails loudly | T002187 | 2026-08-02 | ADDED
  - REQ-AUTHSSO-DBINIT-003 — API-key bootstrap resolves the real admin user | T002187 | 2026-08-02 | ADDED

### auto-triage-grounding-T002399
Reqs: 2 · Scenarios: 4 · Lines: 50
Last touches:
  - Auto-Triage holt ähnliche Tickets als Grounding-Kontext | T002399 | 2026-08-03 | ADDED
  - Auto-Triage hängt optionale Tool-Definitionen an und bleibt fail-soft | T002399 | 2026-08-03 | ADDED

### backup-pipeline
Reqs: 32 · Scenarios: 85 · Lines: 765
Paths: scripts/backup, k3d/backup
Last touches:
  - PVC-Clone-Lifecycle-Hygiene | T013044 | 2026-08-24 | ADDED
  - Render-sichere Runtime-Variablen im PVC-Backup-Skript | T014535 | 2026-08-23 | ADDED
  - Remote-Retention auf Filen (14 Generationen je Pfad) | T013300 | 2026-08-22 | ADDED
  - Erste-Fail-Alert für db-backup | T001738 | 2026-08-02 | ADDED
  - Manueller Diagnose-Trigger für db-backup | T001738 | 2026-08-02 | ADDED

### batch-coaching-llm-insights
Reqs: 5 · Scenarios: 10 · Lines: 89
Last touches:
  - Questionnaire answers are semantically analyzed into themed clusters | T003814 | 2026-08-14 | ADDED
  - Insights results are cached for 24 hours | T003814 | 2026-08-14 | ADDED
  - Session summaries are generated from all step contents | T003814 | 2026-08-14 | ADDED
  - Summary generation is idempotent | T003814 | 2026-08-14 | ADDED
  - Coaching content is only sent to on-premises providers | T003814 | 2026-08-14 | ADDED

### batch-factory-pipeline-robustness
Reqs: 3 · Scenarios: 6 · Lines: 73
Last touches:
  - Merged-PR-Gate schließt gemergte Tickets vor dem Dispatch | T014384 | 2026-08-23 | ADDED
  - The factory stops dispatching a plan after three consecutive no-commit runs | T003810 | 2026-08-14 | ADDED
  - The FACTORY_CTX default is visible immediately on sourcing lib.sh | T003810 | 2026-08-14 | ADDED

### batch-local-test-runner-fixes
Reqs: 3 · Scenarios: 3 · Lines: 39
Last touches:
  - Cockpit Vitest Suite mocks relative paths accurately | T004296 | 2026-08-14 | ADDED
  - Local test:changed skips E2E website gracefully when port 4321 is not reachable | T004296 | 2026-08-14 | ADDED
  - Code Quality import cycle gate resolves madge across worktrees | T004296 | 2026-08-14 | ADDED

### batch-mcp-introspection
Reqs: 4 · Scenarios: 4 · Lines: 49
Last touches:
  - Vollständige Triage-Projektion in ticket list | T003811 | 2026-08-13 | ADDED
  - OpenSpec-Such-URL defaultet lokal | T003811 | 2026-08-13 | ADDED
  - factory_ask antwortet vor dem Client-Timeout | T003811 | 2026-08-13 | ADDED
  - factory_phase_events Zeit-Spalte bleibt `at` | T003811 | 2026-08-13 | ADDED

### batch-openspec-embed-fixes
Reqs: 7 · Scenarios: 9 · Lines: 100
Last touches:
  - Partial-Dateien token-budgetiert embedden | T003491 | 2026-08-11 | ADDED
  - Port-Kollision nicht-fatal mit klarer Meldung | T003491 | 2026-08-11 | ADDED
  - Falsche "Backend nicht erreichbar"-Ursache korrigieren | T003491 | 2026-08-11 | ADDED
  - openspec.sh archive im Batch-Modus skalieren | T003491 | 2026-08-11 | ADDED
  - Platzhalter im Delta fail-closed ablehnen | T003491 | 2026-08-11 | ADDED

### batch-openspec-tooling-fixes
Reqs: 2 · Scenarios: 6 · Lines: 67
Last touches:
  - MODIFIED delta truncation is detected at merge time | T005310 | 2026-08-14 | ADDED
  - The propose tasks.md skeleton seeds the test path in directory form | T003812 | 2026-08-14 | ADDED

### batch-repo-hygiene-ops-fixes
Reqs: 11 · Scenarios: 25 · Lines: 301
Last touches:
  - Sweep überlebt leere ticket.sh-Antwort | T012412 | 2026-08-18 | MODIFIED
  - Runtime drift detection for replaced MCP server binaries | T004897 | 2026-08-15 | MODIFIED
  - Drift check never modifies system state | T004897 | 2026-08-15 | MODIFIED
  - branch-reaper unterstützt ticketlosen Sweep-Modus | T003490 | 2026-08-11 | ADDED
  - [gone]-Prune-Reihenfolge korrigieren | T003490 | 2026-08-11 | ADDED

### billing-pipeline
Reqs: 24 · Scenarios: 51 · Lines: 456
Paths: website/src/lib/billing, website/src/lib/invoice, website/src/lib/stripe, website/src/api/billing, website/src/pages/billing
Last touches:
  - Test Data Isolation in Billing | T015362 | 2026-08-24 | ADDED
  - GoBD Exemption for Test Data | T015362 | 2026-08-24 | ADDED
  - Test Data Purge of Billing Entities | T015362 | 2026-08-24 | ADDED
  - Invoice Lifecycle — Partial and Full Payment via UI and API | T002193 | 2026-07-26 | MODIFIED
  - Time Entry Date Falls Back to CURRENT_DATE When Omitted | T001351 | 2026-07-02 | ADDED

### brain-foundation
Reqs: 28 · Scenarios: 66 · Lines: 729
Last touches:
  - REQ-BRAIN-FOUNDATION-016 — From-Scratch Rebuild Mode | T012902 | 2026-08-19 | ADDED
  - REQ-BRAIN-FOUNDATION-017 — State File Type Repair | T012902 | 2026-08-19 | ADDED
  - REQ-BRAIN-FOUNDATION-018 — Temporal provenance metadata | T012913 | 2026-08-19 | ADDED
  - REQ-BRAIN-FOUNDATION-019 — Report-only lifecycle audit | T012913 | 2026-08-19 | ADDED
  - REQ-BRAIN-FOUNDATION-020 — Review-gated GitHub expertise source | T012913 | 2026-08-19 | ADDED

### brain-k2-bge
Reqs: 8 · Scenarios: 10 · Lines: 114
Last touches:
  - bge-mcp client env diagnostic (REQ-bge-01) | T002504 | 2026-08-02 | ADDED
  - BATS coverage for all three outcomes (REQ-bge-02) | T002504 | 2026-08-02 | ADDED
  - Documentation points at the diagnostic (REQ-bge-03) | T002504 | 2026-08-02 | ADDED
  - Diagramm mit beschrifteten Kanten (REQ-k2-01) | T002432 | 2026-08-02 | ADDED
  - Ist/Soll-Unterscheidung (REQ-k2-02) | T002432 | 2026-08-02 | ADDED

### brain-k3-code-graph
Reqs: 4 · Scenarios: 4 · Lines: 41
Last touches:
  - Diagramm mit beschrifteten Kanten (REQ-k3-01) | T002433 | 2026-08-02 | ADDED
  - Index-Erhebung (REQ-k3-02) | T002433 | 2026-08-02 | ADDED
  - Transport und Harness-Integration (REQ-k3-03) | T002433 | 2026-08-02 | ADDED
  - K1/K3-Verhältnis (Defekt D8) (REQ-k3-04) | T002433 | 2026-08-02 | ADDED

### brain-k4-brain-wiki
Reqs: 13 · Scenarios: 25 · Lines: 239
Last touches:
  - Dokumentierter Dry-Run-Einstieg ist ausführbar | T014543 | 2026-08-23 | ADDED
  - Brain-Ingest-Delivery-Integrität | T013041 | 2026-08-22 | ADDED
  - Brain MCP retrieval tools | T012913 | 2026-08-19 | ADDED
  - Offline retrieval quality evaluation | T012913 | 2026-08-19 | ADDED
  - Sektions-Chunking statt Kürzung (REQ-k4-04) | T002679 | 2026-08-09 | ADDED

### brain-k5-openspec
Reqs: 4 · Scenarios: 4 · Lines: 41
Last touches:
  - Diagramm mit beschrifteten Kanten (REQ-k5-01) | T002435 | 2026-08-02 | ADDED
  - Lebenszyklus und Auslöser (REQ-k5-02) | T002435 | 2026-08-02 | ADDED
  - Rückstau-Erhebung (REQ-k5-03) | T002435 | 2026-08-02 | ADDED
  - Defekt-Referenz (REQ-k5-04) | T002435 | 2026-08-02 | ADDED

### brain-k6-ticket-factory
Reqs: 4 · Scenarios: 5 · Lines: 59
Last touches:
  - factory_control hat einen Primary Key und dedupliziert Globaleinträge | T014545 | 2026-08-23 | ADDED
  - Diagramm mit beschrifteten Kanten (REQ-k6-01) | T002436 | 2026-08-02 | ADDED
  - Vollständige Erhebung (REQ-k6-02) | T002436 | 2026-08-02 | ADDED
  - Defekt-Referenz (REQ-k6-03) | T002436 | 2026-08-02 | ADDED

### brain-k7-agenten-mcp
Reqs: 4 · Scenarios: 4 · Lines: 60
Last touches:
  - Drei-Ebenen-Diagramm mit beschrifteten Kanten (REQ-k7-01) | T002437 | 2026-08-02 | ADDED
  - Erhebung von Registry, Renderern und Listenern (REQ-k7-02) | T002437 | 2026-08-02 | ADDED
  - Defekt-Referenz gegen T002430 (REQ-k7-03) | T002437 | 2026-08-02 | ADDED
  - Silent-Failure-Pfade (REQ-k7-04) | T002437 | 2026-08-02 | ADDED

### brain-k8-gesamtbild
Reqs: 3 · Scenarios: 3 · Lines: 36
Last touches:
  - Gesamtdiagramm mit beschrifteten Kanten (REQ-k8-01) | T002438 | 2026-08-02 | ADDED
  - Vollständige Defektliste (REQ-k8-02) | T002438 | 2026-08-02 | ADDED
  - Fehlende Kanten (REQ-k8-03) | T002438 | 2026-08-02 | ADDED

### brett
Reqs: 34 · Scenarios: 108 · Lines: 866
Paths: k3d/brett, brett/
Last touches:
  - Semantic Code Search — Indexer (SCS-1) | T002292 | 2026-07-27 | MODIFIED
  - Fig-panel edge-drawer with contextual edit tab | T002050 | 2026-07-21 | ADDED
  - Whole-figure drag across the floor plane | T002050 | 2026-07-21 | ADDED
  - Free 360-degree figure rotation | T002050 | 2026-07-21 | ADDED
  - Double-click on free floor always spawns a new figure | T002006 | 2026-07-20 | ADDED

### bug-consolidation-T002330
Reqs: 3 · Scenarios: 4 · Lines: 55
Last touches:
  - Bug-Verwaltung läuft ausschließlich über den tickets-Pfad | T002330 | 2026-08-03 | ADDED
  - Bug/Kategorie-Differenzierung über eine scope-Spalte | T002330 | 2026-08-03 | ADDED
  - FA-26 Bug-Report-E2E-Test ist auf den tickets-Pfad migriert | T002330 | 2026-08-03 | ADDED

### centralized-logging
Reqs: 16 · Scenarios: 35 · Lines: 396
Last touches:
  - Astro middleware entry point chains the logging middleware | T001434 | 2026-07-02 | ADDED
  - TODO | T000964 | 2026-06-21 | ADDED

### chat-inbox
Reqs: 17 · Scenarios: 43 · Lines: 367
Paths: website/src/components/Inbox, website/src/components/Chat, website/src/api/admin/chat

### coaching-sessions-polish-guide
Reqs: 16 · Scenarios: 24 · Lines: 273
Last touches:
  - Coaching-Session-Beat-Choreographie nach Geißler | T002138 | 2026-08-02 | ADDED
  - Zwei getrennte Beat-Wiederverwendungs-Mechanismen | T002138 | 2026-08-02 | ADDED
  - Vier Textbaustein-Konstanten für Phase-B/D-Schritte | T002138 | 2026-08-02 | ADDED
  - Exportierbares Vollprotokoll mit Executive Summary | T002138 | 2026-08-02 | ADDED
  - Session-Detailansicht als Popout-Fenster | T001638 | 2026-07-08 | ADDED

### collabora-integration
Reqs: 20 · Scenarios: 50 · Lines: 427
Paths: k3d/collabora, k3d/office-stack
Last touches:
  - Custom Setcap Image | T014549 | 2026-08-24 | MODIFIED
  - Spec-BATS smoke coverage | T002012 | 2026-07-21 | ADDED

### database-schema
Reqs: 1 · Scenarios: 1 · Lines: 19
Last touches:
  - Single-Column FK Index Coverage & Brand Constraints | T013031 | 2026-08-21 | ADDED

### database
Reqs: 52 · Scenarios: 99 · Lines: 984
Paths: scripts/db, scripts/migrate, website/src/lib/db, website/src/db
Last touches:
  - Automated Migration Runner | T002647 | 2026-08-10 | ADDED
  - Arena DB Health Check Endpoint Returns OK | T001800 | 2026-08-02 | REMOVED
  - Factory-DB-Migrationen laufen getrackt und automatisiert vor dem Deploy | T001677 | 2026-07-15 | ADDED
  - Factory-Migrations-Runner erkennt bereits real angewendete, aber ungetrackte Migrationen | T001677 | 2026-07-15 | ADDED
  - Legacy coaching.ki_config Tables Dropped After Provider-Config Phase 2 | T001676 | 2026-07-09 | ADDED

### datev-export
Reqs: 12 · Scenarios: 22 · Lines: 220
Paths: website/src/lib/datev, website/src/lib/skr, website/src/lib/legal

### db-identity-guard
Reqs: 3 · Scenarios: 7 · Lines: 74
Last touches:
  - Shared-db pod selection is unambiguous | T015168 | 2026-08-24 | ADDED
  - Database identity marker probe | T015168 | 2026-08-24 | ADDED
  - Identity constant parity between migration and guard | T015168 | 2026-08-24 | ADDED

### devflow-selection-archive-hardening
Reqs: 5 · Scenarios: 12 · Lines: 134
Last touches:
  - Merge-commit selection excludes archive commits | T009368 | 2026-08-18 | ADDED
  - Generated artifacts are excluded from change-diff selection | T002255 | 2026-07-27 | ADDED
  - Post-merge deploy does not build container images | T002255 | 2026-07-27 | ADDED
  - The archive reference describes a reproducible workflow | T002255 | 2026-07-27 | ADDED
  - Worktree limitations of ticket-mcp plan tools are documented | T002255 | 2026-07-27 | ADDED

### divergence-guard
Reqs: 14 · Scenarios: 44 · Lines: 472
Last touches:
  - The auto-stash restore resolves the stash by message, not by index | T006298 | 2026-08-15 | MODIFIED
  - Repository integrity is verified before worktree hygiene operations | T003539 | 2026-08-14 | ADDED
  - A dirty finding is confirmed by a second measurement | T003539 | 2026-08-14 | ADDED
  - Worktree iteration is registration-based, orphan directories are a finding | T003539 | 2026-08-14 | ADDED
  - Observable drift between hook and helper | T002817 | 2026-08-10 | RENAMED

### dsh-harness-integration
Reqs: 6 · Scenarios: 15 · Lines: 166
Last touches:
  - the repo ships a dsh bundle that mounts its own plugins | T012962 | 2026-08-20 | ADDED
  - the existing Claude hook config runs under dsh | T012962 | 2026-08-20 | ADDED
  - a native guard plugin enforces the worktree write rule | T012962 | 2026-08-20 | ADDED
  - dsh is a selectable factory executor | T012962 | 2026-08-20 | ADDED
  - dsh sessions are visible in the existing phase-event timeline | T012962 | 2026-08-20 | ADDED

### e2e-bug-report-testdata-T002385
Reqs: 1 · Scenarios: 2 · Lines: 30
Last touches:
  - E2E-Bug-Report-Testdaten sind als solche erkennbar | T002385 | 2026-08-03 | ADDED

### e2e-test-infrastructure
Reqs: 31 · Scenarios: 57 · Lines: 788
Last touches:
  - REQ-E2E-INFRA-030 — A skip modifier applies to the test it names, never to its enclosing group | T013329 | 2026-08-22 | ADDED
  - REQ-E2E-INFRA-031 — E2E specs assert against the running application, not the repository | T013329 | 2026-08-22 | ADDED
  - REQ-E2E-INFRA-032 — A guard that always fires belongs outside the nightly run | T013329 | 2026-08-22 | ADDED
  - REQ-E2E-INFRA-033 — Every authentication domain of the nightly run has its credential supplied | T013329 | 2026-08-22 | ADDED
  - Optional vision-assisted verification (REQ-k8-04) | T012781 | 2026-08-19 | MODIFIED

### e2e-testing
Reqs: 7 · Scenarios: 11 · Lines: 138
Last touches:
  - E2E Playwright Suite Path Alignment & Flag Resilience | T013029 | 2026-08-21 | ADDED
  - Systemtest Purge Endpoint Positive Assertion | T002730 | 2026-08-09 | ADDED
  - Exactly one contentinfo landmark per rendered page | T000254 | 2026-07-27 | ADDED
  - The brand link carries an explicit accessible name | T000254 | 2026-07-27 | ADDED
  - Brand text assertions match the shipped wording | T000254 | 2026-07-27 | ADDED

### env-seal-empty-value-keys
Reqs: 3 · Scenarios: 6 · Lines: 106
Last touches:
  - env-seal extra_namespaces honours schema `required` flag | T001198 | 2026-08-02 | ADDED
  - Backwards-compatible re-seal (mentolder identity, korczewski additive only) | T001198 | 2026-08-02 | ADDED
  - Test coverage for the empty-value-key bug | T001198 | 2026-08-02 | ADDED

### exclude-latest-images
Reqs: 1 · Scenarios: 2 · Lines: 29
Last touches:
  - Deployment-Listen und -Anweisungen schließen :latest-Images aus | T001781 | 2026-08-03 | ADDED

### factory-attempt-counter-T002389
Reqs: 1 · Scenarios: 2 · Lines: 31
Last touches:
  - Attempt-Zähler unterscheidet Modell-Versagen von Infrastruktur-Abbruch | T002389 | 2026-08-03 | ADDED

### factory-escalation-ladder
Reqs: 2 · Scenarios: 2 · Lines: 31
Last touches:
  - Progressive Model Escalation | T002369 | 2026-08-02 | ADDED
  - Named escalation in watchdog comments | T002369 | 2026-08-02 | ADDED

### factory-gang
Reqs: 1 · Scenarios: 1 · Lines: 23
Last touches:
  - Parallel Gang Execution in pipeline.mjs | T002129 | 2026-08-02 | ADDED

### factory-reclaim-lock-respect
Reqs: 6 · Scenarios: 14 · Lines: 169
Last touches:
  - Activity heartbeat keeps claims alive | T015822 | 2026-08-24 | ADDED
  - Active-process check precedes pid-based reap | T015822 | 2026-08-24 | ADDED
  - A public branch-liveness check is available to reap paths | T002896 | 2026-08-10 | ADDED
  - worktree-create.sh's idempotency-remove respects a live foreign claim | T002896 | 2026-08-10 | ADDED
  - factory cleanup.sh skips branches and worktrees under a live foreign claim | T002896 | 2026-08-10 | ADDED

### factory-scout-backoff
Reqs: 2 · Scenarios: 3 · Lines: 43
Last touches:
  - Scout-weak-Tickets werden nach wiederholten Fehlern eskaliert | T002003 | 2026-08-03 | ADDED
  - Dispatcher wendet Backoff auf scout_weak-Tickets an | T002003 | 2026-08-03 | ADDED

### factory-session-reuse
Reqs: 3 · Scenarios: 3 · Lines: 33
Last touches:
  - Session reuse in factory pipeline | T002072 | 2026-08-02 | ADDED
  - Graceful fallback on session loss | T002072 | 2026-08-02 | ADDED
  - Timeout handling with session reuse | T002072 | 2026-08-02 | ADDED

### factory-trace-collector-pass-done
Reqs: 4 · Scenarios: 7 · Lines: 84
Last touches:
  - Erfolgsfilter nutzt das reale verify/done-Signal | T006282 | 2026-08-15 | ADDED
  - Kontext-Anreicherung ist Flag-gesteuert und ändert den Default nicht | T006252 | 2026-08-15 | ADDED
  - Kommentar-Rollen-Mapping folgt der E7-Konvention | T006252 | 2026-08-15 | ADDED
  - Secret-Redaktion erstreckt sich auf angereicherte Felder | T006252 | 2026-08-15 | ADDED

### factory-watchdog
Reqs: 5 · Scenarios: 5 · Lines: 77
Last touches:
  - Claim-Readiness-Gate vor Gang-Slot-Claim | T015556 | 2026-08-24 | ADDED
  - Unlesbarer INFRA-Counter blockiert Eskalation nicht dauerhaft | T015556 | 2026-08-24 | ADDED
  - DB-Identitätscheck vor Reset-Writes | T015556 | 2026-08-24 | ADDED
  - STALE_MIN-Floor in Produktion | T015556 | 2026-08-24 | ADDED
  - Ticket-Status-Reaper für verwaiste in_progress | T002770 | 2026-08-09 | ADDED
In-flight:
  - Worktree-Aktivitätsschutz vor Zombie-Löschung | T016418 | active | ADDED
  - Serialisierung von Heartbeat-TTL-Reap und Zombie-Purge | T016418 | active | ADDED
  - factory_excluded-Tickets bleiben vom eigenen Watchdog verschont | T016418 | active | ADDED

### fix-factory-lock-worktree-safety
Reqs: 4 · Scenarios: 8 · Lines: 80
Last touches:
  - Branch-Lock vor jedem Worktree-Schreibzugriff | T003677 | 2026-08-14 | ADDED
  - Defer statt Ueberschreiben bei fremdem Live-Lock | T003677 | 2026-08-14 | ADDED
  - Cleanup-Reihenfolge Lock-Freigabe vor Worktree-Entfernung | T003677 | 2026-08-14 | ADDED
  - Create-Skript verifiziert den realen Worktree-Pfad | T004604 | 2026-08-14 | ADDED

### fix-ticket-tracking-T002279
Reqs: 2 · Scenarios: 3 · Lines: 42
Last touches:
  - Beiläufig gefixte Tickets werden beim Merge geschlossen | T002279 | 2026-08-03 | ADDED
  - Post-Merge-Hook räumt offene Tickets auf | T002279 | 2026-08-03 | ADDED

### fix-update-status-planstaged-guard-T002876
Reqs: 1 · Scenarios: 2 · Lines: 29
Last touches:
  - update-status verweigert plan_staged ohne Plan-Referenz | T002876 | 2026-08-10 | ADDED

### fix-wakeup-help-T002662
Reqs: 2 · Scenarios: 2 · Lines: 35
Last touches:
  - wakeup.sh beantwortet --help mit Usage ohne Seiteneffekte | T002662 | 2026-08-10 | ADDED
  - wakeup.sh weist unbekannte Argumente ab | T002662 | 2026-08-10 | ADDED

### flux-render-security
Reqs: 6 · Scenarios: 11 · Lines: 159
Last touches:
  - Immutable Image References in Rendered Prod Overlays | T004041 | 2026-08-14 | MODIFIED
  - Placeholder-Digests erreichen nie ein Artefakt (fail-closed) | T004041 | 2026-08-14 | ADDED
  - Digest Resolution Is Fail-Closed Online | T002706 | 2026-08-10 | ADDED
  - Every Artifact Push Carries an Immutable Revision Tag | T002706 | 2026-08-10 | ADDED
  - Bootstrap Placeholders Must Be Covered by envsubst | T002869 | 2026-08-10 | ADDED
In-flight:
  - OCIRepositories pin a deterministic sha revision | T014550 | active | ADDED
  - Render workflow advances the pin automatically | T014550 | active | ADDED

### g-db01-fk-indexes
Reqs: 2 · Scenarios: 2 · Lines: 57
Last touches:
  - Alle bekannten Single-Column-FK-Spalten ohne Index werden indiziert | T001946 | 2026-08-03 | ADDED
  - Migration ist additiv, idempotent und brand-übergreifend sicher | T001946 | 2026-08-03 | ADDED

### grilling-flow
Reqs: 21 · Scenarios: 35 · Lines: 423
Paths: website/src/components/Grilling

### harness-workflow-split
Reqs: 6 · Scenarios: 11 · Lines: 145
Last touches:
  - opencode has native dev-flow and git-workflow skills | T013724 | 2026-08-22 | MODIFIED
  - shared openspec-* skills are harness-neutral | T013724 | 2026-08-22 | MODIFIED
  - AGENTS.md declares an opencode-native dispatch protocol | T013724 | 2026-08-22 | REMOVED
  - opencode worktree isolation stays git-crypt-safe | T013724 | 2026-08-22 | MODIFIED
  - AGENTS.md declares the shared-source routing | T013724 | 2026-08-22 | ADDED
In-flight:
  - opencode has native dev-flow and git-workflow skills | T014086 | active | MODIFIED
  - AGENTS.md declares the shared-source routing | T014086 | active | MODIFIED

### k3d-kustomization-T002349
Reqs: 1 · Scenarios: 2 · Lines: 30
Last touches:
  - Kustomize-Basis schreibt keine managed-by-Selektoren in Deployment-Selectors | T002349 | 2026-08-03 | ADDED

### llm-local-dev
Reqs: 23 · Scenarios: 50 · Lines: 549
Paths: openclaw/, Taskfile.openclaw
Last touches:
  - Model-Agnostic Active Alias for FreeToken-Native Agents | T016419 | 2026-08-24 | MODIFIED
  - Project Default Model Targets the FreeToken Alias | T016419 | 2026-08-24 | ADDED
  - Dead Checkpoints Are Not Declared | T016419 | 2026-08-24 | ADDED
  - Single Definition Site for the opencode `freetoken-local` Provider | T014105 | 2026-08-23 | ADDED
  - Measured Context Limits for FreeToken Checkpoints | T014105 | 2026-08-23 | ADDED

### main-commit-guard
Reqs: 1 · Scenarios: 3 · Lines: 37
Last touches:
  - Pre-Commit blockiert Commits auf main | T002631 | 2026-08-10 | ADDED

### mcp-gateway
Reqs: 28 · Scenarios: 73 · Lines: 850
Paths: deploy/mcp/, .claude/skills/references/mcp-tool-guide.md, scripts/mcp
Last touches:
  - mcp-kubernetes und mcp-postgres laufen mit read-only Identität | T006335 | 2026-08-15 | MODIFIED
  - Multi-Statement Queries Rejected Instead of Empty Array | T006293 | 2026-08-15 | ADDED
  - update-status.sh uses heredoc and guards terminal transitions | T003072 | 2026-08-14 | MODIFIED
  - agy Headless MCP Tool Permission Bypass | T002719 | 2026-08-10 | ADDED
  - Spec Tests Never Mutate Tracked MCP Config Artifacts | T002941 | 2026-08-10 | ADDED

### mcp-skill-integration
Reqs: 7 · Scenarios: 17 · Lines: 183
Last touches:
  - Mishap bundling emits fewer tickets than it consumes | T002383 | 2026-07-28 | ADDED
  - ticket-mcp adapter completeness | T001211 | 2026-06-27 | ADDED
  - Go-consolidated MCP runtime with no capability loss | T001211 | 2026-06-27 | ADDED
  - MCP-first skill routing | T001211 | 2026-06-27 | ADDED
  - MCP tool-guide as mapping SSOT | T001211 | 2026-06-27 | ADDED

### mcp-task-runner
Reqs: 9 · Scenarios: 20 · Lines: 230
Last touches:
  - local WSL binary | T006664 | 2026-08-15 | MODIFIED
  - plan_tasks | T005596 | 2026-08-14 | MODIFIED
  - cancel_task | T005592 | 2026-08-14 | MODIFIED
  - run_task | T001017 | 2026-06-21 | ADDED
  - execute_plan | T001017 | 2026-06-21 | ADDED

### mediaviewer
Reqs: 20 · Scenarios: 37 · Lines: 416
Paths: website/src/components/Mediaviewer, website/src/components/MediaviewerPanel, k3d/mediaviewer-widget
Last touches:
  - Spec-BATS smoke coverage | T002012 | 2026-07-21 | ADDED

### merge-arbitration
Reqs: 7 · Scenarios: 12 · Lines: 134
Last touches:
  - N-way collision detection across open pull requests | T002423 | 2026-07-28 | ADDED
  - Exclusion of generated artifacts | T002423 | 2026-07-28 | ADDED
  - Arbitration pull requests are excluded from detection | T002423 | 2026-07-28 | ADDED
  - Idempotent arbitration per cluster state | T002423 | 2026-07-28 | ADDED
  - Synthesis output is validated before use | T002423 | 2026-07-28 | ADDED

### micro-spec-consolidation
Reqs: 1 · Scenarios: 2 · Lines: 31
Last touches:
  - Consolidation of Micro-Specs into Parent SSOT Specs | T002014 | 2026-08-03 | ADDED

### mishap-bundle-dev-flow-scripts
Reqs: 3 · Scenarios: 3 · Lines: 32
Last touches:
  - W3-PARTIAL-NO-FALSE-POSITIVE | T002342 | 2026-08-02 | ADDED
  - CLAUDE-DEPRECATED-HOOK | T002342 | 2026-08-02 | ADDED
  - COMMIT-SCOPE-ALLOWLIST | T002342 | 2026-08-02 | ADDED

### mishap-bundle-infra-testspec-ci
Reqs: 7 · Scenarios: 7 · Lines: 74
Last touches:
  - worktree-create.sh validation | T002448 | 2026-08-02 | ADDED
  - commit-msg hook rejection output | T002448 | 2026-08-02 | ADDED
  - agent-lock worktree path normalization | T002448 | 2026-08-02 | ADDED
  - Test results vs Implementation check | T002448 | 2026-08-02 | ADDED
  - agent-lock reap PID liveness | T002448 | 2026-08-02 | ADDED

### mishap-ci-scripts
Reqs: 3 · Scenarios: 4 · Lines: 61

### mishap-docker-wsl-T002250
Reqs: 2 · Scenarios: 3 · Lines: 33
Last touches:
  - WSL Docker Credential Helper Auto-Heal in setup.sh | T002250 | 2026-08-02 | ADDED
  - Stable Container DNS in WSL | T002250 | 2026-08-02 | ADDED

### mishap-t001978
Reqs: 1 · Scenarios: 1 · Lines: 24
Last touches:
  - background-agents auto-retries on empty output | T001978 | 2026-08-02 | ADDED

### mishap-t002240
Reqs: 4 · Scenarios: 6 · Lines: 73
Last touches:
  - Empty-branch push guard | T002240 | 2026-07-26 | ADDED
  - Nearest-scope suggestion on unknown commit scopes | T002240 | 2026-07-26 | ADDED
  - Mishap-tracker slug and branch name are distinct | T002240 | 2026-07-26 | ADDED
  - Eval replay dry-run is repository-state independent | T002240 | 2026-07-26 | ADDED

### mishap-t002242
Reqs: 3 · Scenarios: 4 · Lines: 60
Last touches:
  - M1 — Fail-closed Phase-Chain-Gate in devflow-ci-watch.sh | T006370 | 2026-08-15 | MODIFIED
  - M2 — Git-Status-Guard vor Force-Remove in watchdog.sh | T002242 | 2026-07-26 | ADDED
  - M3 — Exit-Code-Sammlung in devflow-post-merge-deploy.sh | T002242 | 2026-07-26 | ADDED

### mishap-t002243
Reqs: 1 · Scenarios: 1 · Lines: 20
Last touches:
  - --create-new für Mishap-Bundles dokumentieren | T002243 | 2026-07-26 | ADDED

### mishap-t002284
Reqs: 3 · Scenarios: 3 · Lines: 50
Last touches:
  - ticket get JSON projects resolution, severity, and description | T002284 | 2026-08-02 | ADDED
  - dev-flow-execute implementer prompt forbids nested delegation | T002284 | 2026-08-02 | ADDED
  - pre-commit warns on a neutralized staged freshness file | T002284 | 2026-08-02 | ADDED

### mishap-t002457
Reqs: 1 · Scenarios: 1 · Lines: 17
Last touches:
  - Mishap bundle placeholder delta | T002457 | 2026-08-02 | ADDED

### mishap-t002718
Reqs: 1 · Scenarios: 1 · Lines: 17
Last touches:
  - Coverage guard recommendations | T002718 | 2026-08-10 | ADDED

### mishap-tracking
Reqs: 6 · Scenarios: 13 · Lines: 171
Last touches:
  - Factory-Fix-Tickets verwenden nicht plan_staged ohne Plan | T014104 | 2026-08-23 | MODIFIED
  - Nicht-kritische Mishaps werden am Verursacher-Ticket vermerkt | T014104 | 2026-08-23 | ADDED
  - Kein Automat erzeugt Mishap-Sammelcontainer | T014104 | 2026-08-23 | ADDED
  - Der Mishap-Buffer aggregiert, er konvertiert nicht | T003120 | 2026-08-10 | ADDED
  - Dublettenerkennung vergleicht Komponente und Dateipfade, nicht nur Titel | T003120 | 2026-08-10 | ADDED

### modell-registry-training-grounds
Reqs: 1 · Scenarios: 4 · Lines: 37
Last touches:
  - Model Registry tracks adapters across suitability, stats, provenance, and deployment | T002629 | 2026-08-14 | ADDED

### monitoring-alerts
Reqs: 20 · Scenarios: 31 · Lines: 362
Paths: k3d/prometheus, k3d/alertmanager, k3d/grafana
Last touches:
  - Alerts aus den Workspace-Namespaces erreichen einen Empfänger | T015712 | 2026-08-24 | ADDED
  - Backup-Job-Failures lösen kritischen Alert aus | T015712 | 2026-08-24 | ADDED
  - Ausgebliebene Backup-Erfolge lösen Stale-Alert aus | T015712 | 2026-08-24 | ADDED
  - Suspendierte CronJobs erzeugen keinen Alarm | T015712 | 2026-08-24 | ADDED
  - Backup-Alerts decken beide Brands ab | T015712 | 2026-08-24 | ADDED
In-flight:
  - Mandatory Alert Set | T016124 | active | MODIFIED
  - Backup-Job-Failures lösen kritischen Alert aus | T016124 | active | MODIFIED
  - Ausgebliebene Backup-Erfolge lösen Stale-Alert aus | T016124 | active | MODIFIED
  - Die wöchentliche Restore-Verifikation hat eine eigene Schwelle | T016124 | active | ADDED
  - Namespace-Scoping bleibt für andere AlertmanagerConfigs erhalten | T016124 | active | ADDED

### newsletter-system
Reqs: 22 · Scenarios: 29 · Lines: 331
Paths: website/src/lib/newsletter, website/src/api/newsletter, website/src/pages/newsletter, k3d/newsletter

### nextcloud-integration
Reqs: 25 · Scenarios: 46 · Lines: 462
Paths: k3d/nextcloud
Last touches:
  - Spec-BATS smoke coverage | T002012 | 2026-07-21 | ADDED

### opencode-local-model-runner
Reqs: 3 · Scenarios: 4 · Lines: 47
Last touches:
  - Declared context must be measured | T002753 | 2026-08-09 | ADDED
  - Agent naming matches the backing model | T002753 | 2026-08-09 | ADDED
  - opencode workflow runs on a fleet self-hosted runner | T001780 | 2026-08-02 | ADDED
  - opencode workflow rejects fork-originated PRs | T001780 | 2026-08-02 | ADDED
  - opencode workflow uses the local model instead of the cloud API | T001780 | 2026-08-02 | ADDED

### openspec-embedding-T002334
Reqs: 1 · Scenarios: 2 · Lines: 25
Last touches:
  - post-commit-hook-embedding | T002334 | 2026-08-02 | ADDED

### openspec-embedding
Reqs: 11 · Scenarios: 24 · Lines: 290
Last touches:
  - Wrapper success check fails on a completeness-gate warning | T004829 | 2026-08-14 | MODIFIED
  - Embed-Local-Wrapper retried transiente Backend-Fehler | T004608 | 2026-08-14 | ADDED
  - Completeness-Gate zählt lokale Pläne per Slug und wertet Toleranz | T002877 | 2026-08-11 | ADDED
  - Stale Collection-Einträge verfälschen die Coverage-Zählung nicht | T002877 | 2026-08-11 | ADDED
  - Port-Forward identity is verified before use | T002870 | 2026-08-10 | ADDED

### openspec-pgvector
Reqs: 11 · Scenarios: 15 · Lines: 189
Last touches:
  - Bundled context retrieval CLI | T002658 | 2026-08-14 | ADDED
  - Provenance marker on every emitted block | T002658 | 2026-08-14 | ADDED
  - Pinned guardrails outside the token budget | T002658 | 2026-08-14 | ADDED
  - Retrieval quality is guarded by a golden query set | T002658 | 2026-08-14 | ADDED
  - HNSW index on knowledge.chunks is restored and verified | T002658 | 2026-08-14 | ADDED

### openspec-upstream-cli
Reqs: 6 · Scenarios: 11 · Lines: 140
Last touches:
  - Delta-merge handles MODIFIED operation in-place | T001262 | 2026-06-28 | ADDED
  - Delta-merge handles REMOVED operation by deletion | T001262 | 2026-06-28 | ADDED
  - Delta-merge handles RENAMED operation | T001262 | 2026-06-28 | ADDED
  - Validator rejects stub requirements | T001262 | 2026-06-28 | ADDED
  - Validator cross-references MODIFIED and REMOVED targets | T001262 | 2026-06-28 | ADDED

### openspec-worktree-anchor
Reqs: 1 · Scenarios: 2 · Lines: 34
Last touches:
  - openspec.sh SHALL anchor REPO on the caller's working directory | T001997 | 2026-08-02 | ADDED

### phase-events
Reqs: 1 · Scenarios: 1 · Lines: 22
Last touches:
  - Partial-done state accepted | T002130 | 2026-08-02 | ADDED

### pipeline-divergence-T002393
Reqs: 2 · Scenarios: 4 · Lines: 50
Last touches:
  - pipeline.mjs enthält alle Blöcke aus pipeline.js | T002393 | 2026-08-03 | ADDED
  - Kontrakttests laufen gegen den dispatched-Pfad | T002393 | 2026-08-03 | ADDED

### plan-ref-lifecycle-fixes
Reqs: 3 · Scenarios: 3 · Lines: 31
Last touches:
  - Plan-ref pre-flight validation | T002044 | 2026-08-02 | ADDED
  - Superseding FACTORY-PLAN-REF pattern | T002044 | 2026-08-02 | ADDED
  - Specs delta dir in plan template | T002044 | 2026-08-02 | ADDED

### planning-office
Reqs: 31 · Scenarios: 63 · Lines: 563
Paths: website/src/lib/planning-office, website/src/lib/clarification, website/src/pages/planning, website/src/api/planning
Last touches:
  - Planning Office Covers Epics | T002617 | 2026-08-10 | ADDED
  - Epics Start In The Editable State | T002617 | 2026-08-10 | ADDED
  - Locking An Epic Freezes Its Lastenheft | T002617 | 2026-08-10 | ADDED
  - Epics Are Distinguishable From Features In The Planning List | T002617 | 2026-08-10 | ADDED

### pocket-id-seed-early-abort
Reqs: 1 · Scenarios: 2 · Lines: 32
Last touches:
  - pocket-id-client-seed SHALL abort early on invalid API key | T001995 | 2026-08-02 | ADDED

### pocket-id-seed-pagination
Reqs: 1 · Scenarios: 2 · Lines: 31
Last touches:
  - pocket-id-client-seed SHALL search all pages of oidc_clients | T001996 | 2026-08-02 | ADDED

### portal
Reqs: 35 · Scenarios: 79 · Lines: 742
Paths: website/src/components/Portal, website/src/pages/portal
Last touches:
  - Profil-Validierung ist ohne DB- und Vite-Abhängigkeiten testbar | T003144 | 2026-08-14 | ADDED
  - Projekt-Persistenz ausserhalb des `tickets`-Schemas | T002722 | 2026-08-09 | ADDED

### projekttickets-cockpit
Reqs: 5 · Scenarios: 12 · Lines: 103
Last touches:
  - BATS Placeholder Test Coverage | T002010 | 2026-07-21 | ADDED
  - Container-Vollansicht für project/feature-Tickets | T000950 | 2026-06-21 | ADDED
  - Container-Datenquellen in reinem pg-Modul | T000950 | 2026-06-21 | ADDED
  - Status-Labels aus cockpit-labels.ts SSOT | T000950 | 2026-06-21 | ADDED
  - Sidekick-Eintrag „Projekttickets" | T000950 | 2026-06-21 | ADDED

### questionnaire-system
Reqs: 30 · Scenarios: 71 · Lines: 647
Paths: website/src/components/Questionnaire, website/src/api/admin/questionnaire

### quickwins-script-fixes
Reqs: 3 · Scenarios: 4 · Lines: 45
Last touches:
  - touched_files enthält real geänderte Dateien | T003276 | 2026-08-10 | ADDED
  - preflight-pr-scope-Test deterministisch | T003276 | 2026-08-10 | ADDED
  - Backup-Restore-Check erkennt beschädigte Downloads | T003276 | 2026-08-10 | ADDED

### react-homepage-blocks
Reqs: 5 · Scenarios: 13 · Lines: 137
Last touches:
  - Block-Dokument-Schema (Zod) | T001056 | 2026-06-21 | ADDED
  - Block-getriebenes Homepage-Rendering mit Parität (Null-Diff) | T001056 | 2026-06-21 | ADDED
  - Fail-closed Schema-Versionierung | T001056 | 2026-06-21 | ADDED
  - Committeter Seed = heutiger gerenderter Content | T001056 | 2026-06-21 | ADDED
  - Test-Stack für mentolder-web | T001056 | 2026-06-21 | ADDED

### react-login-edit-homepage
Reqs: 4 · Scenarios: 10 · Lines: 98
Last touches:
  - React-Site-Login via Astro-Auth-Wiederverwendung | T001160 | 2026-06-27 | ADDED
  - „Edit Homepage"-Eintrag neben Admin-Menü/User-Profil | T001160 | 2026-06-27 | ADDED
  - Versioniertes Homepage-Block-Dokument | T001160 | 2026-06-27 | ADDED
  - Fail-closed Auth-Surface (CORS + returnTo-Allowlist) | T001160 | 2026-06-27 | ADDED

### repo-structure
Reqs: 8 · Scenarios: 12 · Lines: 150
Last touches:
  - The drift guard is order-independent against stray empty directories | T011792 | 2026-08-18 | ADDED
  - Repo root carries only harness and GitHub convention files | T006999 | 2026-08-15 | ADDED
  - Build components live under components/ | T006999 | 2026-08-15 | ADDED
  - packages/ holds npm packages | T006999 | 2026-08-15 | ADDED
  - assets/ holds branding assets | T006999 | 2026-08-15 | ADDED

### routing-check-freetoken-t014552
Reqs: 1 · Scenarios: 1 · Lines: 21
Last touches:
  - Routing checks use only enabled provider configurations | T014552 | 2026-08-23 | ADDED

### rustdesk-server
Reqs: 9 · Scenarios: 16 · Lines: 194
Last touches:
  - RustDesk-Server-Pods laufen als Non-Root | T014553 | 2026-08-23 | ADDED
  - NetworkPolicy-Bypass-Ausnahme ist dokumentiert | T014553 | 2026-08-23 | ADDED
  - REQ-RUSTDESK-RELAY-007 — On-Demand-Lifecycle für hbbs/hbbr | T015170 | 2026-08-23 | ADDED
  - REQ-RUSTDESK-WEB-001 — SSO-gegateter Web-Client-Zugriff | T012645 | 2026-08-20 | MODIFIED
  - REQ-RUSTDESK-RELAY-004 — Minimale Portfläche ohne Web-Client | T001381 | 2026-08-02 | RENAMED

### scripts
Reqs: 6 · Scenarios: 9 · Lines: 107
Last touches:
  - archive stages the openspec status map unconditionally | T006371 | 2026-08-15 | ADDED
  - agent-lock check unterscheidet tote Halter | T005560 | 2026-08-15 | ADDED
  - ticket write guard passes through stale holders | T005560 | 2026-08-15 | ADDED
  - plan-preflight pre-commit accepts the staged plan set | T004899 | 2026-08-14 | ADDED
  - Worktrees claimed by a live session survive foreign cleanups | T004899 | 2026-08-14 | ADDED

### sdlc-isolation
Reqs: 29 · Scenarios: 54 · Lines: 630
Last touches:
  - Single Entry Point for the Local SDLC Stack | T002656 | 2026-08-13 | MODIFIED
  - Health Gate Reports Diagnosable Failure | T002656 | 2026-08-13 | MODIFIED
  - sdlc:up starts the local chat loadout before the health gate | T002656 | 2026-08-13 | ADDED
  - sdlc:down stops the chat loadout before the proxy | T002656 | 2026-08-13 | ADDED
  - Dev-only services run on the Dev-Host, customer-synchronous services stay on fleet | T002623 | 2026-08-10 | ADDED
In-flight:
  - Die SDLC-Oberfläche hat eine Laufzeit-Heimat | T016429 | active | MODIFIED

### secret-rotation
Reqs: 45 · Scenarios: 106 · Lines: 883
Paths: environments/sealed-secrets, scripts/rotate
Last touches:
  - Typed extra-namespace secrets | T002254 | 2026-07-27 | ADDED
  - Per-entry output file for sealed secrets | T002254 | 2026-07-27 | ADDED
  - Flux bootstrap secrets are schema-managed | T002254 | 2026-07-27 | ADDED

### secrets-deploy-automation
Reqs: 15 · Scenarios: 25 · Lines: 267
Last touches:
  - gitleaks-Gegenscan | T011580 | 2026-08-18 | MODIFIED
  - Schema is authoritative over the dev secrets file | T003141 | 2026-08-11 | ADDED
  - Deliberate dev absence is annotated, not allowlisted | T003141 | 2026-08-11 | ADDED
  - Stale dev_absent annotations are detected | T003141 | 2026-08-11 | ADDED
  - Keycloak-era OIDC key names stay retired | T003141 | 2026-08-11 | ADDED

### security
Reqs: 3 · Scenarios: 8 · Lines: 130
Last touches:
  - Run-as-non-root baseline | T015293 | 2026-08-24 | ADDED

### sessions-server
Reqs: 13 · Scenarios: 26 · Lines: 269
Paths: k3d/sessions-server, scripts/session-hub, Taskfile.session
Last touches:
  - BATS Placeholder Test Coverage | T016250 | 2026-08-24 | MODIFIED
  - Sessions-Server-Nginx läuft als Non-Root | T014553 | 2026-08-23 | ADDED

### sidekick-assistant
Reqs: 36 · Scenarios: 68 · Lines: 712
Paths: website/src/components/Sidekick
Last touches:
  - Sidekick-Panel-Navigation mit kontextabhängigem Menü | T001565 | 2026-08-03 | MODIFIED
  - sidekick:navigate CustomEvent für bekannte Views | T001565 | 2026-08-03 | MODIFIED
  - Agentic-Terminal-View rendert eingebettetes ttyd-Terminal | T001565 | 2026-08-03 | ADDED
  - Agent-Anleitung — Harness-Badge und Harness-Filter für Tool-Karten | T001612 | 2026-07-15 | ADDED
  - Agent-Anleitung — Harness-bewusste Beschriftung der Init-Prompt-Sektion | T001612 | 2026-07-15 | ADDED

### smtp-password-sync
Reqs: 2 · Scenarios: 3 · Lines: 40
Last touches:
  - SMTP password parity across SealedSecrets | T001802 | 2026-08-02 | ADDED
  - No schema or code changes required | T001802 | 2026-08-02 | ADDED

### spec-bats-agentic-ai
Reqs: 1 · Scenarios: 2 · Lines: 42

### spec-bats-billing-business
Reqs: 1 · Scenarios: 1 · Lines: 22
Last touches:
  - Spec-BATS-Grundabdeckung Billing & Business Workflows | T002011 | 2026-07-21 | ADDED

### spec-bats-infra-devtooling
Reqs: 1 · Scenarios: 2 · Lines: 46
Last touches:
  - BATS-Spec-Abdeckung für Plattform-Infrastruktur & DevTooling | T002013 | 2026-07-21 | ADDED

### t001592
Reqs: 2 · Scenarios: 2 · Lines: 29
Last touches:
  - Factory Floor MUST display provider badges for each station phase and open a drawer on click | T001592 | 2026-08-03 | ADDED
  - Sidekick interface MUST expose global agent settings including context budget, spawn harness, lavish review, and kill switch | T001592 | 2026-08-03 | ADDED

### terminal-sidekick
Reqs: 5 · Scenarios: 8 · Lines: 110
Last touches:
  - Terminal-Bridge Selector-less Service | T001565 | 2026-08-03 | ADDED
  - SSO-Gate mit Pocket-ID-Gruppe | T001565 | 2026-08-03 | ADDED
  - Pocket-ID-Client-Seed-Row für terminal-sidekick | T001565 | 2026-08-03 | ADDED
  - WireGuard Fleet-Mesh-Peer für den WSL-Host | T001565 | 2026-08-03 | ADDED
  - ttyd Host-Setup-Skript | T001565 | 2026-08-03 | ADDED

### ticket-ops
Reqs: 3 · Scenarios: 5 · Lines: 67
Last touches:
  - Claim-Timing in Step 3.6 ist dokumentiert | T004602 | 2026-08-14 | ADDED
  - Prosa-Blocker-Erkennung in Phase 1 | T002771 | 2026-08-09 | ADDED

### toolset-registry
Reqs: 20 · Scenarios: 43 · Lines: 522
Last touches:
  - Usage semantics schema validation in check runner | T004889 | 2026-08-14 | ADDED
  - Local sources are consulted before remote ones | T002611 | 2026-08-10 | ADDED
  - inspect returns schemas rather than prose where possible | T002611 | 2026-08-10 | ADDED
  - Only decisions are persisted, never lookups | T002611 | 2026-08-10 | ADDED
  - Every curated instance carries injectable usage semantics | T002592 | 2026-08-03 | ADDED

### unsloth-eval-harness
Reqs: 7 · Scenarios: 12 · Lines: 126
Last touches:
  - Tandem-Kleinstmodell-Evaluation ist dokumentiert | T015248 | 2026-08-24 | ADDED
  - Paired Base-Versus-Tuned Measurement | T002606 | 2026-08-10 | ADDED
  - Test Set Covers Negative And Underspecified Cases | T002606 | 2026-08-10 | ADDED
  - Test Cases Are Unseen By Training | T002606 | 2026-08-10 | ADDED
  - Language Control | T002606 | 2026-08-10 | ADDED

### vaultwarden-integration
Reqs: 11 · Scenarios: 23 · Lines: 245
Paths: k3d/vaultwarden
Last touches:
  - Spec-BATS smoke coverage | T002012 | 2026-07-21 | ADDED

### website-db-split
Reqs: 3 · Scenarios: 3 · Lines: 46
Last touches:
  - website-db-split | T002150 | 2026-08-02 | ADDED
  - REQ-WEBSITE-DB-SPLIT-001 — Stage 1 Extraction With Re-Export Compatibility | T002149 | 2026-08-02 | ADDED
  - REQ-WEBSITE-DB-SPLIT-002 — No Import Cycles After Stage 1 | T002149 | 2026-08-02 | ADDED

### website-e2e-fixes
Reqs: 3 · Scenarios: 4 · Lines: 56
Last touches:
  - E2E-Tests vermeiden networkidle-Waits | T002080 | 2026-08-03 | ADDED
  - Inbox-UI-Tests warten auf Hydration und korrekte Selektoren | T002080 | 2026-08-03 | ADDED
  - API-Tests erben die Session aus dem Browser-Kontext | T002080 | 2026-08-03 | ADDED

### website-interfaces
Reqs: 11 · Scenarios: 31 · Lines: 412
Last touches:
  - Public-API Fail-soft für `/api/timeline` und Slot-Endpoints | T002184 | 2026-08-03 | MODIFIED
  - Public and admin API endpoints return the documented status code under E2E load | T002196 | 2026-08-02 | ADDED

### worktree-divergence-guard-T002387
Reqs: 1 · Scenarios: 2 · Lines: 31
Last touches:
  - Divergence-Guard aktualisiert main ohne Fetch-in-checked-out-Branch | T002387 | 2026-08-03 | ADDED
