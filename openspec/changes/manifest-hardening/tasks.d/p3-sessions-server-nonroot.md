---
title: "p3-sessions-server-nonroot"
ticket_id: T014553
domains: [infra, security]
status: active
---

# Partial p3 — Sessions-Server auf Unprivileged-Nginx (GR-06)

Implementiert den sessions-server-Teil von GR-06 aus
`openspec/changes/manifest-hardening/proposal.md`. Delta-Spec:
`specs/sessions-server.md`.

Ist-Zustand (`k3d/sessions-server.yaml`, 97 Zeilen, enthält ConfigMap + Deployment +
Service in einer Datei): nginx lauscht auf 80, Probes per tcpSocket 80, Service
`port: 80 → targetPort: 80`, Container-securityContext hat nur
`allowPrivilegeEscalation: false`. Dateien werden zur Laufzeit per `kubectl cp`
nach `/srv/sessions/<slug>/` kopiert — das emptyDir muss dafür group-writable
werden, sonst bricht der Copy-Pfad als non-root.

### Task 1: ConfigMap auf Port 8080 + /tmp-Pfade umstellen

**Files:** `k3d/sessions-server.yaml`

In der ConfigMap `sessions-server-nginx`:

1. Zusätzlichen Key `nginx.conf` mit der vollständigen Main-Konfiguration anlegen
   (das Image-Default unter `/etc/nginx/nginx.conf` schreibt pid/temp nach
   root-owned Pfade und ist für non-root unbrauchbar):

```nginx
worker_processes  1;
pid               /tmp/nginx.pid;
error_log         /dev/stderr notice;
events { worker_connections  1024; }
http {
    include        /etc/nginx/mime.types;
    default_type   application/octet-stream;
    access_log     /dev/stdout;
    client_body_temp_path  /tmp/client_temp;
    proxy_temp_path        /tmp/proxy_temp;
    fastcgi_temp_path      /tmp/fastcgi_temp;
    uwsgi_temp_path        /tmp/uwsgi_temp;
    scgi_temp_path         /tmp/scgi_temp;
    include /etc/nginx/conf.d/*.conf;
}
```

2. Beide Server-Blöcke in `default.conf`: `listen 8080;` bzw.
   `listen 8080 default_server;`. Sonstiger Blockinhalt unverändert.

### Task 2: Deployment auf non-root umbauen

**Files:** `k3d/sessions-server.yaml`

Am Pod-Spec (neu, Pod-Ebene — macht die emptyDirs group-writable für `kubectl cp`
als uid 101):

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        runAsGroup: 101
        fsGroup: 101
        seccompProfile:
          type: RuntimeDefault
```

Am Container `nginx`:

1. `containerPort: 80` → `containerPort: 8080`; beide Probes
   (`readinessProbe`/`livenessProbe`) `tcpSocket.port: 80` → `8080`.
2. Container-securityContext ergänzen:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
```

3. Main-Config via subPath mounten (überschreibt das Image-Default) und
   beschreibbares `/tmp` bereitstellen:

```yaml
            - name: nginx-main-conf
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
              readOnly: true
            - name: tmp
              mountPath: /tmp
```

Volumes ergänzen:

```yaml
        - name: nginx-main-conf
          configMap:
            name: sessions-server-nginx
            items:
              - key: nginx.conf
                path: nginx.conf
        - name: tmp
          emptyDir: {}
```

Bestehende Mounts (`nginx-conf` → `/etc/nginx/conf.d`, `sessions` →
`/srv/sessions`) und das Resources-Budget bleiben unverändert. Kein Image-Wechsel —
der Digest-Pin `nginx:1.31-alpine@sha256:4a73…` bleibt.

### Task 3: Service-targetPort anpassen

**Files:** `k3d/sessions-server.yaml`

Im Service `sessions-server`: `targetPort: 80` → `targetPort: 8080`.
`port: 80` bleibt — Ingress/Traefik-Zugriff ändert sich nicht.

## Verify

```bash
task workspace:validate
```
