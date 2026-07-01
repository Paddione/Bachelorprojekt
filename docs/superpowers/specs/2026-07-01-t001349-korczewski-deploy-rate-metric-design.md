---
ticket_id: T001349
plan_ref: openspec/changes/t001349-korczewski-deploy-rate-metric/tasks.md
status: draft
---

# Design: G-CD01 — korczewski Website-Deploy-Rate-Messung reparieren (T001349)

**Datum:** 2026-07-01
**Ticket:** T001349 — `[G-CD01] korczewski Website-Deploy-Rate weiterhin unter Ziel (53%, Ziel >=90%)`
**Vorgänger:** T001276 (`docs/superpowers/specs/2026-06-28-g-cd01-korczewski-ci-parity-design.md`), als `done`
geschlossen, ohne dass sich der Messwert verbesserte — genau dieses Muster (Ticket geschlossen,
Metrik bleibt rot) wird in diesem Fix durchbrochen, nicht nur wiederholt.

---

## Root Cause (verifiziert)

Der Mess-Befehl für G-CD01 in `.claude/lib/goals.md:63` lautet:

```bash
gh-axi run list --workflow build-website-korczewski.yml --branch main --limit 15
```

`.github/workflows/build-website-korczewski.yml` wurde am **2026-06-27T10:47Z** durch PR #2167
(T001229) **gelöscht** und in `.github/workflows/build-website.yml` konsolidiert (3 Jobs:
`build-image`, `deploy-mentolder`, `deploy-korczewski` — letztere zwei unabhängig parallel,
`needs: [build-image]` only, keine sequentielle Kopplung mehr; das war bereits der T001276-Fix).

Die GitHub Actions REST API bindet historische Runs an den Workflow-Dateinamen, unter dem sie
zum Ausführungszeitpunkt liefen. Seit der Löschung am 2026-06-27 werden **nie wieder** neue Runs
unter dem Namen `build-website-korczewski.yml` erzeugt — der Befehl liefert dauerhaft dieselben
15 eingefrorenen historischen Runs vom Tag der Konsolidierung zurück (verifiziert: alle 15 Treffer
sind "3d ago" relativ zu heute, 8/15 = 53 % — exakt der Ticket-Wert). Diese Zahl kann sich per
Konstruktion **nie mehr ändern**, unabhängig davon, wie gut der echte Deploy heute läuft.

Der reale, aktuelle Zustand (verifiziert via `gh api .../actions/runs/<id>/jobs`, Job-Name
`"Deploy Website (korczewski)"`, für die letzten 15 Runs des konsolidierten Workflows
`Build & Deploy Website`): **15/15 success**. Ein zusätzlicher realer Failure liegt 8h zurück
(Run 28457552491, Step "Pre-Rollout Secret-Check (korczewski)") — über die letzten ~16 echten
Runs ergibt das ~94 %, klar über dem 90 %-Ziel. Der strukturelle T001276-Fix funktioniert; nur
die **Messung selbst zeigt auf einen toten Datenstrom**.

**Sekundärer Fund (Spec-Drift):** `openspec/specs/website-core.md`, Scenario
"korczewski Build-Workflow enthält kubectl set image", referenziert im GIVEN weiterhin die
gelöschte Datei `.github/workflows/build-website-korczewski.yml`. Der zugehörige BATS-Test
(`tests/unit/website-ci-deploy.bats`) wurde bereits korrekt auf `build-website.yml` migriert
(T001229-Kommentare vorhanden) — nur die Spec-Prosa hinkt hinterher.

---

## Ziel

1. G-CD01 misst den **echten aktuellen** Job-Status von `deploy-korczewski`, nicht einen
   eingefrorenen toten Datenstrom.
2. Ein Regressionsguard verhindert **strukturell**, dass ein Health-Goal-Messbefehl künftig auf
   eine gelöschte `.github/workflows/*.yml`-Datei zeigt — das ist die "nachhaltige" Komponente
   des Fixes: T001276 hat das CI-Problem gelöst, aber nichts hat verhindert, dass die Messung
   beim nächsten Workflow-Rename erneut divergiert. Dieser Guard schließt genau diese Lücke,
   nicht nur für G-CD01, sondern für jeden `--workflow <datei>.yml`-Verweis in `goals.md`.
3. Die Spec-Drift in `website-core.md` wird im selben Change mitkorrigiert (geringer Aufwand,
   gleicher Ursprungsfehler: T001229-Konsolidierung nicht vollständig nachgezogen).
4. `goals.md` wird mit dem echten Messwert aktualisiert und G-CD01 von Priorität A (aktive
   Verletzung) nach Priorität C (Ziel erreicht) verschoben.

---

## Design-Entscheidung: Job-Level-Messung via `gh api`, kein neues Skript

### Gewählter Ansatz

`gh-axi run list --workflow` filtert nur auf Workflow-Ebene, nicht auf Job-Ebene — es gibt aber
keinen Job-level-Befehl in `gh-axi`. Der korrekte Ersatzbefehl bleibt ein **inline Bash-Snippet**
in `goals.md` (Konsistenz mit allen anderen Zeilen der Tabelle/Sektionen dort — kein Goal hat ein
dediziertes Skript, jedes trägt seinen reproduzierbaren Befehl direkt im Dokument):

```bash
gh api "repos/{owner}/{repo}/actions/workflows/build-website.yml/runs?branch=main&per_page=15" \
    --jq '.workflow_runs[].id' \
  | xargs -I{} gh api repos/{owner}/{repo}/actions/runs/{}/jobs \
      --jq '.jobs[] | select(.name=="Deploy Website (korczewski)") | .conclusion' \
  | sort | uniq -c
```

`gh api` löst `{owner}/{repo}` automatisch aus dem Git-Remote auf (kein Hardcoding von
`paddione/Bachelorprojekt`) und `actions/workflows/build-website.yml/runs` referenziert die
Workflow-**Datei**, die aktuell existiert (nicht die Workflow-ID) — das ist selbst-korrigierend,
falls die Datei künftig erneut umbenannt wird (der Aufruf würde dann klar 404en statt still
falsche/eingefrorene Daten zu liefern).

### Verworfene Alternative: Workflow-Run-Level als Näherung

Der gesamte Run-Status von `Build & Deploy Website` (ohne Job-Filter) korreliert stark mit dem
korczewski-Job (ein Job-Fail lässt den Run als `failure` erscheinen), ist aber **ungenau**: ein
`deploy-mentolder`-Fail würde fälschlich als korczewski-Fail gezählt. Verworfen zugunsten der
präzisen Job-Level-Abfrage — der Mehraufwand (eine `xargs`-Pipe mehr) ist vernachlässigbar.

### Verworfene Alternative: Dediziertes Mess-Skript (`scripts/health-goal-cd01.sh`)

Würde Präzedenzfall für 1 Skript pro Health-Goal schaffen — bei >30 Zielen in `goals.md` nicht
skalierbar und inkonsistent mit der bestehenden Konvention (inline Bash pro Zeile/Sektion).
Verworfen.

---

## Komponenten-Design

### 1. `.claude/lib/goals.md` — G-CD01-Sektion aktualisieren + Guard-Referenz

- Mess-Befehl (Zeile ~63) durch die Job-Level `gh api`-Pipe ersetzen (s.o.).
- Aktuellen Messwert eintragen (Live-Wert zum Zeitpunkt der Implementierung erneut ziehen, nicht
  den hier dokumentierten 15/15-Snapshot hart kodieren — der Plan-Task muss den Befehl zur
  Implementierungszeit erneut ausführen und den frischen Wert eintragen).
- G-CD01 von Priorität A (`#prio-a`) nach Priorität C (`#prio-c`, "auf Target — halten") verschieben,
  Meta-Zeile auf `✅`/Status "erreicht" aktualisieren.
- Tabellenzeile "Offene Tickets" ergänzen: `| G-CD01 | T001349 | gefixt (Root Cause: Messbefehl
  zeigte auf gelöschten Workflow) |`.
- "Aktuell A-Ziele"-Liste: `G-CD01` entfernen.

### 2. `tests/spec/ci-cd.bats` — neuer Regressionsguard (generisch, nicht G-CD01-spezifisch)

Neuer Test unterhalb der bestehenden G-CD01-Sektion:

```bash
@test "G-CD01: goals.md referenziert keine .github/workflows/*.yml-Datei, die nicht existiert" {
  run python3 - "$REPO_ROOT/.claude/lib/goals.md" "$REPO_ROOT/.github/workflows" <<'PY'
import re, sys, pathlib
goals_md, wf_dir = sys.argv[1], pathlib.Path(sys.argv[2])
text = pathlib.Path(goals_md).read_text()
missing = []
for m in re.finditer(r'--workflow\s+([A-Za-z0-9_.-]+\.ya?ml)', text):
    fname = m.group(1)
    if not (wf_dir / fname).is_file():
        missing.append(fname)
assert not missing, f"goals.md referenziert geloeschte Workflow-Dateien: {sorted(set(missing))}"
PY
  [ "$status" -eq 0 ]
}
```

Dieser Test ist **die failing-test-Voraussetzung des Fix-Pfads**: er schlägt heute fehl (findet
`build-website-korczewski.yml` in Zeile 63, Datei existiert nicht mehr) und wird grün, sobald
Komponente 1 umgesetzt ist. Der Test ist bewusst generisch (Regex über alle `--workflow`-Treffer,
nicht hart auf `build-website-korczewski.yml`) — er fängt jede künftige Workflow-Umbenennung ab,
die in `goals.md` nicht nachgezogen wurde, nicht nur diesen einen Fall.

### 3. `openspec/specs/website-core.md` — Spec-Drift korrigieren

Scenario "korczewski Build-Workflow enthält kubectl set image" (Zeile ~359): GIVEN von
`.github/workflows/build-website-korczewski.yml` auf `.github/workflows/build-website.yml` (Job
`deploy-korczewski`) ändern, konsistent mit der bereits migrierten BATS-Implementierung in
`tests/unit/website-ci-deploy.bats` (Kommentar dort verweist bereits auf T001229).

### 4. `openspec/changes/t001349-korczewski-deploy-rate-metric/specs/ci-cd.md` — Delta

OpenSpec-Delta zur SSOT `ci-cd.md` (Parent-Slug-Konvention, T001304): ergänzt eine neue
Requirement "Health-Goal-Messbefehle referenzieren nur existierende Workflow-Dateien" mit dem
oben beschriebenen Scenario, damit `tests/spec/ci-cd.bats` eine SSOT-Verankerung hat.

---

## Acceptance Criteria

- [ ] `bash scripts/health-goals-check.sh --only=G-CD01` — n/a (G-CD01 ist "eingeschränkt
      reproduzierbar", nicht im automatisierten Ampel-Skript; manuelle Verifikation des neuen
      `gh api`-Befehls reicht)
- [ ] Neuer BATS-Test in `tests/spec/ci-cd.bats` ist grün (vorher: rot)
- [ ] `openspec/specs/website-core.md` referenziert keine gelöschte Workflow-Datei mehr
- [ ] `task test:changed` grün
- [ ] `task freshness:regenerate && task freshness:check` grün
- [ ] `bash scripts/openspec.sh validate` grün

---

## Out of Scope

- Der reale, transiente Failure in Run 28457552491 (Pre-Rollout-Secret-Check) — kein
  reproduzierbares Muster über die letzten 15 Runs, keine erneute Root-Cause-Untersuchung nötig
  (bereits durch T001182 sekundär abgedeckt: Secret-Drift-Guard).
- Weitere Health-Goals mit ähnlichem Muster (`G-CI01`, `G-CD02`) — verifiziert, referenzieren
  existierende Dateien (`ci.yml`, `post-merge.yml`), kein akuter Handlungsbedarf; der neue Guard
  deckt sie ab, falls sich das künftig ändert.
- Automatisierung von G-CD01 im `health-goals-check.sh`-Ampel-Skript — bleibt bewusst "manuell/
  eingeschränkt reproduzierbar" (netzabhängig, gh-API-Rate-Limits), analog zu anderen CI-Fenster-
  Zielen in dieser Kategorie.

## Risiken

- **Gering:** Reine Dokumentations- und Test-Änderung, keine Produktionslogik betroffen (kein
  Kubernetes-Manifest, kein Workflow-YAML wird verändert — nur Prosa/Messbefehl/Spec-Text).
- **gh-API-Rate-Limit:** `xargs -I{} gh api .../jobs` macht bis zu 15 sequentielle API-Calls pro
  Messung — bei `GITHUB_TOKEN`-Auth (5000 req/h) vernachlässigbar, aber im BATS-Test wird dieser
  Live-API-Call **nicht** ausgeführt (Test prüft nur den Text von `goals.md`, keine Netzwerk-
  Dependency) — damit bleibt der Test offline-tauglich und CI-stabil.
