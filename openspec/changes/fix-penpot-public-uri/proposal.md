# Proposal: fix-penpot-public-uri

## Why

**Symptom (beobachtet, reproduzierbar).** Der Prod-Render beider Brands emittiert für
beide Penpot-Container `PENPOT_PUBLIC_URI: http://design.localhost` statt der
Brand-Domain. Penpot verwendet diese Variable für generierte Links, CORS-Prüfungen und
OIDC-Redirects — in Prod zeigen alle drei auf einen Host, den kein Client auflösen kann.

Reproduktion (Stand `7027f67f1`):

```bash
source scripts/env-resolve.sh mentolder >/dev/null 2>&1
kubectl kustomize prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone 2>/dev/null \
  | envsubst "$(sed -n '3340,3372p' Taskfile.yml | grep -o '\\\$[A-Z_]*' | tr -d '\\' | tr '\n' ' ')" \
  | grep -n -B 1 "http://design.localhost"
# 86958-        - name: PENPOT_PUBLIC_URI
# 86959:          value: http://design.localhost
# 86996-        - name: PENPOT_PUBLIC_URI
# 86997:          value: http://design.localhost
```

**Ursache (verifiziert, nicht angenommen).** In `k3d/penpot.yaml:124` und `:162` steht der
Wert als Literal statt als envsubst-Platzhalter, und kein Prod-Overlay überschreibt ihn.
Das S3-Gate schlägt nicht an, weil es ausschließlich `*.mentolder.de` / `*.korczewski.de`
erkennt und `.localhost` ignoriert — der Defekt konnte deshalb mit T016593 unbemerkt nach
`main` gelangen.

## What

Behebung nach der bestehenden Repo-Konvention für die **Selbstauskunft eines Dienstes über
seine eigene öffentliche URL**. Vorbild ist `POCKET_ID_FRONTEND_URL` → `APP_URL` in
`k3d/pocket-id.yaml:259`: eine Env-Registry-Variable mit Dev-Default, per envsubst in das
k3d-Basismanifest eingesetzt.

Abzugrenzen von den sieben `*_EXTERNAL_URL`-Variablen — die sind `required: false` und
werden ausschließlich von `k3d/website.yaml` für Verlinkungen konsumiert, beschreiben also
nicht die Selbstauskunft eines Dienstes.

- `environments/schema.yaml`: `PENPOT_PUBLIC_URI`, `required: true`,
  `default_dev: "http://design.localhost"`.
- `environments/{dev,mentolder,korczewski,fleet-mentolder,fleet-korczewski,staging}.yaml`:
  brandspezifische Werte (`https://design.<brand>`).
- `k3d/penpot.yaml`: beide Vorkommen auf `"${PENPOT_PUBLIC_URI}"`.
- `Taskfile.yml`: Aufnahme in **beide** `ENVSUBST_VARS`-Listen (`workspace:deploy` und
  `flux:render`). Ohne diesen Schritt ersetzt der Fix die falsche URL durch einen literalen
  `${PENPOT_PUBLIC_URI}`-Platzhalter — schlimmer als der Ausgangszustand. Der Guard in
  `tests/spec/fleet-operations/penpot-manifests.bats` sichert genau das ab.

Zusätzlich wird eine durch T016593 entstandene Falschaussage im noch nicht archivierten
Delta-Spec `add-penpot-service` korrigiert: dort verweist ein Szenario auf einen
`domains-patch.yaml`, der im Zuge des S3-Gates entfernt wurde. Die Korrektur erfolgt
**direkt in jenem Delta**, nicht als `MODIFIED`-Delta von hier aus — eine Requirement, die
noch nicht im SSOT-Spec steht, lässt sich nicht modifizieren, und zwei konkurrierende
Deltas auf dieselbe Sektion würden die Archivierung von der Reihenfolge abhängig machen.

## Non-Goals

- **`PENPOT_OIDC_AUTH_SERVER_URL`** (`k3d/penpot.yaml:113`) bleibt auf der cluster-internen
  Service-URL `http://pocket-id:1411`. Ob Penpot daraus den Browser-Redirect ableitet
  (der dann unerreichbar wäre) oder den öffentlichen Issuer aus dem Discovery-Dokument
  zieht, ist offen — dafür liegt **kein Beleg** vor, nur ein Verdacht. Wird als eigenes
  Ticket verfolgt, statt hier ungeprüft mitgeändert zu werden.
- Keine Änderung an `PENPOT_DOMAIN`, am Ingress oder am OIDC-Client-Seed — diese leiten
  ihre Werte bereits korrekt aus `PROD_DOMAIN` bzw. `POCKET_ID_FRONTEND_URL` ab.

_Ticket: T900002_
