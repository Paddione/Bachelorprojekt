# p2 — dev-db-refresh entfernen und veraltete Aussagen korrigieren (impl)

Rolle: impl. Zieldateien: `prod-mentolder/dev-db-refresh-cron.yaml`,
`prod-mentolder/dev-db-refresh-netpol.yaml`, `prod-mentolder/dev-db-refresh.sh`,
`prod-mentolder/whisper.yaml`, `prod-fleet/staging/kustomization.yaml`, `CLAUDE.md`.

**Beginnt erst, wenn p1 Task 3 abgeschlossen ist.** Der `configMapGenerator` in
`prod-mentolder/kustomization.yaml` liest `dev-db-refresh.sh`; wird die Datei vorher gelöscht,
schlägt jeder `kustomize build` dazwischen fehl. `prod-mentolder/kustomization.yaml` gehört p1 und
wird hier nicht angefasst.

## Task 1 — Beleg, dass die Ressourcen wirklich nirgends ankommen

- [ ] Vor dem Löschen nachweisen, statt der Planaussage zu vertrauen. Beide mentolder-Wrapper
      bauen und auf `dev-db-refresh` prüfen.

```bash
set -a; . <(bash scripts/env-resolve.sh mentolder); set +a
for ov in prod-fleet/mentolder prod-fleet/mentolder-jobs; do
  out="$(kustomize build "$ov" --load-restrictor=LoadRestrictionsNone)"
  # Anker: der Build hat ueberhaupt Ressourcen geliefert
  n="$(printf '%s' "$out" | grep -c '^kind:')"
  [ "$n" -gt 0 ] || { echo "FATAL: $ov baut leer"; exit 1; }
  hits="$(printf '%s' "$out" | grep -c 'dev-db-refresh' || true)"
  echo "$ov: $n Ressourcen, dev-db-refresh-Treffer: $hits"
  [ "$hits" -eq 0 ] || { echo "FATAL: $ov liefert dev-db-refresh aus — NICHT loeschen"; exit 1; }
done
```

Liefert einer der beiden Wrapper die Ressourcen doch aus, ist die Prämisse des Vorgangs falsch.
Dann abbrechen und den Befund ans Ticket melden, statt zu löschen.

## Task 2 — Die drei Dateien entfernen

- [ ] Nach bestandenem Nachweis löschen.

```bash
git rm prod-mentolder/dev-db-refresh-cron.yaml \
       prod-mentolder/dev-db-refresh-netpol.yaml \
       prod-mentolder/dev-db-refresh.sh
```

- [ ] Prüfen, ob `dev-db-refresh` außerhalb von `prod-mentolder/` noch referenziert wird. Der
      dev-Stack läuft inzwischen über `k3d/dev-stack/` und `prod-fleet/dev`; eine dortige
      Entsprechung bleibt unangetastet.

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.git -F 'dev-db-refresh' . \
  | grep -v '^./openspec/changes/archive/' | grep -v '^./docs/'
```

Was dabei auftaucht, wird bewertet, nicht automatisch entfernt: Ein Taskfile-Eintrag oder ein
Skript, das die CronJob-Ressource erwartet, wäre nach dem Löschen kaputt und gehört in denselben
Vorgang.

## Task 3 — Veraltete Aussagen korrigieren

- [ ] `prod-mentolder/whisper.yaml`: Der Kopfkommentar behauptet, whisper laufe auf
      `k3s-1/2/3`, und beschreibt deren Kapazität. Tatsächlich setzt `prod-fleet/mentolder` die
      Platzierung auf die `pk-hetzner`-Knoten. Kommentar auf den tatsächlichen Zustand bringen.

- [ ] `prod-fleet/staging/kustomization.yaml`: Der Kommentar nennt „NotIn on home workers (from
      prod-mentolder)". Das Overlay bezieht `../../prod`, nicht `prod-mentolder`, und die
      `NotIn`-Patches fallen mit p1 ohnehin weg.

- [ ] `CLAUDE.md`, Abschnitt Cluster-Topologie: Dort stehen drei Worker
      (`gekko-hetzner-2/3/4`). Der lebende Cluster hat zwei — `gekko-hetzner-2` fehlt. Vor der
      Korrektur den Ist-Zustand erheben, statt die Zahl aus diesem Plan zu übernehmen; er ist
      vom 2026-08-08 und kann veraltet sein.

```bash
kubectl --context fleet get nodes -o custom-columns=NAME:.metadata.name --no-headers | sort
```
