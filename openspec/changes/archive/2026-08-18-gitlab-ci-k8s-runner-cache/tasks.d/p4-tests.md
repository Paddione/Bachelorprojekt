# p4 — Guards: Namespace-Grenzen, RBAC, Cache-Erreichbarkeit

Zieldateien: `tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats`,
`tests/spec/ci-cd/gitlab-runner-fleet-rbac.bats`, `tests/spec/ci-cd/gitlab-registry-cache.bats`

Dieses Partial hängt an p1, p2 und p3 (siehe `tasks.md` → Partials-Tabelle) — seine drei Dateien
lesen die von jenen erzeugten Manifeste/Skripte. Es trägt außerdem den geforderten RED-Step des
Gesamtplans (STRUCT2).

## Verbindliche Konventionen für alle drei Dateien (nicht optional)

Diese Punkte haben im Repo je einen dokumentierten Schadensfall — sie sind hier Vorgabe, nicht
Empfehlung:

- **Positiv-Anker im selben Test** (T002356-M1): Jeder Negativtest („kein ClusterRole", „kein
  SA-Token") belegt zuerst, dass die geprüfte Objektklasse überhaupt gefunden wurde. Sonst
  besteht die Aussage vakuos bei fehlender oder leerer Datei.
- **Semantik statt Darstellung** (T002716): YAML wird mit `python3` + `yaml.safe_load_all`
  strukturiert geparst, nie über Zeilenanker/`grep -n … | head`. Der PriorityClass-`value` wird
  **numerisch** verglichen (`(( wert < default ))`), nicht als String.
- **grep mit Optionsschutz** (T003108): Jedes `grep` auf ein `--flag`-Literal mit `-e` oder `--`
  absichern, sonst Exit 2 statt 1 — in einer `if`/`[[ ]]`-Bedingung sonst ununterscheidbar von
  „nicht gefunden".
- **`bash -n` ist kein `.bats`-Syntaxcheck.** Vor dem ersten Lauf:
  ```bash
  tests/unit/lib/bats-core/bin/bats --count tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats
  tests/unit/lib/bats-core/bin/bats --count tests/spec/ci-cd/gitlab-runner-fleet-rbac.bats
  tests/unit/lib/bats-core/bin/bats --count tests/spec/ci-cd/gitlab-registry-cache.bats
  ```
- **`$output`-Matching nie unqualifiziert**, wenn ein geprüftes Skript `$0` ausgibt. Der aktuelle
  Worktree heißt `gitlab-k8s-runner` — ein ungegrenzter Substring-Match könnte durch den
  Verzeichnisnamen selbst erfüllt werden, obwohl das eigentliche Merkmal fehlt. Assertions immer
  auf die relevante Ausgabezeile/den relevanten Substring eingrenzen (`grep -e` auf ein
  spezifisches Token), nie `[[ "$output" == *"..."* ]]` gegen die volle Ausgabe.
- **Header-Kommentar mit Prüfmodus** in jeder Datei — Vorbild
  `tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats` (Output-Verifikation) und
  `tests/spec/ci-cd/gitlab-runner-tag-routing.bats` (Quelltext-/Struktur-Inspektion, mit
  Begründung, warum hier keine Laufzeit-Verifikation möglich ist).
- **Vendored Runner ausschließlich:** `tests/unit/lib/bats-core/bin/bats`. Niemals ein globales
  `bats` (Versionsdrift zu CI, siehe `CLAUDE.md`).
- **Gegenprobe außerhalb des Repos, nie im Worktree:** Für jeden Guard wird in einer Kopie unter
  `/tmp` (z. B. `cp -r k3d/gitlab-runner-stack /tmp/p4-counter-check-$$`) die zugesicherte
  Eigenschaft gezielt zerstört (z. B. `PriorityClass`-Wert über den Default heben, `Role` zu
  `ClusterRole` umbenennen, `automountServiceAccountToken` entfernen) und belegt, dass derselbe
  Guard — gegen die kaputte Kopie gerichtet — **rot** wird. Ein Guard, der bei kaputtem Zustand
  grün bleibt, ist wertlos; genau das ist in Etappe 1 einmal passiert (Vorfall dokumentiert in
  `tasks.md` dieser Etappe als Lernpunkt für Etappe 2). Die Gegenprobe ist ein manueller
  Nachweisschritt beim Implementieren dieses Partials, kein eigener `@test`-Block — sie belegt,
  dass der `@test`-Block seine Aufgabe erfüllt, bevor er committet wird.

## RED-Step (STRUCT2 — Pflichtnachweis des Gesamtplans)

Vor der Implementierung von p1–p3 existieren weder die Manifeste noch das Cache-Skript. Die drei
Guards werden **zuerst** geschrieben und ausgeführt:

```bash
tests/unit/lib/bats-core/bin/bats -r \
  tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats \
  tests/spec/ci-cd/gitlab-runner-fleet-rbac.bats \
  tests/spec/ci-cd/gitlab-registry-cache.bats
# expected: FAIL — die Manifeste (k3d/gitlab-runner-stack/*.yaml) und das Cache-Skript
# (scripts/gitlab-runner-cache.sh) fehlen noch; jeder Fehlertext muss die fehlende Datei
# konkret benennen, nicht generisch "test failed" lauten.
```

Nach p1–p3:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/gitlab-runner-fleet-*.bats \
  tests/spec/ci-cd/gitlab-registry-cache.bats
# expected: PASS
```

## Datei 1: `gitlab-runner-fleet-guardrails.bats`

**Prüfmodus (Header-Kommentar):** Struktur-Inspektion der gerenderten/rohen Manifeste
(`k3d/gitlab-runner-stack/`) per `kubectl kustomize` + `python3`/`yaml.safe_load_all` — kein
Cluster-Zugriff, analog zu `gitlab-runner-tag-routing.bats`.

Prüft die vier Grenzen aus Design D2, alle vier unabhängig voneinander (keine deckt die andere
ab):

```bash
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  STACK_DIR="${REPO_ROOT}/k3d/gitlab-runner-stack"
}

_render() {
  kubectl kustomize "$STACK_DIR" --load-restrictor=LoadRestrictionsNone
}
```

- **Positiv-Anker:** ein Test belegt zuerst, dass `_render` überhaupt einen Runner-Workload
  (`kind: Deployment` oder `kind: StatefulSet`, `metadata.name` referenziert `gitlab-runner` bzw.
  `registry-cache`) enthält. Ohne diesen Anker wären alle folgenden „X fehlt nicht"-Aussagen bei
  leerem Manifest trivial erfüllt.
- **ResourceQuota vorhanden**, im Namespace `gitlab-runner`, mit gesetzten `spec.hard`-Werten für
  mindestens `cpu` (oder `requests.cpu`) und `memory` (oder `requests.memory`) — Existenzcheck
  plus „Werte sind nicht leer", nicht auf konkrete Zahlen ankern (die gehören p1 und können sich
  ändern, ohne dass dieser Guard bricht).
- **LimitRange vorhanden**, im selben Namespace, mit mindestens einem `default`/`defaultRequest`
  Eintrag für `cpu` oder `memory` unter `spec.limits[].type: Container`.
- **PriorityClass vorhanden**, `value` **numerisch kleiner** als der Cluster-Default. Der
  Cluster-Default ist `0` (Kubernetes-Konvention: eine PriorityClass ohne `globalDefault: true`
  im Cluster bedeutet Default `0`), es sei denn, p1 hinterlegt selbst eine
  `globalDefault: true`-Klasse — dann diesen Wert lesen statt `0` fix zu codieren. Der Test liest
  den Vergleichswert dynamisch:
  ```python
  default_value = next(
      (pc["value"] for pc in priority_classes if pc.get("globalDefault")),
      0,
  )
  assert ci_priority_class["value"] < default_value
  ```
  **Nicht** `grep -q 'value: -1'` o. ä. — das ist der T002716-Fall, gegen den dieser Guard
  ausdrücklich gebaut wird: eine Zahlenzusicherung, keine Zeichenkette.
- **nodeSelector schließt Control-Plane aus:** Runner- und (falls im Manifest vorhanden)
  Job-Pod-Template tragen `spec.template.spec.nodeSelector` mit `node-type: worker`
  (gemessener Wert, siehe p3-Kontext — **nicht** `node-role.kubernetes.io/control-plane`, das ist
  das Label der CP-Knoten selbst und stünde als Ausschluss falsch herum). Belegen, dass der
  Selector-Key/-Value exakt den drei Control-Plane-Knoten (`pk-hetzner-4/6/8`, tragen laut
  `kubectl --context fleet get nodes --show-labels` **kein** `node-type=worker`) keinen Match
  liefert — das ist über die YAML-Struktur allein prüfbar, ohne Cluster-Zugriff: der Test
  behauptet nur, dass der Selector-Key `node-type` mit Wert `worker` gesetzt ist, und dokumentiert
  im Kommentar, welche Knoten das ausschließt.

## Datei 2: `gitlab-runner-fleet-rbac.bats`

**Prüfmodus (Header-Kommentar):** Struktur-Inspektion, gleiche Render-Basis wie Datei 1.

- **Positiv-Anker:** mindestens ein RBAC-Objekt (`kind` ∈ `Role`, `RoleBinding`, `ClusterRole`,
  `ClusterRoleBinding`, `ServiceAccount`) existiert im gerenderten Manifest — sonst wäre „keine
  ClusterRole vorhanden" bei leerem Manifest vakuos wahr.
- **Kein `ClusterRole`/`ClusterRoleBinding`:** über alle `kind`-Felder der geparsten Dokumente
  iterieren, keines darf `ClusterRole` oder `ClusterRoleBinding` sein. Nach dem Positiv-Anker
  oben ist diese Aussage jetzt nicht mehr vakuos.
- **`Role` und `RoleBinding` vorhanden**, beide `metadata.namespace: gitlab-runner`.
- **`automountServiceAccountToken: false`** auf dem Job-Pod-Template (bzw. auf dem
  ServiceAccount, falls dort gesetzt — beide Stellen prüfen, whichever das Manifest nutzt) UND
  auf dem `registry-cache`-Deployment aus p3 (dieselbe Anforderung gilt dort, siehe
  `p3-cache.md` Aufgabe 1). Zwei getrennte Assertions, nicht eine gemeinsame — ein Guard, der
  beide Objekte in einem `grep -c` zusammenzählt, kann eine fehlende Einstellung am zweiten
  Objekt durch einen Treffer am ersten verdecken.

## Datei 3: `gitlab-registry-cache.bats`

**Prüfmodus (Header-Kommentar):** gemischt — Struktur-Inspektion für die fleet-Seite (kein
Cluster nötig), **Output-Verifikation** für die lokale Seite (das Skript wird tatsächlich mit
`--dry-run` ausgeführt, analog `gitlab-runner-setup-dryrun.bats`).

```bash
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  STACK_DIR="${REPO_ROOT}/k3d/gitlab-runner-stack"
  CACHE_SH="${REPO_ROOT}/scripts/gitlab-runner-cache.sh"
}
```

- **fleet-Seite:** `_render "$STACK_DIR"` enthält ein Deployment `registry-cache` mit einer
  `env`-Eintrag `REGISTRY_PROXY_REMOTEURL` = `https://registry-1.docker.io` (Struktur-Match auf
  `containers[].env[].name`/`.value`, nicht auf eine Textzeile) sowie einen Service
  `registry-cache` mit Port `5000`. Positiv-Anker zuerst: Deployment `registry-cache` existiert
  überhaupt, bevor sein Env-Inhalt geprüft wird.
- **PVC-StorageClass:** `registry-cache-data` referenziert `storageClassName: longhorn` — mit
  Begründungskommentar im Test, dass `local-path` hier bewusst falsch wäre (keine Expansion, kein
  Node-Failover, siehe `p3-cache.md`).
- **lokale Seite:**
  ```bash
  if [ ! -f "$CACHE_SH" ]; then
    echo "erwartete Datei fehlt: $CACHE_SH" >&2
    false
  fi
  run bash "$CACHE_SH" --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -qe 'REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io'
  echo "$output" | grep -qF -- 'registry:2'
  ```
  Kein unqualifizierter `$output`-Match auf `$0` oder den Skriptpfad — der Worktree-Name
  `gitlab-k8s-runner` darf keinen Treffer erzeugen können (siehe Konventionsliste oben); die
  Assertions greifen ausschließlich spezifische Cache-Tokens ab, die im Usage-Text des Skripts
  nicht vorkommen.
- **Echtlauf-Fehlerpfad ohne Docker:** analog zum zweiten Test in
  `gitlab-runner-setup-dryrun.bats` — `unset`-artiger Zustand ohne installiertes `docker` (falls
  im CI-Läufer nicht vorhanden, sonst übersprungen mit `skip`) muss mit Exit ≠ 0 und einer
  Zeile abbrechen, die `docker` als fehlende Voraussetzung benennt.

## Abgrenzung

- Kein Test prüft den tatsächlichen Cache-Trefferzustand oder Laufzeiten im laufenden Cluster —
  das ist laut `design.md` (Abschnitt „Testing", letzter Absatz) statisch nicht prüfbar und
  gehört in die manuelle Abnahme (`tasks.md`, Schritt „Manuelle Abnahme gegen den laufenden
  Cluster").
- Kein Test ruft `docker run` real auf oder startet einen echten Registry-Container — die
  lokale Seite wird ausschließlich über `--dry-run` geprüft.
- Kein Test prüft die containerd-`registries.yaml` auf den fleet-Worker-Knoten — das ist eine
  host-level, Git-externe Konfiguration (siehe `p3-cache.md`, Runbook-Aufgabe) und damit ohne
  Cluster-Zugriff nicht prüfbar; sie bleibt Gegenstand der manuellen Abnahme.
- Keine neue `test-inventory.json`-Pflege in diesem Partial — `task test:inventory` läuft im
  Final-Verification-Schritt des Gesamtplans (`tasks.md`), nicht separat pro Partial.
