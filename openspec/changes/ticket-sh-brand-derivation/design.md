---
ticket_id: T002280
plan_ref: openspec/changes/ticket-sh-brand-derivation/tasks.md
---

# Design: ticket.sh Brand-Derivation-Fix (T002280)

## Root Cause

`scripts/ticket.sh` Zeilen 27-37 (heutiger `main`):

```bash
if [[ -z "${BRAND:-}" ]]; then
  for arg in "$@"; do
    case "$arg" in
      korczewski*|KORCZEWSKI*|*KORCZEWSKI*) BRAND="korczewski"; break ;;
      mentolder*|MENTOLDER*|*MENTOLDER*)   BRAND="mentolder"; break ;;
    esac
  done
  BRAND="${BRAND:-mentolder}"
fi
```

Diese Schleife iteriert über **alle** `"$@"` — inklusive der *Werte* von `--title` und
`--description` — nicht nur über ein `--brand`-Flag. `$BRAND` bestimmt direkt `$NS`
(`workspace` vs. `workspace-korczewski`), also die physische Ziel-Datenbank für den
gesamten Aufruf.

Zweiter, unabhängiger Bug-Layer: `scripts/vda/ticket/create.sh` Zeile 7 hat einen
**eigenen** lokalen Default `brand="mentolder"` für die `brand`-Spalte der
`INSERT`-Zeile, komplett getrennt vom top-level `$BRAND`, das die Verbindung
(NS/Pod/Kontext) bestimmt. Reicht der Aufrufer kein `--brand` an `create.sh` durch,
bleibt die geschriebene Spalte `brand='mentolder'`, unabhängig davon, in welcher DB
die Zeile tatsächlich landet.

Repro (2026-07-27): Ein Titel enthielt eine Freitext-Erwähnung von "korczewski"
(z.B. `<brand>-home E2E ...`). Die top-level Schleife matchte das Substring in
`--title` und setzte `BRAND=korczewski` → `NS=workspace-korczewski`. `create.sh`
erhielt kein `--brand korczewski`, also blieb die INSERT-Spalte `brand='mentolder'`.
Ergebnis: zwei Zeilen mit `brand=mentolder` physisch in der korczewski-DB, dort
kollidierend mit deren eigener `external_id_seq` (bereits bei 254 → IDs T000255/256,
die in der mentolder-DB längst anderen archivierten Vorgängen gehören). Der Aufrufer
sah eine Erfolgsmeldung mit einer scheinbar gültigen ID — Silent-Failure-Charakter,
kein Fehler, keine Warnung.

## Blast-Radius-Prüfung (bestehende Aufrufer)

Durchsucht: `scripts/factory/*.sh`, `scripts/devflow-*.sh`, `.github/workflows/post-merge.yml`,
`scripts/ticket-reclaim.sh`, `scripts/weekly-dep-schema-audit.sh`.

- **Factory-Skripte** (`watchdog.sh`, `_run_dispatcher_prep.sh`, `factory-prep-bridge.sh`, …)
  setzen `BRAND` bereits immer **explizit als Env-Var** vor dem Aufruf
  (`BRAND="$brand" bash scripts/ticket.sh …`). Diese sind vom Fix nicht betroffen —
  `[[ -z "${BRAND:-}" ]]` ist bei ihnen bereits false, die Schleife läuft nicht.
- **ID-only-Aufrufer ohne Brand-Kontext** (`devflow-post-merge-deploy.sh`,
  `devflow-ci-watch.sh`, `.github/workflows/post-merge.yml`, `ticket-reclaim.sh`):
  rufen `ticket.sh phase|update-status|get --id <ext-id>` auf, **ohne** `BRAND` und
  **ohne** brandhaltige Freitext-Argumente. Die Schleife trifft heute schon keinen
  Case und fällt auf den Default `mentolder` zurück. Verhalten bleibt nach dem Fix
  identisch (Default bleibt `mentolder`, nur das Scannen entfällt).
- **`weekly-dep-schema-audit.sh`**: übergibt `--brand mentolder` explizit an
  `create`, aber setzt kein top-level `BRAND`. Nach dem Fix muss dieses `--brand`
  auch das top-level `NS` bestimmen (siehe Entscheidung 2 unten) — sonst bliebe die
  bestehende Lücke (Spalte und NS aus unterschiedlichen Quellen) für diesen einzigen
  heute schon korrekten Aufrufer weiter potenziell inkonsistent, auch wenn hier Brand
  und Default zufällig übereinstimmen.

Kein bestehender Aufrufer verlässt sich auf das Erraten aus Freitext — das Entfernen
der Schleife bricht nichts Bekanntes.

## Entscheidung 1: Darf Brand je geraten werden?

**Nein — Freitext-Scan wird ersatzlos entfernt.** Erlaubte Signalquellen, in dieser
Priorität:

1. Explizites `--brand <wert>` CLI-Flag (exakter Flag-Match, nicht Substring-Suche
   über `"$@"`).
2. `BRAND` Env-Var.
3. `TICKET_NS` Env-Var (Mapping `workspace`→`mentolder`,
   `workspace-korczewski`→`korczewski`; alles andere → Fehler, siehe unten).
4. Fällt keine der drei Quellen: **Default `mentolder`** (siehe Entscheidung 3 — kein
   vollständiges Fail-Closed, aus Kompatibilitätsgründen für ID-only-Aufrufer ohne
   Brand-Kontext).

Ein `--brand`-Wert, der weder `mentolder` noch `korczewski` ist, führt zu
`exit 2` mit klarer Fehlermeldung (bereits vorhandenes Verhalten in der
`case "$BRAND"`-Weiche, Zeile 39-43 — bleibt erhalten).

## Entscheidung 2: Single Source of Truth für Brand (NS **und** Spalte)

Der Bug bestand aus zwei unabhängigen Default-Werten (top-level `$BRAND` für NS,
`create.sh`-lokal `brand="mentolder"` für die Spalte), die divergieren konnten.
Fix: `create.sh` erhält seinen `brand`-Default **nicht mehr hartcodiert**, sondern
aus dem bereits von `ticket.sh` aufgelösten `$BRAND` (per Env-Export an die
`main "$@"`-Subshell, wie `NS`/`CTX` es heute schon tun). Ein explizites `--brand`
auf der `create`-Subcommand-Ebene bleibt als **Override** möglich — muss dann aber
zusätzlich mit dem top-level `$BRAND`/NS übereinstimmen (Validierung: wenn
`--brand` bei `create` gesetzt ist und vom top-level `$BRAND` abweicht → Fehler,
NICHT stillschweigend eine der beiden Werte gewinnen lassen). Das schließt exakt die
Lücke, die den Bug erzeugt hat: Spalte und Ziel-DB sind danach strukturell derselbe
Wert, nie mehr zwei getrennte Defaults.

## Entscheidung 3: Fail-closed vs. Default — abgewogen

Vollständiges Fail-Closed (Abbruch ohne `--brand`/`BRAND`/`TICKET_NS`) würde
`devflow-post-merge-deploy.sh`, `devflow-ci-watch.sh`, `.github/workflows/post-merge.yml`
und `ticket-reclaim.sh` brechen, die heute ID-only ohne jeden Brand-Kontext
aufrufen (siehe Blast-Radius oben). Diese Aufrufer haben nur eine `external_id` und
könnten Brand grundsätzlich nur durch eine Datenbank-Lookup-Runde herausfinden
(cross-brand-Suche) — das ist der Umfang von **T002278** ("mcp-postgres ist
brand-blind"), nicht dieses Tickets.

Getroffene Entscheidung: **Teilweises Fail-Closed** — das gefährliche Verhalten
(Erraten aus Freitext-Argumenten wie Titel/Beschreibung) wird vollständig entfernt;
der harmlose Fallback-Default (`mentolder`, wenn *gar kein* Signal vorhanden ist)
bleibt für Rückwärtskompatibilität mit den ID-only-Aufrufern erhalten. Das
unterscheidet sich fundamental vom bisherigen Bug: der alte Code las aktiv
*irrelevante* Nutzdaten (Titel-Text) als Signal; der neue Code liest **nur noch**
Felder, die tatsächlich zur Zieladressierung gedacht sind (`--brand`, `BRAND`,
`TICKET_NS`), und fällt andernfalls auf einen dokumentierten, stabilen Default
zurück statt zu raten.

Ein hartes Fail-Closed für *alle* Aufrufer wird als Folge-Ticket festgehalten
(Cross-Brand-ID-Lookup analog T002278), nicht in diesem Fix — Scope-Trennung siehe
unten.

## Abgrenzung zu T002307

T002307 (Mishap-Bundle, Welle 2) fasst dieselbe Datei an einer **anderen** Stelle an
(`_pgpod`-Selektor wählt Completed- statt Running-Pod). Dieser Fix rührt den
Pod-Selektor **nicht** an — Diff bleibt auf die BRAND-Auflösung (Zeilen ~20-45) und
die `create.sh`/Subcommand-Brand-Injektion beschränkt, um Merge-Konflikte mit
T002307 zu vermeiden.

## Abgrenzung zu T002278

T002278 behandelt fehlende Brand-Unterscheidung in `mcp-postgres` (anderes
Werkzeug, anderer Layer). Dieser Fix beschränkt sich auf `scripts/ticket.sh` /
`scripts/vda/ticket/create.sh`.

## Test-Strategie

Failing Test in `tests/spec/ticket-system.bats` (neuer oder erweiterter Abschnitt):
- Titel/Beschreibung mit brandhaltigem Freitext (`--title "korczewski-home E2E..."`)
  darf NICHT `NS=workspace-korczewski` auslösen, wenn weder `--brand` noch `BRAND`
  noch `TICKET_NS` gesetzt sind → NS bleibt `workspace` (Default mentolder).
- `--brand korczewski` (explizit) UND ein Titel mit `mentolder`-Freitext →
  NS wird `workspace-korczewski` (Flag gewinnt, Freitext wird ignoriert).
- `create.sh` mit `--brand korczewski` auf top-level `BRAND=korczewski`-Kontext →
  INSERT-Spalte `brand='korczewski'`, konsistent mit NS.
- Divergenz `--brand mentolder` (Subcommand) vs. top-level `BRAND=korczewski`
  (Env) → Fehler, kein stiller Vorrang.
- Kein Signal überhaupt → Default `mentolder`, unverändertes Verhalten für
  ID-only-Aufrufer.

Da `ticket.sh` reale Kubernetes-Cluster-Zugriffe braucht, werden diese Fälle als
**Unit-Tests auf der reinen BRAND/NS-Resolution-Logik** isoliert getestet (Funktion
extrahieren oder Script mit `TICKET_OFFLINE=1`/Dry-Run-Pfad prüfen, ohne echten
`kubectl exec`), nicht als Live-DB-Integrationstest.
