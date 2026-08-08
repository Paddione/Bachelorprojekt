# p3 — Invarianten-Guard (tests)

Rolle: tests. Zieldateien: `tests/spec/fleet-operations/dead-node-affinity.bats`,
`website/src/data/test-inventory.json`.

Unabhängig von p1 und p2. Schreibt den Test zuerst; er ist auf dem aktuellen Stand rot, weil die
toten Knoten noch im gebauten Output stehen.

Prüfmodus: **Kommando-Ergebnis-Verifikation** gegen den `kustomize build`-Output, nicht gegen die
Overlay-Quellen. Ein Constraint kann auf jeder Schicht der Wrapper-Kette entstehen; nur das
gebaute Ergebnis zeigt, was den Cluster erreicht.

## Task 1 — Guard schreiben (RED)

- [ ] `tests/spec/fleet-operations/dead-node-affinity.bats` anlegen — ein Verzeichnis je
      SSOT-Spec, eine Datei je Vorgang (Konvention T002416).

Drei `@test`-Blöcke, jeder mit Positiv-Anker vor der Negativ-Aussage:

**Block 1 — keine stillgelegten Knoten im gebauten Brand-Output.**
Für `prod-fleet/mentolder` und `prod-fleet/korczewski` je einmal bauen. Anker: der Build liefert
Ressourcen (`grep -c '^kind:'` > 0). Aussage: keiner der Hostnamen `k3s-1`, `k3s-2`, `k3s-3`,
`k3w-1`, `k3w-2`, `k3w-3` kommt als Wert vor. Kommentarzeilen sind ausgenommen — im
`kustomize build`-Output gibt es ohnehin keine, was diesen Block angenehm eindeutig macht.

**Block 2 — nichts wird erzeugt, um von allen Konsumenten verworfen zu werden.**
Die Ressourcen-Identitäten (`kind`/`name`) aus `kustomize build prod-mentolder` gegen die
Vereinigung aus `prod-fleet/mentolder` und `prod-fleet/mentolder-jobs` halten. Anker: beide Mengen
sind nicht leer. Aussage: die Differenz ist leer.

Hierbei die Job-Ausnahme berücksichtigen: `prod-fleet/mentolder` entfernt absichtlich **alle**
Jobs, weil sie in die isolierte `flux-mentolder-jobs`-Kustomization ausgelagert sind (T002207).
Ein Job zählt deshalb als überlebend, wenn er in `mentolder-jobs` auftaucht — genau dafür ist die
Vereinigung beider Wrapper die richtige Vergleichsmenge und nicht der einzelne Wrapper.

**Block 3 — whisper behält seine Fleet-Platzierung.**
Aus dem gebauten mentolder-Output das `whisper`-Deployment ziehen. Anker: das Deployment existiert
im Output. Aussage: seine `nodeAffinity` verlangt einen Hostnamen aus `pk-hetzner-4`,
`pk-hetzner-6`, `pk-hetzner-8`.

Die Extraktion MUSS dokumentenweise über `yq` laufen, nicht über ein `grep -A<n>`-Zeilenfenster:

```bash
WQ='select(.kind == "Deployment" and .metadata.name == "whisper")'
yq eval-all "$WQ | .spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values" "$build"
```

Grund, belegt am 2026-08-08 gegen den realen Build: `name: whisper` steht dort dreimal (Service,
Deployment, Container), und die Affinität liegt rund **20 Zeilen** unter dem Deployment-Namen. Ein
`grep -A8` findet sie nicht und meldet den Verlust einer Platzierung, die tatsächlich intakt ist.
Der Anker (`.metadata.name` ist nicht leer) unterscheidet dabei „Deployment fehlt" von
„Deployment da, Affinität weg" — beide Fälle sind Fehler, aber nicht derselbe.

Dieser Block ist der wichtigste der drei. Der whisper-Patch wird in p1 von einem JSON6902
`op: replace` auf einen strategic-merge-Patch umgestellt. Geht dabei etwas schief, **schlägt der
Build nicht fehl** — whisper verlöre nur seine Platzierung und würde künftig irgendwo scheduled.
Ein Fehler, den nur eine Aussage über das Ergebnis fängt.

- [ ] Die Builds im Test brauchen die Env-Variablen aus `scripts/env-resolve.sh`. Im `setup()`
      des Tests laden, nicht je Block — sonst wird derselbe Aufruf sechsfach ausgeführt.

- [ ] Syntax prüfen. `bash -n` taugt für `.bats` nicht.

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/fleet-operations/dead-node-affinity.bats
```

- [ ] **Failing-Test-Step (RED).** Gegen den unbereinigten Stand laufen lassen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/dead-node-affinity.bats
# expected: FAIL — Block 1 ist rot (je 50 Vorkommen der sechs Hostnamen im
# mentolder-Output) und Block 2 ist rot (dev-db-refresh: CronJob, ConfigMap und
# NetworkPolicy werden von prod-mentolder gerendert und von beiden Wrappern verworfen).
# Block 3 ist bereits GRUEN — er sichert eine Eigenschaft, die heute schon gilt und
# durch p1 nicht verloren gehen darf.
```

Block 3 ist bewusst von Anfang an grün. Er ist kein Rot-Grün-Schritt, sondern eine
Regressionssicherung für einen Zustand, den der Vorgang gefährdet.

## Task 2 — Test-Inventar regenerieren

- [ ] Nach dem Anlegen der Testdatei das Inventar erzeugen und mitcommitten; CI vergleicht es
      gegen den Stand im Repo.

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/fleet-operations/dead-node-affinity.bats
```
