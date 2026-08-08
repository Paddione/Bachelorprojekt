# p1 — Tote Node-Affinity entfernen, whisper-Patch umschreiben (impl)

Rolle: impl. Zieldateien: `prod-mentolder/kustomization.yaml`,
`prod-fleet/mentolder/kustomization.yaml`.

Dieses Partial trägt den einzigen nicht-trivialen Eingriff des Vorgangs. Reihenfolge innerhalb des
Partials ist bindend: erst den whisper-Patch umstellen, **dann** die Struktur entfernen, auf der
er heute aufsetzt. Andersherum ist der Zwischenstand nicht baubar.

## Task 1 — Ausgangsbuild als Referenz sichern

- [ ] Vor jeder Änderung den Ist-Zustand bauen. Ohne diese Datei gibt es später nichts zu
      vergleichen, und der Vorgang verliert seinen Wirksamkeitsnachweis.

```bash
set -a; . <(bash scripts/env-resolve.sh mentolder); set +a
kustomize build prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone > /tmp/before-mentolder.yaml
[ -s /tmp/before-mentolder.yaml ] || { echo "FATAL: Referenzbuild leer"; exit 1; }
echo "Referenz: $(grep -c '^kind:' /tmp/before-mentolder.yaml) Ressourcen"   # erwartet: 342
```

## Task 2 — whisper-Patch von JSON6902 auf strategic-merge umstellen

- [ ] In `prod-fleet/mentolder/kustomization.yaml` den whisper-Patch ansehen. Er ist heute ein
      `op: replace` auf
      `/spec/template/spec/affinity/nodeAffinity/requiredDuringSchedulingIgnoredDuringExecution/nodeSelectorTerms/0/matchExpressions/0`.

Dieser Pfad existiert nur, weil der globale `NotIn`-Patch aus `prod-mentolder` ihn anlegt. Der
Patch **ersetzt** also einen fremd erzeugten Ausdruck, statt die Affinität selbst zu setzen.

- [ ] Ihn durch einen strategic-merge-Patch ersetzen, der die vollständige `nodeAffinity` setzt —
      `In: [pk-hetzner-4, pk-hetzner-6, pk-hetzner-8]`. Damit hängt die Platzierung nicht mehr an
      der Existenz einer fremden Struktur.

- [ ] Belegen, dass der Build weiterhin durchläuft und whisper die Platzierung behält, **bevor**
      Task 3 die alte Struktur entfernt. Dieser Zwischenstand muss grün sein.

```bash
set -a; . <(bash scripts/env-resolve.sh mentolder); set +a
kustomize build prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone > /tmp/mid-mentolder.yaml
[ -s /tmp/mid-mentolder.yaml ] || { echo "FATAL: Build nach Patch-Umstellung leer"; exit 1; }
grep -A8 'name: whisper' /tmp/mid-mentolder.yaml | grep -q 'pk-hetzner-4' || { echo "FATAL: whisper-Platzierung verloren"; exit 1; }
echo "OK: whisper-Patch umgestellt, Platzierung intakt"
```

## Task 3 — Die drei globalen NotIn-Patches entfernen

- [ ] In `prod-mentolder/kustomization.yaml` die drei Patches mit `operator: NotIn` gegen
      `k3s-1/2/3` und `k3w-1/2/3` entfernen — Ziele `kind: Deployment`, `kind: CronJob`,
      `kind: Job`.

- [ ] An ihrer Stelle einen kurzen Kommentar hinterlassen, der erklärt, warum dort nichts steht.
      Vorlage ist `k3d/pvc-backup-cronjob.yaml`, wo derselbe Eingriff unter T000368 bereits
      dokumentiert wurde. Ohne den Kommentar fügt der nächste Bearbeiter die Constraints
      plausibel wieder ein.

- [ ] Den whisper-`In`-Override in `prod-mentolder/kustomization.yaml` entfernen. Er zeigt auf
      `k3s-1/2/3` und wird ohnehin von `prod-fleet/mentolder` überschrieben — er ist doppelt tot.

- [ ] Den dev-db-refresh-`In`-Override entfernen. Er hängt an derselben Struktur; die zugehörige
      Ressource verschwindet in p2 vollständig.

- [ ] Den `configMapGenerator` für `dev-db-refresh-script` entfernen. Er liest
      `dev-db-refresh.sh`, die p2 löscht — bleibt er stehen, schlägt der Build fehl, sobald p2
      fertig ist.

## Task 4 — Die leer gewordenen Löschblöcke entfernen

- [ ] In `prod-fleet/mentolder/kustomization.yaml` die drei `$patch: delete`-Blöcke für
      `dev-db-refresh` entfernen: den CronJob, die ConfigMap `dev-db-refresh-script` und die
      NetworkPolicy `allow-devnode-hostnet-to-shared-db-ingress`.

Ein `$patch: delete` auf eine Ressource, die gar nicht mehr gerendert wird, ist bei Kustomize
folgenlos — aber es behauptet die Existenz von etwas, das es nicht gibt, und ist damit dieselbe
Sorte Drift, die dieser Vorgang beseitigt.

- [ ] Den generischen Job-Löschblock (`kind: Job`, T002207) **nicht** anfassen. Er entfernt alle
      Jobs zugunsten der isolierten `flux-<brand>-jobs`-Kustomization und ist aktiv.

## Task 5 — Diff gegen die Referenz

- [ ] Den Build erneut erzeugen und gegen `/tmp/before-mentolder.yaml` halten. Der Diff darf
      ausschließlich aus dem Wegfall von `nodeAffinity`-Blöcken bestehen.

```bash
set -a; . <(bash scripts/env-resolve.sh mentolder); set +a
kustomize build prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone > /tmp/after-mentolder.yaml

# Anker: beide Seiten haben Inhalt
[ -s /tmp/before-mentolder.yaml ] && [ -s /tmp/after-mentolder.yaml ] || { echo "FATAL: leerer Build"; exit 1; }

# Der Diff darf nur Entfernungen enthalten, keine Hinzufuegungen
added="$(diff /tmp/before-mentolder.yaml /tmp/after-mentolder.yaml | grep -c '^>' || true)"
echo "hinzugefuegte Zeilen im Diff: $added"   # erwartet: 0

# Ressourcenzahl unveraendert
[ "$(grep -c '^kind:' /tmp/after-mentolder.yaml)" -eq 342 ] || { echo "FATAL: Ressourcenzahl weicht ab"; exit 1; }
```

Zeigt der Diff Hinzufügungen, ist mehr passiert als beabsichtigt — dann klären, bevor es
weitergeht. Ein Ergebnis, das nur „sieht richtig aus", genügt für einen Eingriff im
Produktions-Auslieferungspfad nicht.
