---
title: "p6-readiness — nextcloud + llm-proxy Readiness (T900037)"
ticket_id: T900037
domains: [fleet-operations]
status: active
target_files: ["prod/patch-nextcloud.yaml", "k3d/nextcloud.yaml", "k3d/llm-proxy.yaml"]
---

# p6-readiness — nextcloud + llm-proxy Readiness (T900037)

## Goal

Zwei Dienste haben dauerhaft fehlschlagende Readiness-Probes. `nextcloud` (workspace-staging: 727
Restarts, HTTP 500 auf /status.php; workspace PROD: context deadline exceeded auf :80/status.php)
und `llm-proxy` (workspace-dev: 5170x connection refused auf :18235 — Prozess im Container lauscht
nicht auf :18235). Beide sollen gruenes Readiness erreichen oder kontrolliert abgebaut werden.

## Root-Cause / Befund

- `k3d/nextcloud.yaml` und `prod/patch-nextcloud.yaml` definieren readinessProbes auf `/status.php`
  port 80 mit `timeoutSeconds`/`failureThreshold`-Werten. Staging 500er → Nextcloud-App-Fehler
  (Logs auswerten); PROD timeout → Status.php-Antwortzeit > Probe-Timeout.
- `llm-proxy` in `workspace-dev`: Deployment-Referenz nicht im Hauptbaum gefunden ausser
  `environments/schema.yaml` (default_dev `dev-llm-proxy-admin-token-12345`) und docs
  (mcp.yaml Browser-Endpoint 127.0.0.1:18235). Der Container lauscht nicht auf :18235; zu klaeren,
  ob workspace-dev den llm-proxy noch braucht (sonst abbauen statt 5170 Fehlerevents).

## File Structure

```
prod/patch-nextcloud.yaml                # MODIFIED: Readiness-Probe-Werte an Messung angepasst
k3d/nextcloud.yaml                       # MODIFIED: Readiness-Probe-Werte (falls abweichend)
k3d/llm-proxy.yaml                       # MODIFIED oder REMOVED: workspace-dev llm-proxy (falls sich das Manifest unter diesem Pfad/deviert finde)
tests/spec/fleet-operations/readiness.bats  # NEW (in p7): Guard
```

## Tasks

1. **Investigate (nextcloud Staging):** `kubectl --context fleet -n workspace-staging logs
   nextcloud-... | tail` auf die 500er-Ursache auswerten (App-Excpetion, DB, OIDC). 727 Restarts sind
   kein Rauschen — Ursache im Staging-konkreten Config/Env suchen.
2. **Investigate (nextcloud PROD):** tatsaechliche Antwortzeit von /status.php messen
   (`curl -w %{time_total} http://<podIP>:80/status.php`), mit `timeoutSeconds` in
   `prod/patch-nextcloud.yaml` abgleichen. Falls Antwortzeit > Probe-Timeout, Probe-Werte
   (`timeoutSeconds`, `failureThreshold`) gegen die Messung anpassen.
3. **Fix (nextcloud):** je nach Befund die 500er-Ursache beheben oder die readinessProbe-Werte
   anpassen. Sicherstellen, dass `nextcloud` Ready meldet und die Restarts auf normal sinken.
4. **Investigate (llm-proxy):** klären, ob `workspace-dev` den llm-proxy noch braucht (docs, RUNME,
   opencode-tasks). Falls ja: Container-Kommando/Port so konfigurieren, dass er auf :18235 lauscht
   (livez gruen). Falls nein: llm-proxy aus `workspace-dev` abbauen (Manifest entfernen/entfernen,
   Flux prune) statt 5170 Fehlerevents zu erzeugen.
5. **Fix (llm-proxy):** umsetzen (lauschen ODER abbauen). Keine connection-refused-Events mehr.
6. **Verify:** nextcloud Ready in beiden Namespaces; llm-proxy Ready ODER absent in workspace-dev.

## Verify

Der BATS-Guard `readiness.bats` prueft die Probe-Konfiguration und Deckung:

```bash
# Requirement: Readiness-Probes von nextcloud und llm-proxy sind wieder grün
# expected: FAIL (vor dem Fix 'Unhealthy'/connection-refused-Events)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/readiness.bats
```

## Ausfuehrungsergebnis 2026-09-03: NICHT umgesetzt — kein Repo-Deliverable

Beide Annahmen des Partials sind gegen den Cluster gemessen worden; keine
haelt einer Manifest-Aenderung stand.

**nextcloud PROD — kein Probe-Timeout-Problem.** Der Plan wollte
`timeoutSeconds`/`failureThreshold` gegen die gemessene Antwortzeit anpassen.
Die Messung:

```bash
kubectl --context fleet -n workspace exec deploy/nextcloud -c nextcloud -- \
  sh -c 'for i in 1 2 3; do curl -s -o /dev/null -w "code=%{http_code} t=%{time_total}\n" http://127.0.0.1:80/status.php; done'
# code=200 t=0.014517 / code=200 t=0.016052 / code=200 t=0.015832
```

15 ms gegen ein Probe-Timeout von 1 s (Default, `k3d/nextcloud.yaml`
setzt keinen eigenen Wert). Das "context deadline exceeded" aus dem Audit war
transient waehrend eines Neustarts. Die Probe-Werte hochzusetzen waere ein Fix
fuer einen Defekt, den es nicht gibt.

**nextcloud Staging — App-Ebene, nicht Manifest-Ebene.**

```bash
kubectl --context fleet -n workspace-staging exec deploy/nextcloud -c nextcloud -- \
  curl -s -w '\ncode=%{http_code}\n' http://127.0.0.1:80/status.php
# code=500, leerer Body
```

Apache selbst laeuft sauber hoch (Log zeigt AH00094, normale Operation). Der
500er mit leerem Body ist ein PHP-/Config-Fehler der Staging-Instanz und
gehoert in eine `occ`-Diagnose, nicht in `k3d/nextcloud.yaml` oder
`prod/patch-nextcloud.yaml`.

**llm-proxy — verwaiste Cluster-Ressource ohne Manifest.** Das Deployment
laeuft in `workspace-dev` (0/1, 4d18h), hat aber in diesem Repo keine Quelle:

```bash
grep -rln 'llm-proxy' k3d/ prod*/ flux/
# k3d/docs-content-built/api-surface.html   (generiertes HTML)
# k3d/secrets.yaml                          (nur der Token-Key)
```

Kein Deployment-Manifest, also auch nichts, was Flux prunen koennte. Der Abbau
ist eine reine Cluster-Mutation (`kubectl delete deploy llm-proxy -n
workspace-dev`) und braucht die Zustimmung des Betreibers — dieser Plan-Partial
kann sie nicht liefern.

**Kein Guard-Test angelegt** (gleiche Begruendung wie p2).
