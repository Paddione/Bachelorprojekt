# p7 — Registry-Umschreibung + Guards grün (Tests-Rolle)

## Rotphase-Hinweis (Baseline zuerst)
Vor p2–p6 den Ist-Stand sichern: `task domains:check` (grün, 19 Domains) +
`task domains:probe --cluster fleet` (grün inkl. mentolder-Hosts) laufen
lassen, Output in `phase-events.log`. Nach p5/p6 MUSS derselbe Lauf neue
FAILs zeigen (mentolder-Hosts weg/unerreichbar) — das sind expected FAIL
candidates, die p7 per Registry-Umschreibung schließt:
- Alle mentolder-Einträge (`website-mentolder`, `website-staging`,
  `apex-korczewski`?, `studio-mentolder` … — exakte IDs aus p1-Inventar)
  entfernen; `website-korczewski` frozen→ prüfen (live nach p2/p4?).
- korczewski-Einträge (`korczewski-web/apex/auth-mirror` …) auf live +
  `expect`-Blöcke heben (Werte per Live-Lauf verifiziert, Muster K4/p2).
- Vorsicht `apex-korczewski`: Datei liegt unter website-korczewski, Host ist
  `${PROD_DOMAIN}` — Zugehörigkeit (bleibt/fällt) per p1-Inventar + Eigner,
  kein Raten.
- Danach `task domains:check` (Manifest-Abgleich: keine verwaisten Hosts),
  `task domains:map` (Karte neu, Diff committen), `task domains:probe`
  (fleet grün; devmesh unberührt).

## pytest-Anteil (Runner für STRUCT2)
`bash scripts/pytest-run.sh tests/py/spec/remaining_root_specs/domain_registry/`
muss grün sein (existierende Suite als Regressionstor; `pytest` läuft hier
explizit). Zusätzlich `task test:inventory`/`test:evals:update`-Hygiene NUR
bei Diff (keine pytest-/Task-Neuerungen erwartet).

## Gates
- `domains:check` + `domains:probe` grün, Map-Diff committet.
- `pytest` domain_registry grün.
- Kriterium-4-Musterliste (Goal): kein mentolder-Host in Registry/Probe-Output.
