# p5 — mentolder-Manifeste/Envs raus (Prune-STOPP eingebaut)

## Ziel
Alle zwölf p5-Dateien aus dem Git-Tree löschen (exakte Liste in tasks.md):
`prod-fleet/website-mentolder/*` (4), `prod-fleet/mentolder/*` (3),
`ks-mentolder.yaml`, `ks-jobs-mentolder.yaml`, `ks-website-mentolder.yaml`,
`environments/fleet-mentolder.yaml`, `environments/mentolder.yaml`.

## Prune-STOPP (PFLICHT)
Entfernen aus Git kann Flux-Prune auf dem Cluster auslösen (Workload-Delete =
Prod-Mutation, Trigger 1). Reihenfolge: erst p4-Live-Beleg für korczewski
ablesen (depends_on), dann Prune-Verhalten der drei ks-Dateien prüfen
(`prune:`-Feld aus p1-Inventar) und Eigner-Freigabe einholen — ohne Freigabe
STOPP nach Löschung-im-Branch (kein Push des Delete-Commits ohne Go).
Voraussetzung davor: p4-Website-Beleg liegt vor (Aufbau-zuerst).

## Daten-Grenze (PFLICHT)
Repo-Dateien löschen ≠ Cluster-Daten löschen. Nextcloud-/Postgres-Daten
mentolder werden NICHT angerührt (Goal-Nicht-Ziel, seine Entscheidung).

## Gates
- `git status` zeigt nur die zwölf Pfade als gelöscht.
- `task workspace:validate` grün (übrige Overlays bauen noch).
