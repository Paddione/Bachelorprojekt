# Proposal: deploy-dead-node-affinity

## Why

Das gebaute Manifest der Marke mentolder enthält je 50 Vorkommen von `k3s-1`, `k3s-2`, `k3s-3`,
`k3w-1`, `k3w-2` und `k3w-3` als `NotIn`-nodeAffinity — rund 300 Zeilen Scheduling-Constraints,
die bei jedem Flux-Reconcile nach Produktion gehen. Gegen den lebenden Cluster geprüft: er hat
fünf Knoten (`pk-hetzner-4`, `pk-hetzner-6`, `pk-hetzner-8`, `gekko-hetzner-3`,
`gekko-hetzner-4`). Keiner der sechs ausgeschlossenen Knoten existiert.

Funktional ist das folgenlos — ein `NotIn` gegen nicht existierende Knoten schließt nichts aus.
Es ist trotzdem falsch: Konfiguration im Auslieferungspfad soll beschreiben, was gilt. Diese
beschreibt eine Cluster-Topologie, die es seit dem 2026-05-31 nicht mehr gibt, und jeder, der die
Platzierungsregeln der Marke verstehen will, muss sie erst als tot erkennen.

Der zweite Befund ist eine Schicht, die erzeugt, um sofort zu verwerfen. `prod-mentolder` rendert
`dev-db-refresh` als CronJob, ConfigMap und NetworkPolicy. `prod-fleet/mentolder` löscht alle drei
per `$patch: delete`; `prod-fleet/mentolder-jobs` entfernt sie implizit, weil es alle
Nicht-Job-Typen verwirft. Der gebaute Output beider Wrapper enthält null Vorkommen — die
Ressourcen erreichen keinen Cluster.

Für die Bereinigung gibt es einen Präzedenzfall im selben Baum: `k3d/pvc-backup-cronjob.yaml`
trägt unter T000368 exakt diesen Eingriff, mit derselben Begründung — _„the former nodeAffinity
NotIn list referenced decommissioned nodes (k3s-1/2/3, k3w-1/2/3) that no longer exist on fleet —
dead drift, removed."_ Dieser Vorgang zieht nach, was dort schon entschieden wurde.

### Warum nicht das ursprünglich geplante Verschieben

Dieser Vorgang war als Umstrukturierung der Verzeichnisebene geplant — Service-Verzeichnisse
unter `apps/`, Deploy-Verzeichnisse unter `deploy/`. Die Messung der Referenzflächen hat das
verworfen:

| Verzeichnis | Vorkommen | Betroffene Dateien |
| --- | --- | --- |
| `website/` | 5225 | 560 |
| `k3d/` | 984 | 283 |
| `environments/` | 506 | 185 |
| `brett/` | 323 | 216 |

Ein Verschieben hieße, mehrere hundert Dateien anzufassen, ohne dass sich am Verhalten etwas
ändert. Der Zielname `apps/` wäre zudem doppelt belegt: dort liegt bereits die App-Registry, deren
Einträge über `apps/${appName}/app.yaml` dynamisch adressiert werden. Statt der Kosmetik behandelt
dieser Vorgang die tote Konfiguration in derselben Ecke — kleiner im Umfang und, anders als das
Verschieben, per `kustomize build`-Diff beweisbar.

## What

Der Vorgang betrifft **ausschließlich mentolder**. Korczewski ist sauber: null tote Knoten im
gebauten Output, und sein Overlay nutzt einen positiven `In`-Selektor statt der `NotIn`-Liste.

### Entfernen

- `prod-mentolder/kustomization.yaml`: die drei globalen `NotIn`-Patches (Ziel `Deployment`,
  `CronJob`, `Job`), den whisper-`In`-Override und den dev-db-refresh-`In`-Override
- `prod-mentolder/`: `dev-db-refresh-cron.yaml`, `dev-db-refresh-netpol.yaml`,
  `dev-db-refresh.sh` samt zugehörigem `configMapGenerator`
- `prod-fleet/mentolder/kustomization.yaml`: die drei `$patch: delete`-Blöcke für dev-db-refresh —
  nach dem Entfernen an der Quelle gibt es nichts mehr zu löschen

### Umschreiben

Der whisper-Patch in `prod-fleet/mentolder` ist ein JSON6902-`op: replace` auf
`/spec/template/spec/affinity/nodeAffinity/requiredDuringSchedulingIgnoredDuringExecution/nodeSelectorTerms/0/matchExpressions/0`.
Dieser Pfad existiert nur, **weil** der globale `NotIn`-Patch ihn anlegt. Fällt der weg, schlägt
`kustomize build` auf einen nicht existierenden Pfad fehl. Der Patch wird deshalb auf einen
strategic-merge-Patch umgestellt, der die Affinität selbst setzt statt sie zu ersetzen.

Das ist der Grund, warum dieser Vorgang nicht aus reinen Löschungen besteht: Die tote Struktur
trägt eine lebende Regel huckepack.

### Veraltete Aussagen korrigieren

- `prod-mentolder/whisper.yaml` behauptet im Kopfkommentar, whisper werde auf `k3s-1/2/3`
  platziert — tatsächlich überschreibt `prod-fleet/mentolder` das auf die `pk-hetzner`-Knoten
- `prod-fleet/staging/kustomization.yaml` verweist auf „NotIn on home workers (from
  prod-mentolder)"
- `CLAUDE.md` nennt drei Worker (`gekko-hetzner-2/3/4`); der Cluster hat zwei —
  `gekko-hetzner-2` fehlt

## Invarianten

Die Verifikation ist ein `kustomize build`-Diff vorher gegen nachher. Er muss **ausschließlich**
aus dem Wegfall der `nodeAffinity`-Blöcke bestehen:

- whisper landet weiterhin auf `nodeAffinity In: [pk-hetzner-4, pk-hetzner-6, pk-hetzner-8]`
- die Ressourcenzahl im gebauten `prod-fleet/mentolder` bleibt exakt **342** — dev-db-refresh wird
  heute schon weggelöscht, das Entfernen an der Quelle darf die Zahl also nicht verändern
- `prod-fleet/mentolder-jobs` und `prod-fleet/korczewski` bauen unverändert

## Non-Goals

Keine Verzeichnis-Verschiebungen. Korczewski wird nicht angefasst. Vorgang B (die 15
`Taskfile.*.yml` nach `taskfiles/`) ist zurückgestellt — er ist funktional folgenlos und würde
dauerhaft zwei Schreibweisen im Repo hinterlassen, weil die 32 Archiv-Dokumente korrekterweise
den alten Pfad behalten.

_Ticket: T002699_
