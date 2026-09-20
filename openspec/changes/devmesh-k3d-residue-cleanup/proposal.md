# Proposal: devmesh-k3d-residue-cleanup

## Why

Der lokale k3d-Cluster `mentolder-dev` existiert nicht mehr — `k3d cluster list` ist leer
(gemessen 2026-09-20). Der Effekt von ADR-008 SP-5/P3.3 ist damit eingetreten, der Rückbau im
Repo aber nicht abgeschlossen. Drei Reste bleiben:

1. `scripts/devmesh/migrate-from-k3d.sh` liest seine Quelle aus dem Kubeconfig-Context
   `k3d-mentolder-dev` und aus einem laufenden `shared-db`-Pod darin. Beides gibt es nicht mehr;
   das Skript ist unausführbar und verweist auf abgebaute Hardware.
2. `tests/spec/local-dev-mesh/no-k3d-context.bats` ist auf `main` ROT. Seine Ausnahme für
   `openspec/specs` hing am Verzeichnis `openspec/changes/devmesh-k3d-decommission`; seit dessen
   Archivierung greift sie nicht mehr, und `openspec/specs/local-dev-mesh.md` sowie das daraus
   generierte `docs/spec-atlas.md` schlagen wieder an.
3. CLAUDE.md behauptet an vier Stellen einen Stand, den der lebende Cluster widerlegt: k3d als
   Voraussetzung, `fleet` als einziger aktiver Context und jeder weitere Context als
   abgebaute Hardware. Tatsächlich sind `fleet` (Prod) und `devmesh` (Entwicklung) beide aktiv.

## What

**Quelle der Migration wird der Dump, nicht der Cluster.** `migrate-from-k3d.sh` liest die
Zeilenzahlen der Quelle aus dem archivierten `pg_dumpall`-Dump
`~/backups/k3d-mentolder-dev-shared-db-final-2026-08-23.sql.gz` (Entscheidung Patrick,
2026-09-20). Der Vergleich je Tabelle läuft weiter gegen die devmesh-`shared-db`. Die Quelle
bleibt read-only — sie ist jetzt eine Datei.

**Der Unterbefehl `restore` entfällt.** Er setzte `pg_restore -Fc` gegen einen per Port-Forward
erreichbaren Quell-Cluster voraus. Aus einem `pg_dumpall`-Cluster-Dump lässt sich dieselbe
Semantik (`--clean --if-exists`) nur über `DROP DATABASE` auf dem Ziel herstellen — das würde
devmesh-Datenbanken löschen. Die Migration selbst ist in SP-3 live erfolgt; was bleibt und
gebraucht wird, ist der Nachweis. `all` heißt danach: `preflight`, `counts`, `verify`.

**Guard und SSOT-Spec werden geradegezogen.** `docs/spec-atlas.md` wird dauerhaft ausgenommen —
es ist generiert („nicht handeditieren") und führt Requirement-Titel wörtlich und historisch.
Die Ausnahme für `openspec/specs` wird auf dieses Change-Verzeichnis umgehängt und heilt beim
Archivieren von selbst: das Delta entfernt die beiden abgeschlossenen Abbau-Requirements und
formuliert die verbleibende so, dass sie das Literal nicht mehr selbst enthält.

**CLAUDE.md nennt beide aktiven Contexts.** Jede geänderte Zeile ist gegen
`kubectl config get-contexts -o name` geprüft, nicht gegen den Dateitext.

**Außerhalb des Umfangs, ausdrücklich:** `k3d/docs-content-built/*` ist von
`node scripts/build-docs.mjs` erzeugtes HTML und wird weder handeditiert noch für diesen Change
neu gebaut. Seine Quellen unter `docs/` und `docs/adr/` nennen den alten Context in
historischem Zusammenhang; ADRs werden durch Nachträge fortgeschrieben, nicht umgeschrieben.
Beide Pfade sind im Guard dauerhaft ausgenommen. Ebenfalls nicht angefasst: `scripts/ticket.sh`
und `scripts/vda/ticket/*` (parallele Arbeit an T900239) sowie Context `fleet` und die
Prod-Namespaces.

_Ticket: T900120_
