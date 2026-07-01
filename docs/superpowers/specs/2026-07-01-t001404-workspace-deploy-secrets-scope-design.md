---
ticket_id: T001404
plan_ref: openspec/changes/t001404-workspace-deploy-secrets-scope/tasks.md
status: active
date: 2026-07-01
---

# T001404 — workspace:deploy appliziert SealedSecret-Datei brand-übergreifend ungescoped

## Root Cause (aus Ticket-Body, reproduziert)

`Taskfile.yml:2565` (Prod-Zweig von `workspace:deploy`) wendet die
**vollständige** `environments/sealed-secrets/<ENV>.yaml`-Datei mit
`kubectl apply -f` an, ohne nach Namespace oder Owner-Brand zu filtern. Die Datei
enthält **mehrere** SealedSecret-Dokumente — eines pro `(namespace, secret)`-Paar,
das in `environments/schema.yaml` unter `secrets[*].extra_namespaces` deklariert
ist. Drei dieser Paare zeigen auf geteilte Namespaces:

| Schema-Entry | Namespace | Secret | Owner |
|---|---|---|---|
| `SIGNALING_SECRET` (Z. 561-567) | `coturn` | `coturn-secrets` | shared (CoTURN+Janus) |
| `TURN_SECRET` (Z. 569-575) | `coturn` | `coturn-secrets` | shared (CoTURN+Janus) |
| `RUSTDESK_ID_ED25519` (Z. 577-582) | `rustdesk` | `rustdesk-secrets` | shared (hbbs/hbbr) |
| `RUSTDESK_ID_ED25519_PUB` (Z. 584-589) | `rustdesk` | `rustdesk-secrets` | shared (hbbs/hbbr) |
| `CRON_SECRET` (Z. 591-597) | `website` → `${WEBSITE_NS}` | `website-secrets` | brand-owned (per-namespace) |

Konsequenz: `task workspace:deploy ENV=korczewski` schreibt die
`rustdesk/rustdesk-secrets`-SealedSecret des korczewski-env-files in den
**gemeinsamen** `rustdesk`-Namespace, überschreibt mentolders
frisch generiertes `RUSTDESK_ID_ED25519`-Schlüsselpaar. Bei einem künftigen
Pod-Neustart liest hbbs das falsche Schlüsselpaar → Auth-Bruch für mentolders
rustdesk-Clients.

Dasselbe Risiko besteht für `TURN_SECRET` (CoTURN) und `SIGNALING_SECRET`:
`Taskfile.yml:1689-1710` (`workspace:office:deploy`) verbietet explizit
per-Brand-Deploys und verweist auf `task fleet:shared-services` — der
coturn/janus-Stack wird **einmal** für beide Brands deployed. Daher: alle
coturn-Werte müssen brand-übergreifend identisch sein und dürfen nur von
einer Brand deployt werden.

## Was korrigiert wird

### 1. `owner_brand` in `environments/schema.yaml` pro extra_namespaces-Eintrag

Shared-Entries erhalten ein neues optionales Feld `owner_brand: [<brand>, ...]`.
Eine `owner_brand`-Liste mit nur `mentolder` bedeutet: nur die mentolder-env-Datei
darf diesen Eintrag in den SealedSecret-Output schreiben; korczewski überspringt
ihn. Default-Verhalten (kein Feld gesetzt) bleibt rückwärtskompatibel: alle
Brands dürfen sealen (bisheriges Verhalten).

Betroffene Einträge:

- `SIGNALING_SECRET` → `owner_brand: [mentolder]`
- `TURN_SECRET` → `owner_brand: [mentolder]`
- `RUSTDESK_ID_ED25519` → `owner_brand: [mentolder]`
- `RUSTDESK_ID_ED25519_PUB` → `owner_brand: [mentolder]`
- `CRON_SECRET` → unverändert (Namespace `website` ist bereits pro-Brand
  unterschiedlich via `${WEBSITE_NS}`-Substitution in
  `scripts/lib/seal-extra-namespaces.sh:36`)

### 2. `scripts/env-seal.sh` + `scripts/lib/seal-extra-namespaces.sh`

`parse_extra_namespace_entries` emittiert zusätzlich das `owner_brand`-Feld pro
Entry. `seal_extra_namespace_secrets` filtert beim Loop über die `(ns, secret)`-
Paare: ist `ENV_NAME` nicht in `owner_brand` enthalten, wird das Paar mit einer
INFO-Meldung übersprungen. Die INFO-Meldung nennt den `ENV_NAME`, den
betroffenen Namespace und die Liste der erlaubten Brands, damit der Operator
versteht, warum das SealedSecret-Dokument fehlt.

### 3. `Taskfile.yml` (Defense-in-Depth)

Im Prod-Zweig von `workspace:deploy` wird die applizierte SealedSecret-Datei
nach dem env-seal-Schritt zusätzlich durch `yq`-Filter geschickt: alle
SealedSecret-Dokumente, deren `metadata.namespace` zu einem shared Namespace
gehört UND deren `metadata.annotations["secrets.bachelorprojekt/owner-brand"]`
nicht den aktuellen ENV enthält, werden vor dem `kubectl apply` entfernt.
Der Owner-Brand wird beim Sealen als Annotation in den
SealedSecret-`metadata` geschrieben (Schritt 2 erweitert).

Diese Schicht ist defense-in-depth: Schritt 1+2 (schema+env-seal) ist die
eigentliche Korrektur; Schritt 3 fängt ab, falls ein Operator
`environments/sealed-secrets/<env>.yaml` manuell editiert oder einen
legacy-only-Block stehen lässt.

### 4. BATS-Failing-Test (rot → grün)

Neue Datei `tests/spec/workspace-deploy-secrets-scope.bats`:

1. **Statischer Schema-Check:** jedes extra_namespaces-Entry mit
   `namespace in [rustdesk, coturn]` MUSS `owner_brand` mit ≥1 Brand haben.
   Aktuell rot, weil `owner_brand` fehlt.
2. **Env-Seal-Filter:** mit kubeseal-Stub und Fixture-Schema/-secrets:
   - `bash env-seal.sh --env mentolder` (Fixture: `owner_brand: [mentolder]`)
     erzeugt SealedSecret-Dokument für `rustdesk/rustdesk-secrets` → PASS
   - `bash env-seal.sh --env korczewski` (selbes Schema) erzeugt KEIN
     SealedSecret-Dokument für `rustdesk/rustdesk-secrets` → PASS
   - Aktuell (ohne Filter) erzeugt korczewski das Dokument → FAIL (Bug)
3. **Annotation gesetzt:** beide ENV-Läufe erzeugen SealedSecret-Dokumente mit
   `metadata.annotations["secrets.bachelorprojekt/owner-brand"]: mentolder`
   für die shared-Entries.

### 5. Verifikations- und Operations-Hinweise (post-merge Follow-up)

Der Merge dieser Änderung allein reicht nicht — der cluster-seitige
`rustdesk/rustdesk-secrets` und `coturn/coturn-secrets` wurden in der
Vergangenheit durch wiederholte `workspace:deploy ENV=korczewski`-Läufe
möglicherweise bereits mit falschen Werten überschrieben. Post-merge:

- `task env:seal ENV=mentolder && task workspace:deploy ENV=mentolder`
  resettet den cluster-State auf mentolder's Schlüsselpaar (das ist
  per `owner_brand: [mentolder]` die einzige Quelle der Wahrheit für diese
  Secrets).
- `task env:seal ENV=korczewski` (allein) schreibt ab dann keine
  rustdesk/coturn-Dokumente mehr → idempotent zu mentolders Werten.
- `coturn` ist tatsächlich geteilt (verifiziert via `Taskfile.yml:2394-2404`
  `fleet:shared-services`-Definition + expliziter Hard-Abort in
  `workspace:office:deploy` Z. 1697-1710). Derselbe Fix deckt beide
  Fälle ab.

## Out of scope

- Migration der `sealed-secrets/{mentolder,korczewski}.yaml`-Legacy-Files auf
  die `fleet-mentolder.yaml`/`fleet-korczewski.yaml`-Topologie (separate SSOT
  `secrets-deploy-automation.md`).
- Rotation der bereits überschriebenen Live-Keypairs (post-merge operational
  via `task workspace:deploy ENV=mentolder`).
- Atomarer "seal-and-deploy"-Task (offen in `secret-rotation`-Spec).
- Refactoring der `extra_namespaces`-Struktur zu pro-Brand-Entries
  (würde SealedSecret-Docs multiplizieren; nicht die Root-Cause).

## Verwandt

- `openspec/specs/workspace-deploy.md` — SSOT für `workspace:deploy`-Semantik
  (Delta wird in `openspec/changes/t001404-workspace-deploy-secrets-scope/specs/workspace-deploy.md` angewendet)
- `openspec/specs/secrets-deploy-automation.md` — Fleet-vs-Legacy-Topologie
- `openspec/specs/fleet-operations.md` — Fleet-Cluster-Orchestrierung
- `openspec/specs/secret-rotation.md` — Rotation von SealedSecrets
- `tests/spec/sealed-secret-cluster-drift.bats` (T001182/T001198) — bestehender
  Drift-Guard, muss grün bleiben
- `tests/spec/env-seal-empty-value-keys.bats` (T001198) — bestehender
  Empty-Value-Guard, muss grün bleiben
