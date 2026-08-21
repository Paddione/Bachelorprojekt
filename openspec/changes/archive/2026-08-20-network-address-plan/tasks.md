---
title: "network-address-plan — Implementation Plan"
ticket_id: T012645
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# network-address-plan — Implementation Plan

**Goal:** Jeder IP-Bereich des Projekts ist in `docs/agent-guide/registry/networks.yaml`
deklariert, in einer generierten Karte dokumentiert und durch einen fail-closed Guard gegen
unerklärte Überschneidung abgesichert.

**Architecture:** Eine eigenständige Registry-Datei neben den bestehenden Registries, plus ein
Node-Skript mit zwei Modi (prüfen, Karte schreiben). Kein Eingriff in die agent-guide-Pipeline:
`scripts/agent-guide/load.mjs` liest benannte Dateien, kein Glob — eine zusätzliche Datei im
Registry-Verzeichnis lässt sie unberührt (design.md E2).

**Tech Stack:** Node 22 (`node:test` für die Skript-Einheiten, kein neues Paket), BATS
(vendored Runner `tests/unit/lib/bats-core/bin/bats`), go-task, YAML.

**Spec:** `design.md` in diesem Change (Entscheidungen E1–E5), Delta-Specs
`specs/network-address-plan.md` (ADDED) und `specs/rustdesk-server.md` (MODIFIED, K8).
Ticket T012645, Branch `feature/network-address-plan-T012645`.

## File Structure

| Datei | Art | S1-Budget |
|---|---|---|
| `docs/agent-guide/registry/networks.yaml` | neu — SSOT der Adressbereiche | `.yaml` hat kein S1-Limit in `docs/code-quality/gates.yaml` |
| `scripts/networks-check.mjs` | neu — Guard + Karten-Emitter | neue Datei, nicht gebaselined → wirksame Schwelle = `.mjs`-Limit 800 Zeilen, Budget 800 |
| `docs/agent-guide/maps/networks-map.md` | neu, generiert — nicht von Hand editieren | `.md` hat kein S1-Limit |
| `tests/spec/network-address-plan/networks-registry.bats` | neu — Guard-Test (Output-Verifikation) | `.bats` hat kein S1-Limit |
| `tests/spec/network-address-plan/fixtures/` | neu — bekannt-gute und bekannt-schlechte Registries | Fixtures |
| `Taskfile.yml` | geändert — `networks:check`, `networks:map`, Einhängen in `test:all` und `freshness:regenerate` | `.yml` hat kein S1-Limit |
| `.gitattributes` | geändert — `merge=ours` für die generierte Karte | kein S1-Limit |
| `components/website/src/data/test-inventory.json` | generiert — via `task test:inventory` | generiert |

Keine der Ziel-Dateien steht in `docs/code-quality/baseline.json` — für diesen Plan werden
keine S1-Zeilenbudgets bestehender Dateien beansprucht.

## Global Constraints

- **Der Guard rechnet, er greppt nicht** (design.md E4). Überschneidung wird über
  Integer-Vergleich von Netz-Untergrenze und -Obergrenze entschieden. Ein Textvergleich
  fände `10.0.0.0/8` gegen `10.42.5.0/24` nicht — genau diese Klasse ist der teure Teil von K1.
- **Beide Richtungen prüfen** (design.md E3). Unerklärte Überschneidung → Fehler; ein
  `overlaps:`-Eintrag, dessen Gegenpartei sich nicht überschneidet, ebenfalls → Fehler. Ohne die
  zweite Richtung wird `overlaps:` zur Blanko-Ausnahme und verdeckt später eine echte Kollision.
- **Kein Eintrag wird gelöscht.** Ein außer Dienst gestellter Bereich bekommt
  `status: retired` und bleibt in der Registry, damit eine spätere Neuvergabe auffällt.
- **Kein laufendes Netz wird umnummeriert** (Operator-Entscheidung, design.md E1).
- BATS: vendored Runner `tests/unit/lib/bats-core/bin/bats`; neue `@test`-Blöcke in eigener
  Datei (T002416); Prüfmodus im Kopfkommentar dokumentieren (T002448-M4); jede Negativ-Aussage
  braucht einen Positiv-Anker im selben Test (T002356-M1).
- Geprüft wird **Ausgabe und Exit-Code** von `scripts/networks-check.mjs`, nicht dessen Quelltext.
- S4: `scripts/networks-check.mjs` muss vom Taskfile aus erreichbar sein, sonst Orphan-Violation.
- Git: Conventional Commits mit `[T012645]`; explizite Pathspecs, niemals `git add -A` (git-crypt).
- Task-Kommandos nicht hartkodieren, sondern über den Oracle auflösen:
  `bash scripts/vda.sh oracle '<goal>'`.

## Tasks

- [ ] **1 — Failing-Test-Step (RED).** Lege
      `tests/spec/network-address-plan/networks-registry.bats` an, dazu unter
      `tests/spec/network-address-plan/fixtures/` je eine Registry für die Fälle: gültig und
      überschneidungsfrei, unerklärte Überschneidung, Überschneidung über verschiedene
      Präfixlängen (`10.0.0.0/8` gegen `10.42.5.0/24`), erklärte Überschneidung,
      `overlaps:` ohne tatsächliche Überschneidung, `overlaps:` auf unbekannte `id`,
      nicht normalisierter CIDR (`10.42.5.7/24`), doppelte `id`. Jeder Negativtest bekommt
      im selben `@test` einen Positiv-Anker gegen die gültige Fixture, damit ein pauschal
      fehlschlagendes Skript den Test nicht grün aussehen lässt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/network-address-plan/
# expected: FAIL (rot — scripts/networks-check.mjs existiert noch nicht)
```

- [ ] **2 — Registry anlegen.** `docs/agent-guide/registry/networks.yaml` mit einem Eintrag je
      Bereich aus der Tabelle in `design.md` (Ausgangslage). Felder je Eintrag: `id`, `cidr`,
      `owner`, `purpose`, `status`, `source`, optional `overlaps:` (Liste aus `with`, `reason`,
      `mitigation`). Die vier bekannten Überschneidungen werden hier ausdrücklich erklärt:
      K1 (Heim-LAN gegen fleet-Overlay, Pod-CIDR, Service-CIDR, korczewski-Mesh), K2
      (mentolder-Mesh gegen Hetzner-Privatnetz), K3 (`192.168.100.10` doppelt auf dem
      WSL-Host), K7 (k3d-dev gegen fleet bei Pod- und Service-CIDR). Das korczewski-Mesh
      `10.13.14.0/24` bekommt `status: retired`. Der Kopfkommentar der Datei nennt sie als
      SSOT und verweist auf `task networks:check`.

- [ ] **3 — Guard implementieren.** `scripts/networks-check.mjs`. Ohne Argument: Registry laden,
      jeden `cidr` auf gültige und normalisierte Notation prüfen, `id`-Eindeutigkeit prüfen,
      jedes Paar numerisch auf Überschneidung prüfen, jeden `overlaps:`-Eintrag gegen die
      Rechnung halten (beide Richtungen), bei jedem Verstoß die beteiligten `id` nennen und
      mit Exit-Code ungleich 0 enden. Mit `--registry <pfad>`: gegen eine Fixture laufen, damit
      der BATS-Test beide Ausgänge erzeugen kann. Nach diesem Schritt ist der Test aus Schritt 1
      grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/network-address-plan/
# erwartet: grün
```

- [ ] **4 — Karten-Emitter.** `scripts/networks-check.mjs --emit-map` schreibt
      `docs/agent-guide/maps/networks-map.md` aus der Registry: eine Zeile je Bereich mit
      `cidr`, Eigentümer, Zweck, Status und — wo vorhanden — der erklärten Überschneidung samt
      Absicherung. Kopfzeile mit dem Hinweis, dass die Datei generiert ist und aus der Registry
      neu erzeugt wird.

- [ ] **5 — Verdrahtung.** In `Taskfile.yml` die Tasks `networks:check`
      (`node scripts/networks-check.mjs`) und `networks:map`
      (`node scripts/networks-check.mjs --emit-map`) ergänzen; `networks:check` in `test:all`
      einhängen, `networks:map` in `freshness:regenerate`. Dazu einen `merge=ours`-Eintrag für
      `docs/agent-guide/maps/networks-map.md` in `.gitattributes` — der Kommentar in
      `freshness:regenerate` verlangt das für jedes neue generierte Artefakt, und ohne ihn
      erzeugt jede parallele Branch-Regeneration einen Merge-Konflikt in einer Datei, die
      ohnehin neu erzeugt wird.

- [ ] **6 — Karte erzeugen und Inventar nachziehen.** `task networks:map` ausführen und das
      Ergebnis committen, `task test:inventory` für die neue BATS-Datei nachziehen (CI-Gate
      vergleicht die committete `test-inventory.json`).

- [ ] **7 — Final Verification.** Die drei Pflicht-Gates laufen lassen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich der Positiv-Anker gegen die echte Registry und die Gegenprobe, dass der Guard
überhaupt scharf ist:

```bash
task networks:check
# erwartet: Exit 0

node scripts/networks-check.mjs --registry tests/spec/network-address-plan/fixtures/undeclared-overlap.yaml
# erwartet: Exit != 0, Ausgabe nennt beide beteiligten id
```
