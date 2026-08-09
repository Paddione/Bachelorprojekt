# Proposal: sdlc-up-command

## Why

Nach der SDLC-Isolation (ADR-006) laufen alle Komponenten lokal, aber das Hochfahren ist eine
Folge manueller Schritte in der richtigen Reihenfolge. Die Einzelteile existieren bereits —
`sdlc:cluster:create`, `sdlc:deploy` (inklusive `shared-db`, `pocket-id`, `sdlc-console`,
`bge-embed`, `bge-rerank`), `sdlc:status`, `sdlc:smoke` sowie `llm:proxy:start` / `:status` /
`:stop`. Was fehlt, ist ein Einstiegspunkt, der sie in der korrekten Reihenfolge orchestriert,
den Erfolg verifiziert und einen sauberen Gegenbefehl zum Herunterfahren anbietet.

Der Name `dev:up` aus dem Epic T002650 ist **nicht** verwendbar: das Präfix `dev:` ist im
Root-Taskfile bereits an `taskfiles/Taskfile.dev-stack.yml` vergeben — den persistenten
Staging-Stack `dev.mentolder.de` mit eigenem `cluster:create` und `deploy`. Beide Stacks teilen
sich zudem den Cluster-Kontext `k3d-mentolder-dev`, weshalb ein `dev:up`, das in Wahrheit den
SDLC-Stack startet, aktiv in die Irre führen würde. Der Einstiegspunkt heißt deshalb `sdlc:up`
und reiht sich in die Tasks ein, die er orchestriert.

Der Astro-Devserver bleibt bewusst außerhalb von `sdlc:up`. Er ist ein blockierender
Vordergrundprozess; nähme `sdlc:up` ihn auf, terminierte der Befehl nie und wäre weder in
Skripten noch als Vorbedingung anderer Tasks verwendbar.

## What

- **`sdlc:up`** — orchestriert Cluster-Anlage, Stack-Deploy und llm-proxy-Start in dieser
  Reihenfolge, verifiziert danach den Gesundheitszustand und terminiert mit Exit 0 bzw. ≠ 0.
  Idempotent: auf einem bereits laufenden Stack führt der Aufruf zu keinem Fehler.
- **`sdlc:down`** — fährt llm-proxy und Cluster sauber herunter, ohne die Reihenfolge zu
  vertauschen.
- **Health-Gate** — ein eigenes Skript, das die Bereitschaft der Einzelkomponenten prüft und
  bei Nichterreichen mit sprechender Diagnose abbricht, statt einen halb hochgefahrenen Stack
  als Erfolg zu melden.
- **`sdlc:dev`** — separater, blockierender Task für den Astro-Devserver mit
  `BUILD_TARGET=sdlc`.

Nicht enthalten: Änderungen am Staging-Namensraum `dev:`, am Prod-Deploy-Pfad oder an den
bestehenden `sdlc:*`-Tasks über die Orchestrierung hinaus.

_Ticket: T002655_
_Fragment des EPIC T002650; deckt zusätzlich T002656 (llm-proxy-Start + Health-Check) ab._
