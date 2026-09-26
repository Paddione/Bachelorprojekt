---
title: "p2-clusterjob — CI-Trigger plus In-Cluster-Embed-Job"
ticket_id: T900449
domains: [ci, embeddings]
status: active
---

# p2-clusterjob — CI-Trigger plus In-Cluster-Embed-Job

Target Files dieses Partials (disjunkt, keine weitere Datei wird hier geändert):
`.github/workflows/k1-embed.yml`, `k3d/k1-embed-job.yaml`.

Delta-Bezug: `specs/openspec-embedding.md` des Changes (ADDED
Merge-triggered in-cluster embeds: Trigger pro Merge nach `main` plus
`workflow_dispatch`-Voll-Lauf, inkrementell per Diff, Voll-Modus bei leerer
Diff, resumable, sichtbarer Fehler mit Merge-SHA im Log, kein CI-lokales
Embedden, keine DB-Credentials auf Runnern jenseits des Triggers).
Abgrenzung: p1 liefert die aufgerufenen CLI-Flags (`--path`, `--source`,
`--all-specs`, `--all-docs`, `--migrate-changes` in
`scripts/openspec-embed.mjs`; `--file` in `scripts/index-repo.ts` bleibt wie
bestehend). Workflow- und Job-Logik liegen hier, BATS-Fälle bei p-tests.
Außer Scope: `k3d/kustomization.yaml` (One-Shot-Job, kein langlebiges
Objekt — S4-Nachweis ist die Workflow-Referenz per `kubectl apply -f`,
Muster `docs:deploy` in `Taskfile.yml`), Dockerfiles, Secrets-Manifeste.

## Budgets (B1a, gemessen 2026-09-26)

Messbefehle: `ls` (beide Ziele existieren nicht), `yq '.s1.limits'`
auf `docs/code-quality/gates.yaml` (kein `.yml`/`.yaml`-Eintrag — Endung
ist S1-ungated), `jq -r '."S1:<pfad>".metric // "nicht-baselined"'` auf
`docs/code-quality/baseline.json` (beide nicht-baselined),
`bash scripts/plan-lint.sh residual_budget <pfad>` (beide leer),
Intel-Subset `bash scripts/plan-intel-filter.sh k1-ci-embeds
.github/workflows/k1-embed.yml k3d/k1-embed-job.yaml`
(`loc` 0, `s1_limit` 0, `s1_baseline` null für beide).
`plan-lint` B1a prüft nur existierende Dateien mit gated Endung — hier
nicht anwendbar. Die Baseline wächst nicht (keine neue S1-Datei).

| Datei | Ist | Schwelle |
| `k3d/k1-embed-job.yaml` | 0 (neu) | — (S1-ungated), Zielgröße höchstens 160 Zeilen |
| `.github/workflows/k1-embed.yml` | 0 (neu) | — (S1-ungated), Zielgröße höchstens 150 Zeilen |

Zielgrößen sind Konvention mit Reserve (angelehnt an `post-merge.yml`
mit 183 und `nextcloud-notification-config-job.yaml` mit 120 Zeilen),
kein Gate. S4 gilt trotzdem: `k3d/k1-embed-job.yaml` wird vom Workflow
namentlich referenziert (`.github/workflows/*.yml` ist
`reference_sources` in `gates.yaml`).

## Task 1: R1 Image-Strategie vermessen und entscheiden

Der Job braucht Repo-Skripte plus Repo-Stand zum Merge-SHA, DB-Zugang und
den cluster-lokalen bge-Endpoint. Der Vorgänger
(`k3d/knowledge-ingest-cronjob.yaml`, Markdown-Zweig suspendiert) belegt:
Cluster-Pods haben keinen Repo-Zugang von sich aus — genau das klärt
dieser Task per Messung statt Annahme. Kandidat A: schlankes
`node:22-alpine` (Digest-gepinnt wie der Vorgänger) plus Init-Container
mit Shallow-Fetch des Merge-SHA plus `npm install` der Laufzeit-Deps.
Kandidat B: bestehendes Image erweitern — scheidet aus, sobald dafür eine
dritte Datei (Dockerfile) nötig wäre, denn die liegt außerhalb der
disjunkten Targets.

1. Externe Node-Deps der aufgerufenen Skripte bestimmen (alles außer
`node:`-Builtin und relativen Pfaden):
```bash
grep -hn "^import .* from\|require(" scripts/openspec-embed.mjs scripts/index-repo.ts scripts/lib/scs-chunking.ts | grep -v "node:" | grep -v "\./" | sort -u
```
Erwartet: kurze Liste (`pg`, ggf. weitere) — genau diese Liste installiert
der Init-Container per `npm install <liste> --no-package-lock --silent`
(Muster `npm-install` in `k3d/knowledge-ingest-cronjob.yaml`).
2. Node-Typstripping für beide Einstiege auf der Job-Laufzeit belegen
(lokal Node v22.23.3, Job-Image `node:22-alpine` — Major identisch):
```bash
node --input-type=module -e "import('./scripts/lib/scs-chunking.ts').then(() => console.log('strip-ts OK'))"
grep -nE '^[[:space:]]*enum[[:space:]]|^[[:space:]]*namespace[[:space:]]' scripts/index-repo.ts scripts/lib/scs-chunking.ts; echo "grep-exit=$?"
```
Erwartet: `strip-ts OK`, grep-exit 1 (keine nicht-löschbare Syntax).
Fällt der Import von `scripts/index-repo.ts` dennoch, installiert der
Init-Container zusätzlich `tsx` und der Entrypoint ruft
`npx tsx scripts/index-repo.ts` auf — diese Verzweigung steht so im
Manifest-Entrypoint, nicht als Annahme daneben.
3. Secret-Namen statisch eingrenzen, Cluster-Entscheid für Stufe 2/3
vormerken:
```bash
grep -rn "name: website-secrets" k3d/website.yaml | head -3
grep -rln "name: workspace-secrets" k3d/*.yaml | head -5
grep -rn "WEBSITE_DB_PASSWORD" k3d/website.yaml k3d/knowledge-ingest-cronjob.yaml | head -6
```
Erwartet: beide Secret-Namen belegt, Key `WEBSITE_DB_PASSWORD` in beiden
Mustern. Task 2 verwendet den in Task 4 Stufe 2/3 per
`kubectl -n workspace get secret` bestätigten Namen; Erwartung aus
`k3d/website.yaml` (primäre Referenz, Zeilen 265 bis 275) ist
`website-secrets`.
4. Token-Freiheit des bge-Pfads belegen:
```bash
grep -in "api.key\|token\|auth" k3d/llm-gpu.yaml
grep -n "llm-gateway-embed" scripts/openspec-embed.mjs scripts/index-repo.ts
```
Erwartet: im GPU-Manifest nur der Kommentar-Treffer über Antwort-Tokens
(kein Auth-Env, kein Token-Arg am `llama.cpp`-Container), beide Skripte
defaulten auf `http://llm-gateway-embed.workspace.svc.cluster.local:8081`.
Der Job setzt daher `LLM_ENABLED=true`, `LLM_EMBED_MODEL=bge-m3`,
`LLM_EMBED_URL` explizit auf den verifizierten Service-DNS und kein
Token-Env.
5. Repo-Egress und URL ohne Credentials belegen:
```bash
git remote get-url origin
git ls-remote "$(git remote get-url origin)" HEAD | head -2
yq eval '.spec.egress' k3d/network-policies.yaml | head -20
```
Erwartet: `ls-remote` liefert den HEAD-SHA ohne Auth (öffentlicher
Fetch), die Egress-Policies enthalten die Internet-Regel. Der Workflow
übergibt die URL per `git remote get-url origin`, der Init-Container
holt genau einen Commit (`git init`, `git fetch --depth 1 origin
$MERGE_SHA`, Checkout von `FETCH_HEAD`).
6. Entscheidung festschreiben: Kandidat A genau dann, wenn alle fünf
Messungen grün sind; sonst dokumentiert der Task, welche Messung rot ist
und welche Minimal-Alternative (Tarball per `wget` aus dem
`busybox`-Userspace von `node:22-alpine` statt `alpine/git`-Init-Container)
gilt. Build-Zeit von A ist null (kein Image-Build, nur Pinned-Pull).

Akzeptanz: alle sechs Befehlsblöcke gelaufen, Ausgaben im Task-Protokoll
des Implementierers, Secret-Name- und `tsx`-Verzweigung entschieden.

## Task 2: k3d/k1-embed-job.yaml schreiben

Ein-Dokument-Job (`batch/v1`, `kind: Job`), per `sed` mit `JOB_ID`,
`MERGE_SHA`, `FULL`, `REPO_URL` instanziiert und per
`kubectl apply -f -` aus dem Workflow erzeugt (Muster `docs:deploy`:
`kubectl apply -f k3d/docs.yaml --server-side --force-conflicts`).

1. Metadaten: `name: k1-embed-$JOB_ID` (`JOB_ID` = `<shortsha>-<runid>`,
stets unter 30 Zeichen, kleingeschrieben alphanumerisch plus `-`),
`namespace: workspace` (dort liegen `shared-db`, `llm-gateway-embed`
und die Wissens-Tabellen; brandunabhängiger Inhalt, keine
Brand-Domain-Literale — S3), Labels `app: k1-embed`.
2. Laufzeitgrenzen (R2): `ttlSecondsAfterFinished: 3600`,
`backoffLimit: 3`, `activeDeadlineSeconds: 5400` (90 Minuten, identisch
zum Workflow-Wait in Task 3), `restartPolicy: OnFailure`.
`automountServiceAccountToken: false` — der Job spricht nur DB und
bge-Service, braucht keine K8s-API: keine `Role`, keine `ClusterRole`,
kein `ServiceAccount`-Objekt (RBAC-minimal heißt hier: keine
RBAC-Objekte, nicht einmal namespaced).
3. Härtung nach `nextcloud-notification-config-job.yaml`-Muster:
Pod-`securityContext` (`runAsNonRoot`, `runAsUser: 65534`,
`seccompProfile: RuntimeDefault`), Container-`securityContext`
(`allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`,
`capabilities.drop: [ALL]`), schreibbare `emptyDir`-Mounts für
`/repo`, `/tmp` und den npm-Cache. Image
`node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2`
(Digest aus `k3d/knowledge-ingest-cronjob.yaml`),
`imagePullPolicy: IfNotPresent`. Init-Container `alpine/git` mit per
`docker buildx imagetools inspect` aufgelöstem und gepinntem Digest
für den Shallow-Fetch aus Task 1 Schritt 5; alternativ der dort
entschiedene `wget`-Pfad ohne zweiten Image-Pull.
4. Env (Secret-Anbindung nach `k3d/website.yaml`-Muster mit
`$(VAR)`-Expansion und literalem Namespace — S3-sauber, da SVC-DNS):
`WEBSITE_DB_PASSWORD` aus `secretKeyRef` (Name aus Task 1 Schritt 3),
`SESSIONS_DATABASE_URL` =
`postgresql://website:$(WEBSITE_DB_PASSWORD)@shared-db.workspace.svc.cluster.local:5432/website`,
`PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` in derselben
Zusammensetzung für `scripts/index-repo.ts`, `LLM_ENABLED=true`,
`LLM_EMBED_MODEL=bge-m3`, `LLM_EMBED_URL` auf den verifizierten
Service-DNS (kein Token-Env, Task 1 Schritt 4), dazu `MERGE_SHA`,
`FULL`, `JOB_ID`. ConfigMap-Volume `k1-embed-diff-$JOB_ID`
(Datei `diff.txt`, Mount `/diff`, `readOnly: true`).
5. Entrypoint `sh -c` mit `set -eu` (kein `pipefail` — `busybox ash`
kennt es nicht): erste Zeile loggt
`k1-embed start merge=$MERGE_SHA full=$FULL`, jeder Abbruch endet mit
`k1-embed FAILED merge=$MERGE_SHA` (Delta: sichtbarer Fehler mit SHA).
Verzweigung: `FULL=1` oder leere `/diff/diff.txt` führt den Voll-Lauf
(`--all-specs`, `--all-docs`, `--migrate-changes`, danach
`scripts/index-repo.ts` ohne `--file`); sonst pro Diff-Zeile
`openspec/specs/*.md` → `--path <f> --source specs_ssot`,
`docs/adr/*.md` und `docs/runbooks/*.md` → `--path <f> --source docs`,
Code-Endungen → `--file <f>`; fällt die Feinfilterung leer aus, loggt
der Job `keine indexierten Pfade` und endet mit Exit 0 statt eines
sinnlosen Voll-Laufs. Resumable per `file_hash`-Skip beider Skripte
(p1) plus Retry über `backoffLimit`.
6. Ressourcen nach `knowledge-reindex-all`-Muster (`requests: cpu 100m,
memory 256Mi`, `limits: memory 1Gi`) — Rechenlast trägt der
bge-Server, der Job ist IO-gebunden.

Akzeptanz:

```bash
yq eval '.' k3d/k1-embed-job.yaml > /dev/null && echo "yaml OK"
grep -c "restartPolicy: OnFailure" k3d/k1-embed-job.yaml
grep -c "ttlSecondsAfterFinished: 3600" k3d/k1-embed-job.yaml
grep -c "activeDeadlineSeconds: 5400" k3d/k1-embed-job.yaml
grep -c "automountServiceAccountToken: false" k3d/k1-embed-job.yaml
grep -c "node:22-alpine@sha256:" k3d/k1-embed-job.yaml
grep -rn "mentolder\.de\|korczewski\.de" k3d/k1-embed-job.yaml; echo "s3-exit=$?"
wc -l k3d/k1-embed-job.yaml
```

Erwartet: `yaml OK`, jeder Zähler mindestens 1, `s3-exit=1` (kein
Treffer), höchstens 160 Zeilen.

## Task 3: .github/workflows/k1-embed.yml schreiben

Zwei Jobs: Diff-Bestimmung (dünner Runner, nur `git`) und Trigger
(`FLEET_KUBECONFIG` plus `kubectl`, kein Node, kein `npm`, keine
DB-Credentials — Delta: Runner betten nie lokal ein und halten außer
dem Trigger keine Secrets).

1. Kopf: `push: branches: [main]` mit `paths:`-Filter
(`**.ts`, `**.mts`, `**.mjs`, `**.js`, `**.cjs`, `**.py`, `**.svelte`,
`**.astro`, `**.md`, dazu `.github/workflows/k1-embed.yml` und
`k3d/k1-embed-job.yaml` selbst) plus `workflow_dispatch` mit
Boolean-Input `full` (Default `true`). `concurrency:
group: k1-embed-${{ github.ref }}`, `cancel-in-progress: false`
(`post-merge.yml`-Muster: Läufe serialisieren, nie abbrechen).
`permissions: contents: read`. `OPENSPEC_TELEMETRY: '0'` wie alle
Workflows.
2. Job `diff`: `actions/checkout@v7` mit `fetch-depth: 2`
(`post-merge.yml`-Muster), auf `workflow_dispatch` übersprungen
(leere Ausgabe). Sonst `git diff --name-only HEAD~1..HEAD --` mit
denselben Mustern wie der `paths:`-Filter
(`changed-manifests.sh`-Muster mit Dateifilter statt Verzeichnisliste),
Ausgabe als multiline `files` nach `$GITHUB_OUTPUT`; über 200 Zeilen
wird die Ausgabe geleert und `full=true` gesetzt (Voll-Modus-Schwelle).
Abgleich gegen den realen Index-Filter von `scripts/index-repo.ts`
gehört zur Implementierung (`grep -n "ext\|glob\|filter"
scripts/index-repo.ts`), Abweichungen werden in Filter plus Entrypoint
identisch nachgezogen.
3. Job `trigger` (`needs: [diff]`, `timeout-minutes: 100`): `kubectl`
v1.31.0 per `curl` installieren (`post-merge.yml`-Muster),
`FLEET_KUBECONFIG` per `base64 -d` nach `~/.kube/config` (`umask 077`,
`chmod 600`, `build-docs.yml`-Muster). `JOB_ID` aus Short-SHA plus
`github.run_id` bauen, Diff nach `/tmp/k1-diff.txt` schreiben,
`kubectl create configmap k1-embed-diff-$JOB_ID
--from-file=diff.txt=/tmp/k1-diff.txt -n workspace`,
Manifest per `sed` instanziieren (`$JOB_ID`, `$MERGE_SHA`, `$FULL`,
`$REPO_URL` aus `git remote get-url origin`), `kubectl apply -f -`,
dann `kubectl wait --for=condition=complete job/k1-embed-$JOB_ID
-n workspace --timeout=5400s`. Cleanup der ConfigMap im
`always()`-Schritt. Timeout heißt sichtbares Rot bei fortlaufendem,
resumablem Job — dokumentiert in der Workflow-`summary` zusammen mit
Job-Name und Merge-SHA.

Akzeptanz:

```bash
yq eval '.' .github/workflows/k1-embed.yml > /dev/null && echo "yaml OK"
grep -c "fetch-depth: 2" .github/workflows/k1-embed.yml
grep -c "FLEET_KUBECONFIG" .github/workflows/k1-embed.yml
grep -c "k3d/k1-embed-job.yaml" .github/workflows/k1-embed.yml
grep -rn "DATABASE_URL\|PGPASSWORD\|WEBSITE_DB" .github/workflows/k1-embed.yml; echo "db-exit=$?"
grep -rn "setup-node\|npm ci\|npm install" .github/workflows/k1-embed.yml; echo "local-exit=$?"
wc -l .github/workflows/k1-embed.yml
```

Erwartet: `yaml OK`, die ersten drei Zähler mindestens 1 (der dritte
ist der S4-Nachweis), `db-exit=1` und `local-exit=1` (keine Treffer:
keine DB-Credentials, kein lokales Embedden), höchstens 150 Zeilen.

## Task 4: Akzeptanzstufen, Trigger-Simulation, S3/S4-Nachweis

R4-Stufen: der Job selbst ist nur per Dry-Run plus Cluster-Lauf
testbar — die Stufen 0 und 1 laufen überall, 2 und 3 brauchen
`FLEET_KUBECONFIG`, 4 ist der Produktivlauf.

1. Stufe 0 (statisch, überall): Akzeptanzblöcke aus Task 2 und 3 grün,
plus Regressions-Build des unveränderten Kustomize-Bestands:
```bash
kustomize build k3d/ > /dev/null && echo "kustomize OK"
```
Erwartet: `kustomize OK` (das neue Manifest ist absichtlich nicht
eingetragen und bricht nichts).
2. Stufe 1 (Client-Dry-Run, kein Cluster): `sed`-Substitution mit
fiktiven Werten plus `kubectl apply --dry-run=client`:
```bash
export JOB_ID=abc1234-999 FULL=0 MERGE_SHA=abc1234def5678 REPO_URL=https://example.invalid/x.git
sed -e "s/\$JOB_ID/$JOB_ID/g" -e "s/\$MERGE_SHA/$MERGE_SHA/g" -e "s/\$FULL/$FULL/g" -e "s|\$REPO_URL|$REPO_URL|g" k3d/k1-embed-job.yaml | kubectl apply --dry-run=client -f - && echo "client-dry-run OK"
```
Erwartet: `client-dry-run OK` (Validierung des Schemas ohne Cluster).
3. Stufe 2 (Server-Dry-Run, Cluster nötig): derselbe `sed`-Strom mit
`--dry-run=server` gegen den Fleet-Kontext bestätigt API-Annahme,
Secret-Namen (Task 1 Schritt 3) und Quotas ohne einen Pod zu starten.
4. Stufe 3 (Cluster-Probelauf): ConfigMap mit genau einer
`openspec/specs`-Datei erzeugen, Job mit `FULL=0` applizieren,
`kubectl logs job/k1-embed-$JOB_ID -n workspace` lesen:
```bash
kubectl logs "job/k1-embed-$JOB_ID" -n workspace | grep -F "$MERGE_SHA"; echo "sha-exit=$?"
kubectl wait --for=condition=complete "job/k1-embed-$JOB_ID" -n workspace --timeout=600s && echo "probe OK"
```
Erwartet: `sha-exit=0` (SHA im Log), `probe OK`, danach Job plus
ConfigMap löschen.
5. Stufe 4 (Produktiv): Merge oder `workflow_dispatch` mit `full=true`
— erster Lauf Voll-Reindex (resumable), danach diff-inkrementell;
Workflow grün bedeutet eingebettet, Rot nennt Job-Namen und SHA.
6. Trigger-Simulation ohne Cluster (Diff-Pfad des Workflows lokal):
```bash
git diff --name-only HEAD~1..HEAD -- '**.ts' '**.mts' '**.mjs' '**.js' '**.cjs' '**.py' '**.svelte' '**.astro' '**.md' | head -20
```
Erwartet: Exit 0, Dateiliste des letzten Merges (leer genau dann, wenn
der Merge keine indexierten Pfade berührte — dann griffe `FULL=1`).
