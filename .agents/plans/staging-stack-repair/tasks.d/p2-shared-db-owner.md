# p2 — Owner-Normalisierung und sichtbare Fehler im shared-db-postStart

Target files: `k3d/shared-db.yaml`. Design: `design.md` RC2, D2. Keine anderen Dateien ändern.

Achtung T002306: Im postStart-Block stehen Laufzeit-Variablen als `$$name`, der Flux-Renderer
halbiert `$$` zu `$`. Neue Laufzeit-Variablen ebenfalls mit `$$` schreiben. Den Kommentarblock
dazu nicht anfassen.

### Task 1: ensure-Zeilen ersetzen

Im Container `postgres`, `lifecycle.postStart.exec.command`, die drei Zeilen am Ende des Skripts.
Ist:

```bash
                    bash /scripts/ensure-knowledge-schema.sh || true
                    bash /scripts/ensure-meetings-schema.sh || true
                    bash /scripts/ensure-bachelorprojekt-schema.sh || true
```

Soll (gleiche Einrückung, 20 Leerzeichen):

```bash
                    # Owner-Normalisierung [T900806]: die ensure-Skripte laufen mit
                    # SET ROLE website und brauchen REFERENCES auf public-Tabellen.
                    # Gehoeren diese postgres (z. B. nach einem Restore als postgres),
                    # scheitern Foreign Keys auf public.brands/customers. Auf Prod ein No-op.
                    psql -U postgres -d website -Atc "SELECT format('ALTER TABLE public.%I OWNER TO website;', tablename) FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'postgres'" \
                      | psql -U postgres -d website -v ON_ERROR_STOP=1 -q \
                      || echo "shared-db postStart: owner-normalisation failed [T900806]" >/proc/1/fd/2
                    # Fehler sichtbar in den Pod-Logs statt `|| true`; der Hook selbst
                    # darf nicht scheitern, sonst killt kubelet den Container.
                    for s in ensure-knowledge-schema ensure-meetings-schema ensure-bachelorprojekt-schema; do
                      bash /scripts/$$s.sh \
                        || echo "shared-db postStart: $$s.sh failed (exit $$?) [T900806]" >/proc/1/fd/2
                    done
```

`/proc/1/fd/2` ist der stderr von Postgres (PID 1), dadurch landet die Meldung in
`kubectl logs`. Ausgaben eines postStart-Hooks selbst erscheinen dort nicht.

### Task 2: Render prüfen

```bash
task workspace:validate
grep -n -E '\$\$s\.sh|\$\$\?' k3d/shared-db.yaml
# erwartet: 2 Treffer, beide mit doppeltem Dollarzeichen wie das bestehende `$$db`
```

`kustomize build` halbiert `$$` nicht, das macht erst `scripts/flux-render-artifact.sh` beim
Flux-Artefakt. Maßgeblich ist, dass die neuen Laufzeit-Variablen dieselbe Form haben wie das
bestehende `$$db` im selben Block.

### Prüfung

```bash
tests/unit/lib/bats-core/bin/bats -f 'shared-db' tests/spec/staging-stack-repair.bats   # 2 ok
```
