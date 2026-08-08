# Flux-Artefakt versionierbar und in sich vollständig machen

**Ticket:** T002706
**Datum:** 2026-08-08
**Domains:** infra, ci, gitops

## Problem

Die Auslieferung nach `fleet` läuft pull-basiert über ein OCI-Artefakt, das
`.github/workflows/render-fleet-artifact.yml` auf jeden `main`-Push rendert und
`flux/clusters/fleet/oci-source.yaml` reconciled. Drei Defekte machen diesen Pfad
weder zurückrollbar noch reproduzierbar.

### D1 — Das Artefakt hat keinen benannten Rollback-Punkt

`render-fleet-artifact.yml:88` pusht ausschließlich
`oci://ghcr.io/paddione/fleet-manifests:latest`; `oci-source.yaml:9-10` trackt
`ref.tag: latest`. Alle zehn Flux-Kustomizations hängen an dieser einen
`OCIRepository`. Ein Rollback ist heute nur über `spec.ref.digest` möglich, wobei
das Digest aus der GHCR-Package-UI zwischen untagged Manifesten herausgesucht
werden muss — die zudem Garbage-Collection-Kandidaten sind.

### D2 — Der Image-Tag im Artefakt wechselt je nach Trigger

`scripts/flux-render-artifact.sh:46-47` und `Taskfile.yml:3978-3979` setzen
`: "${WEBSITE_IMAGE_TAG:=latest}"` bzw. `BRETT_IMAGE_TAG`. Der Render-Workflow hat
zwei Trigger:

- `workflow_call` aus `build-website.yml:105` — übergibt den Build-SHA
- `push` auf Manifest-Pfade — übergibt nichts, der `latest`-Default greift

Gemessen am 2026-08-08 über `gh run list`, gezählt nach Event:

| Pfad | Läufe | Fenster | ≈ pro Tag |
|---|---|---|---|
| `render-fleet-artifact.yml` direkt | 88 `push` + 4 `workflow_dispatch` | 2026-07-22 – 2026-08-08 (18 T) | 5,1 |
| via `build-website.yml` | 100 (96 grün) | 2026-08-03 – 2026-08-08 (5,6 T) | 17,9 |

Beide Pfade überschreiben dasselbe `:latest`-Artefakt; es gewinnt der letzte. Rund
jedes fünfte Artefakt trägt damit `website:latest` statt eines SHA.

**D1 und D2 sind gekoppelt.** Würde nur D1 behoben, wäre ein Rollback auf
`sha-<gut>` ein halbes Rollback: alte Manifeste kombiniert mit dem neuesten
Website-Image, weil das Artefakt intern `website:latest` sagt. Ein per Digest
gepinntes Artefakt, dessen Inhalt auf einen beweglichen Tag zeigt, ist eine
unveränderliche Referenz auf eine veränderliche Auflösung. Das ist die
gefährlichere Fehlerform, weil es wie ein vollständiges Rollback aussieht.

### D3 — `BRETT_IMAGE_TAG` ist tot verdrahtet

`build-brett.yml:72` übergibt `brett_image_tag: sha-…`, `render-fleet-artifact.yml:74`
setzt es als Env, `scripts/flux-render-artifact.sh:48` exportiert es — und kein
Manifest liest es. `k3d/brett.yaml:34` verwendet `${BRETT_IMAGE}`, das in
`environments/fleet-mentolder.yaml:24` und `fleet-korczewski.yaml:24` fest auf
`latest` steht. Live auf `fleet` bestätigt: `ghcr.io/paddione/workspace-brett:latest`.

Brett ist damit auf **keinem** Pfad SHA-gepinnt. Die Ursache ist eine
Namensasymmetrie zwischen zwei Manifesten:

```yaml
k3d/website.yaml:222   image: ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}
k3d/brett.yaml:34      image: ghcr.io/paddione/workspace-brett:${BRETT_IMAGE}
```

Bei Website trennen die Variablen Name und Tag, bei Brett trägt `BRETT_IMAGE` den
Tag. Deshalb konnte eine vollständig aussehende Plumbing-Kette gebaut werden, die
nirgends ankommt — das Rendering gelingt ja, nur eben mit dem alten Wert.

## Nicht im Scope

- **`ImagePolicy` / `ImageUpdateAutomation` mit Semver-Tracking.** Semver-Auto-Promotion
  zöge genau das Release-Gate wieder ein, das in diesem Repo bewusst fehlt: bei hoher
  PR-Frequenz soll jeder Merge ausliefern.
- **`release-please`.** Bleibt unverändert rein informativ (CHANGELOG, Tags, GitHub
  Releases) und gated keinen Deploy.
- **Der Wechsel von korczewski auf die React-Seite.** Eigener Vorgang.
- **`out/clusters/fleet`.** Renderer-Abschnitt 7 kopiert `flux/clusters/fleet/*.yaml`
  ins Artefakt, aber keine Kustomization konsumiert diesen Pfad — alle zehn zeigen
  woandershin, und der `FluxInstance` synct die CRs direkt aus dem GitRepository.
  Totes Gewicht, harmlos, hier nur festgehalten.

## Entwurf

### 1. Digest-Pinning nach bestehendem Muster

Das Repo pinnt `studio-server` bereits genau so, und dieser Entwurf dehnt das
Verfahren aus, statt ein neues zu erfinden:

```yaml
# environments/fleet-mentolder.yaml:76
STUDIO_IMAGE_DIGEST: sha256:3fb082d01ee1679ccbe75831e7badc66f51fae8995afa5283da03eb4d349e7f3

# environments/schema.yaml:295-299
validate: "^sha256:[a-f0-9]{64}$"

# prod-fleet/mentolder/studio-patch.yaml:27
image: ${STUDIO_IMAGE}@${STUDIO_IMAGE_DIGEST}
```

Base bleibt beweglich, das prod-fleet-Overlay pinnt:

```yaml
# k3d/website.yaml:222 — unverändert, dev/k3d braucht den beweglichen Tag
image: ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}

# prod-fleet/website-mentolder/, prod-fleet/website-korczewski/ — neu
image: ghcr.io/paddione/${WEBSITE_IMAGE}@${WEBSITE_IMAGE_DIGEST}
```

Analog für Brett in `prod-fleet/mentolder/` und `prod-fleet/korczewski/` mit
`BRETT_IMAGE_DIGEST`.

`BRETT_IMAGE_TAG` wird **ersatzlos entfernt**, nicht repariert: die Variable hat nie
ein Manifest erreicht, und ein zweiter Tag-Pfad neben dem Digest wäre genau die
zweite Wahrheit, die dieser Vorgang beseitigt. Der `brett_image_tag`-Input des
Render-Workflows wird durch `brett_image_digest` ersetzt, `website_image_tag`
entsprechend durch `website_image_digest`.

### 2. Herkunft des Digests

Ein neues Einzweck-Skript `scripts/resolve-image-digest.sh` kapselt die Auflösung.
Es nimmt eine Image-Referenz und gibt das Digest auf stdout aus; die Priorität der
Quellen liegt beim Aufrufer.

| Pfad | Quelle |
|---|---|
| `workflow_call` (Image wurde gerade gebaut) | Der Build übergibt seinen Digest direkt — `docker/build-push-action` liefert ihn als Output. |
| `push`-Trigger (nur Manifeste geändert) | `crane digest ghcr.io/paddione/website:latest` im Render-Job, der bereits an GHCR angemeldet ist. |
| Offline (BATS, lokal, break-glass) | Committeter Fallback `WEBSITE_IMAGE_DIGEST` / `BRETT_IMAGE_DIGEST` in `environments/fleet-*.yaml`, schema-validiert wie `STUDIO_IMAGE_DIGEST`. |

Der Offline-Fallback ist nicht verhandelbar: `tests/spec/workspace-deploy.bats:375`
führt den Renderer in CI ohne Registry-Zugang aus und sichert ausdrücklich zu, dass
er „every component tree offline (kustomize|sed|envsubst|sed) without cluster/secret
access" rendert. Ein Entwurf mit Pflicht-Registry-Zugang bräche diesen Vertrag.

### 3. Fail-closed an der richtigen Stelle

Der Fallback greift **nur bei bewusst offline**, nie bei *fehlgeschlagen*. Schlägt
der Registry-Lookup in CI fehl, bricht der Render ab, statt still den committeten —
womöglich Wochen alten — Digest einzusetzen.

Unterschieden wird über ein explizites Signal (`--offline` bzw. vorhandene
GHCR-Credentials), nicht über den Exit-Code des Lookups. „Lookup ging nicht" und
„wir sind offline" sehen im Code gleich aus und bedeuten Gegenteiliges.

Die Repo-Historie ist hier einschlägig: `scripts/flux-render-artifact.sh:41-60`
und `:146-155` dokumentieren zwei Vorfälle, in denen eine leer substituierte
Variable statt eines Fehlers prod eingefroren bzw. die shared-db-Passwörter
zerstört und SSO plattformweit lahmgelegt hat.

### 4. Unveränderlicher Artefakt-Tag

```bash
flux push artifact oci://ghcr.io/paddione/fleet-manifests:latest --path=./out …
flux tag artifact oci://ghcr.io/paddione/fleet-manifests:latest --tag "sha-${GITHUB_SHA}"
```

Rollback wird damit eine Zeile in `flux/clusters/fleet/oci-source.yaml`:

```yaml
  ref:
    tag: sha-294fef18c...   # statt: latest
```

Das ist zirkelfrei, weil der `FluxInstance` (`flux-instance.yaml:19-22`)
`flux/clusters/fleet` **direkt aus dem GitRepository** synct und nicht aus dem
Artefakt: die `OCIRepository` verwaltet sich nicht selbst aus dem Satz, den sie
liefert. Der durch die Änderung ausgelöste Re-Render schreibt nur `:latest` neu,
worauf dann niemand mehr zeigt.

Der Tag schützt das Digest zugleich vor GHCR-Garbage-Collection — untagged
Manifeste sind heute GC-Kandidaten.

### 5. Verifikation

Der failing Test rendert offline mit Fixture-Digests und prüft das **Ergebnis**,
nicht die Quelle (Test-Resultats-Konvention T002448-M4):

1. Kein beweglicher Tag für `ghcr.io/paddione/website` oder `workspace-brett` in
   `out/{mentolder,korczewski,website-mentolder,website-korczewski}`.
2. `@sha256:` für beide Images vorhanden. Das ist der Positiv-Anker nach
   T002356-M1: ohne ihn bestünde die Negativ-Aussage aus (1) vakuos, sobald die
   Kandidatenliste leer ist.
3. Der Brett-Digest kommt im gerenderten Manifest an — der Guard gegen genau die
   tote Verkabelung aus D3.

Vor dem Fix ist mindestens Zusicherung (3) rot, weil `workspace-brett:latest`
gerendert wird.

Testdatei nach der Verzeichniskonvention (T002416): eigene Datei unter
`tests/spec/<spec-slug>/`, nicht an eine Sammeldatei angehängt. Lokal beide Formen
prüfen (T002696): `tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>*`.

## Risiken

- **Merge-Konflikt mit `chore/taskfiles-dir-T002700`.** Dieser Branch schneidet
  `Taskfile.yml` parallel neu. `flux:render` und der `:=latest`-Default bleiben dort
  in `Taskfile.yml` bei unveränderter Zeile 3978 — das Risiko ist gering, aber real
  und lokal auflösbar.
- **Alternder Offline-Fallback.** Der committete Digest in `environments/fleet-*.yaml`
  wird nicht automatisch aktualisiert. Er ist bewusst nur Offline-Pfad; in CI führt
  ein fehlgeschlagener Lookup zum Abbruch (§3), nie zum stillen Griff auf den alten
  Wert. Wird der Fallback in einem break-glass-Deploy verwendet, liefert er ein
  reproduzierbares, aber möglicherweise altes Image — das ist die korrekte Semantik
  für einen Notfallpfad und muss im Runbook stehen.
- **`crane` als neue CI-Abhängigkeit.** Weder `crane` noch `skopeo` sind lokal
  installiert. Der Render-Job installiert bereits `kustomize` und die `flux`-CLI per
  curl; `crane` kommt auf demselben Weg dazu. Der lokale Pfad braucht es nicht, weil
  er den Offline-Fallback nutzt.
