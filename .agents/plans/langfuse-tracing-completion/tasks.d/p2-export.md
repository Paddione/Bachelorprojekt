# p2 — Täglicher JSONL-Export nach MinIO

Target files: `scripts/langfuse/export_traces.py` (neu),
`dev-local/components/langfuse/export/cronjob.yaml` (neu),
`dev-local/components/langfuse/kustomization.yaml`.
Design: `design.md` D3, R2. S1: `.py`-Limit 800, Ziel unter 150 Zeilen.

### Task 1: `export_traces.py` (nur Python-Stdlib)

Kopfkommentar: Zweck, Aufruf, Exit-Codes (0 ok, 1 API/S3-Fehler, 2 Konfig fehlt), `[T900750]`.

Konfiguration nur aus Env:

| Env | Bedeutung |
|---|---|
| `LANGFUSE_BASE_URL` | z. B. `http://langfuse-web:3000` |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Basic-Auth |
| `S3_ENDPOINT` | `http://langfuse-minio:9000` |
| `S3_BUCKET` | `langfuse` |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO-Credentials |
| `S3_REGION` | Default `us-east-1` |

CLI (`argparse`):
- `--date YYYY-MM-DD` (Default: gestern UTC).
- `--print-key`: gibt nur `exports/observations/<date>.jsonl` aus, Exit 0, kein Netzwerk, keine Env nötig.

Ablauf:
1. Fehlt eine Pflicht-Env (außer bei `--print-key`): Meldung auf stderr, Exit 2.
2. Paginieren über `GET {LANGFUSE_BASE_URL}/api/public/v2/observations` mit Query
   `limit=100`, `fields=core,basic,io,metadata,usage,model`,
   `fromStartTime=<date>T00:00:00Z`, `toStartTime=<date+1>T00:00:00Z`, ab Seite 2 zusätzlich
   `cursor=<meta.cursor>`. Ende, wenn `meta.cursor` fehlt oder `data` leer ist.
   Antwortform (verifiziert 2026-09-28): `{"data": [...], "meta": {"cursor": "..."}}`.
3. Jede Observation als eine Zeile `json.dumps(obs, ensure_ascii=False)` in einen Bytes-Puffer.
4. Puffer per `PUT {S3_ENDPOINT}/{S3_BUCKET}/exports/observations/<date>.jsonl` (Path-Style) hochladen,
   AWS SigV4 selbst signiert:

```python
def _sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()

def s3_put(endpoint, bucket, key, body, access, secret, region):
    host = urllib.parse.urlparse(endpoint).netloc
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, date_stamp = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body).hexdigest()
    path = f"/{bucket}/{urllib.parse.quote(key)}"
    canonical = "\n".join(["PUT", path, "", f"host:{host}", f"x-amz-content-sha256:{payload_hash}",
                           f"x-amz-date:{amz_date}", "", "host;x-amz-content-sha256;x-amz-date", payload_hash])
    scope = f"{date_stamp}/{region}/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = _sign(_sign(_sign(_sign(("AWS4" + secret).encode(), date_stamp), region), "s3"), "aws4_request")
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    auth = (f"AWS4-HMAC-SHA256 Credential={access}/{scope}, "
            "SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=" + sig)
    req = urllib.request.Request(endpoint + path, data=body, method="PUT", headers={
        "x-amz-date": amz_date, "x-amz-content-sha256": payload_hash, "Authorization": auth})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status
```

5. stdout: eine Zeile `exported <n> observations to s3://<bucket>/<key>`. HTTP-Fehler → stderr, Exit 1.
   Keine Secrets auf stdout/stderr.

### Task 2: `cronjob.yaml`

```yaml
# Taeglicher JSONL-Export aller Langfuse-Observations nach MinIO [T900750] (design.md D3)
apiVersion: batch/v1
kind: CronJob
metadata:
  name: langfuse-export
  labels: {app: langfuse-export}
spec:
  schedule: "30 2 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        metadata:
          labels: {app: langfuse-export}
        spec:
          restartPolicy: OnFailure
          containers:
            - name: export
              image: python:3.13-alpine
              command: ["python3", "/app/export_traces.py"]
              env:
                - {name: LANGFUSE_BASE_URL, value: "http://langfuse-web:3000"}
                - name: LANGFUSE_PUBLIC_KEY
                  valueFrom: {secretKeyRef: {name: workspace-secrets, key: LANGFUSE_INIT_PROJECT_PUBLIC_KEY}}
                - name: LANGFUSE_SECRET_KEY
                  valueFrom: {secretKeyRef: {name: workspace-secrets, key: LANGFUSE_INIT_PROJECT_SECRET_KEY}}
                - {name: S3_ENDPOINT, value: "http://langfuse-minio:9000"}
                - {name: S3_BUCKET, value: "langfuse"}
                - {name: S3_ACCESS_KEY, value: "langfuse"}
                - name: S3_SECRET_KEY
                  valueFrom: {secretKeyRef: {name: workspace-secrets, key: LANGFUSE_S3_SECRET}}
              resources:
                requests: {cpu: 50m, memory: 128Mi}
                limits: {memory: 512Mi}
              volumeMounts:
                - {name: script, mountPath: /app}
          volumes:
            - name: script
              configMap: {name: langfuse-export-script}
```

### Task 3: `kustomization.yaml`

In `dev-local/components/langfuse/kustomization.yaml` unter `resources:` als letzte Zeile
`  - export/cronjob.yaml` ergänzen und am Dateiende anhängen:

```yaml
configMapGenerator:
  - name: langfuse-export-script
    files:
      - export_traces.py=../../../scripts/langfuse/export_traces.py
generatorOptions:
  disableNameSuffixHash: true
```

Muster wie `dev-local/components/nextcloud/kustomization.yaml` (Skript liegt unter `scripts/`,
fester ConfigMap-Name). Der CronJob liest das Skript bei jedem Lauf frisch, ein Hash-Suffix ist
nicht nötig.

### Prüfung

```bash
python3 scripts/langfuse/export_traces.py --print-key --date 2026-09-27
# erwartet: exports/observations/2026-09-27.jsonl
env -i PATH="$PATH" python3 scripts/langfuse/export_traces.py --date 2026-09-27; echo "rc=$?"
# erwartet: rc=2
bash scripts/devmesh/render-stack.sh core | yq ea -r 'select(.kind=="CronJob") | .metadata.name + " " + .spec.jobTemplate.spec.template.spec.volumes[0].configMap.name'
# erwartet: langfuse-export langfuse-export-script
```
