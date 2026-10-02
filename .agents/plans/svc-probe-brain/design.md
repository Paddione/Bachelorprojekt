# Design: svc-probe-brain (T900916)

Brainstorming-Ergebnis (inline, ohne Lavish-Board: Ein-Zeilen-Fix mit
verifizierter Ursache; `superpowers:brainstorming` steht in dieser
Umgebung nicht zur Verfuegung).

## E1: Root-Cause

`svc_probe()` (`scripts/lib/runtime-health-measure.py`, ab Zeile 129)
sammelt Ingress-Hosts per `yaml.safe_load_all` aus `prod-fleet/mentolder`
und `prod-fleet/korczewski` (`kind: Ingress`, `spec.rules[].host`) und
Blackbox-Targets aus dem `Probe`-Objekt in
`k3d/monitoring/blackbox-exporter.yaml`. `covered()` matcht exakt oder per
Subdomain-Label vor dem ersten Punkt. Template-Hosts
(`brain.${prod_domain}`) matchen dadurch gegen konkrete Brand-Targets
(`https://brain.mentolder.de`).

Brain-Ingress (`prod-fleet/mentolder/brain.yaml`, `kind: Ingress` ab
Zeile 360, Host `brain.${prod_domain}`) kam mit T900859–T900861 dazu;
die Probe-Targets wurden nicht mitgezogen. `studio.${prod_domain}` und
`langfuse-dev.${prod_domain}` sind ueber ihre Labels abgedeckt, `brain`
nicht → `uncovered = 1`.

Prior art (T002829): `grep -rn -e 'blackbox-exporter' -e 'brain.yaml'
docs/adr/` trifft nur ADR-006 (erwaehnt `k3d/brain.yaml`, ein anderes
Artefakt, Abschnitt „Bewusst nicht …"). `grep -rln
'blackbox-exporter' tests/spec/` trifft
`tests/spec/fleet-operations/monitoring-ready.bats` und die
`service-health-goals.bats`-Suite. Keine verworfene Loesungsrichtung
dokumentiert; bestehende Entscheidung „statische Target-Liste, G-SVC01
validiert Coverage" bleibt.

## E2: Edge-Cases

- SSO-Gate: Der brain-Host liegt laut `brain.yaml`-Kopfkommentar hinter
  Pocket-ID-SSO (oauth2-proxy). Das `http_2xx`-Modul folgt Redirects per
  Blackbox-Default; ob die Live-Probe gruen wird, zeigt erst das
  Monitoring nach dem Merge. Die Coverage-Messung (der failing Test)
  zaehlt nur statische Targets und ist davon unabhaengig. Kein Blocker,
  aber nach Merge im Dashboard gegenpruefen.
- korczewski ist FROZEN (T002479): kein `brain.korczewski.de`-Target
  anlegen; nur mentolder.
- Kein Relabeling-Eintrag noetig (siehe Proposal).

## E3: Betroffene Subsysteme

- `k3d/monitoring/blackbox-exporter.yaml` (einzige Aenderung, +1 Zeile).
- Gelesen, nicht geaendert: `scripts/lib/runtime-health-measure.py`
  (`svc_probe`), `prod-fleet/mentolder/brain.yaml`,
  `tests/spec/health-goals/service-health-goals.bats`.

## E4: RED-Nachweis (Fix-Pfad Schritt 3)

Kein neuer Test: Der existierende G-SVC01-Guard ist der
reproduzierende Test. Belegt auf Branch `fix/svc-probe-brain-T900916`:

```text
not ok 1 svc-probe: existiert als measurement choice in runtime-health-measure.py
# FAIL: svc-probe meldet '1' ungedeckte Produktions-Ingresses.
```

Runner: `tests/unit/lib/bats-core/bin/bats
tests/spec/health-goals/service-health-goals.bats -f "svc-probe"`.

## E5: Verifikation (gruen)

1. `python3 scripts/lib/runtime-health-measure.py svc-probe` → `0`.
2. BATS wie in E4 → `ok 1`.
3. `task workspace:validate` (Manifest-Aenderung).
4. Finales Gate-Trio im Verify-Task (siehe `tasks.md`).
