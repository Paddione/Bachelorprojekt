# p2 — korczewski-Flux-Suspend lösen

## Ziel
In `ks-korczewski.yaml`, `ks-jobs-korczewski.yaml`,
`ks-website-korczewski.yaml`, `ks-korczewski-auth.yaml`:
`suspend: true` → `false` (exakte Keys aus p1-Inventar übernehmen),
dazu Skalierungs-Anhebung dort, wo Namespaces auf 0 stehen
(`workspace-korczewski`, `website-korczewski` — Replica-/Scale-Felder aus
p1-Inventar; keine erfundenen Feldnamen).

## Randbedingungen
- NUR die vier Dateien; keine Nachbar-Keys umbenennen.
- Danach `task workspace:validate` (Kustomize dry-run) grün — sonst STOPP.
- Noch KEIN Apply/Deploy in p2 (das ist p3/p4 mit Cluster-Kontakt);
  p2 ist reine Git-Änderung + dry-run.

## Gates
- `grep -rn "suspend: *true" flux/clusters/fleet/ks-korczewski*.yaml` leer.
- `task workspace:validate` Exit 0.
