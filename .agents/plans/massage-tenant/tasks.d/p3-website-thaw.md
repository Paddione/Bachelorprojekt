---
title: "massage-tenant — Massage-Website gezielt auftauen"
ticket_id: T901440
domains: [website, infra, flux]
status: active
---
# massage-tenant — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `environments/korczewski.yaml` | 112 | n/a (YAML ohne S1-Limit) |
| `environments/fleet-korczewski.yaml` | 120 | n/a (YAML ohne S1-Limit) |
| `prod-fleet/website-korczewski/kustomization.yaml` | 50 | n/a (YAML ohne S1-Limit) |
| `prod-fleet/website-korczewski/website-patch.yaml` | 10 | n/a (YAML ohne S1-Limit) |
| `prod-fleet/website-korczewski/website-apex.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `flux/clusters/fleet/ks-website-korczewski.yaml` | 20 | n/a (YAML ohne S1-Limit) |
| `.github/workflows/build-website.yml` | 282 | n/a (YAML ohne S1-Limit) |

Dependencies p1 und p2. Keine Änderung in Website-TS/Lib/API; bestehende Massage-Funktionen
werden betrieben. YAML und Workflow unterliegen keinem S1-Extension-Limit.

## Task: Environment und Website-Secrets konsistent verbinden

1. In beiden korczewski-Environment-Dateien `BRAND_ID: massage` setzen (Basis generiert
   `BRAND` daraus); `BRAND_NAME` und `CONTACT_EMAIL` gemäß bestehender Massage-Brand-Konfiguration
   setzen, Kontaktadresse `massage@korczewski.de`. Vorhandene rechtliche/SMTP-Angaben nicht
   als Identität der Praxis übernehmen, sondern mit `components/website/src/config/brands/massage.ts`
   und `k3d/website-seller-config.yaml` abgleichen. Nicht bekannte Pflichtangaben im p4-Runbook
   als Operator-Datenpflege auflisten; keine erfundenen Angaben. `WORKSPACE_NAMESPACE`
   bleibt `workspace-korczewski`; `WEBSITE_NAMESPACE` bleibt `website-korczewski`.
2. `WEBSITE_DB_NAMESPACE: workspace`, `WEBSITE_DB_NAME: website_massage`,
   `WEBSITE_DB_USER: website_massage` setzen. `WEBSITE_IMAGE`, Domain, Auth-URL und Namespace
   weiterhin korczewski-Slot; kein Brand-Rename oder Aktivieren der Workspace-Dienste.
3. In Deployment-Patch Env `WEBSITE_DB_PASSWORD` auf Secret
   `website-secrets.WEBSITE_MASSAGE_DB_PASSWORD` umstellen. p1-Basisvariablen liefern Host,
   Benutzer und DB; auf bestehende TLS-Konfiguration der Website achten. Identisches
   Passwort gehört zusätzlich in mentolder workspace-secrets für zentralen Init-Job.
   p4 dokumentiert manuelles Erzeugen/Versiegeln vor Reconcile. Der Secret-Key darf nicht
   durch Klartext-env ersetzt werden.
4. Render prüfen: `website-config` enthält BRAND=massage; vorhandene Basis liefert ggf.
   kein explizites BRAND_ID im Pod. Im Deployment-Patch zusätzlich `BRAND_ID: massage`
   setzen, damit Guard/DB-Schreibpfade, die zuerst BRAND_ID lesen, eindeutig sind. Keine
   mentolder-Environment oder gemeinsame Brand-Defaults ändern.

## Task: Apex-Routing ohne eingefrorene Workspace-Backends

Mentolder-Vorbild ist `prod/ingress.yaml` Ressource `workspace-ingress-apex` mit
`redirect-apex-to-web` aus `prod/traefik-middlewares.yaml`; Website-Overlay enthält bislang
nur web-Host. Das Vorbild referenziert Workspace-Middleware und `old-webspace`, dessen
korczewski-Deployment eingefroren bleibt. Deshalb vorhandenes Muster lokal in Website
übernehmen, ohne Ressourcen aus voller prod-Basis einzubinden.

1. `website-apex.yaml` enthält Middleware `website-redirect-apex-to-web` mit permanentem
   redirectRegex zum HTTPS-Web-Host; Regex/Replacement aus bestehender Middleware
   übernehmen und ausschließlich `${PROD_DOMAIN}` nutzen. HTTPS-Redirect für HTTP lokal
   ergänzen, wenn bestehendes Website-Overlay keinen bereitstellt. Alle Middlewares im
   Website-Namespace, keine Cross-Namespace-Abhängigkeit.
2. Ingress `website-ingress-apex`: Host `${PROD_DOMAIN}`, TLS Secret `${TLS_SECRET_NAME}`,
   traefik ingressClass, Prefix `/`, Backend `website:80`. Annotation verwendet
   `${WEBSITE_NAMESPACE}-website-redirect-apex-to-web@kubernetescrd` plus gegebenenfalls
   lokale HTTPS-Middleware. Backend bleibt gültig, obwohl Redirect normalerweise vorher
   antwortet. Datei in Website-kustomization referenzieren (S4).
3. Keine zweite überlappende Apex-IngressRoute ergänzen. Vor Live-Aktivierung vorhandenes
   eingefrorenes `workspace-ingress-apex` inventarisieren: wenn es noch denselben Host
   bedient, nur diese alte Route kontrolliert entfernen oder gezielt deaktivieren und
   dokumentieren, ohne `flux-korczewski` aufzutauen. Reconcile-Suspension löscht alte
   Ressourcen nicht. HTTP/HTTPS und Pfad-/Query-Erhaltung des permanenten Redirects prüfen.

## Task: Flux-Thaw und imperativen Fallback korrigieren

1. `flux-website-korczewski` auf `suspend: false`; Dependency
   `flux-korczewski-auth` und `flux-sealed-secrets-korczewski` ergänzen, bestehende
   Controller-Dependency behalten. Website nicht von suspendiertem `flux-korczewski`
   abhängig machen. Auth hängt bereits an zentraler DB. `wait: true` für Website bleibt.
   Kommentare beschreiben ausschließlich Website-Thaw. Frozen Workspace/Jobs bleiben true.
2. Workflow `Deploy Website (korczewski)` ist bei `FLUX_ENABLED != 'true'` aktiver Fallback
   und aktuell hardcodiert auf BRAND_ID=korczewski. BRAND_ID=massage, BRAND_NAME/Kontakt,
   `WEBSITE_DB_*` und `TLS_SECRET_NAME` müssen identisch zum Environment sein. Falls
   fail-closed placeholder check neue Variablen fordert, alle explizit setzen. Image-
   Digest-Placeholder korrekt mit frisch gebautem Image auflösen, bevor kubectl apply läuft;
   SHA-Tag-Pinning danach erhalten. mentolder job nicht ändern.
3. Pre-Rollout Secret-Check muss VOR apply laufen und das effektiv gerenderte Overlay
   prüfen; aktueller Check liest nur Basis `k3d/website.yaml` und übersieht den gepatchten
   `WEBSITE_MASSAGE_DB_PASSWORD`-Key. Render/Substitution und Secret-Referenzextraktion im
   korczewski-Step vor apply platzieren; alle nicht-optionalen Secret-Keys einschließlich
   Initcontainern prüfen, Werte nicht ausgeben. Cross-Namespace Referenzen werden mit
   Namespace des jeweiligen Dokuments geprüft. Bei fehlendem Key vor Deployment abbrechen.
4. Ohne Flux nur Website deployen; Auth-/DB-Abhängigkeiten müssen separat bereitstehen.
   Fallback darf keine Workspace- oder Job-Kustomization resümieren. Auth-Bootstrap und
   erste TLS-Spiegelung sind p4-Schritte, kein kubectl-Schreibzugriff in diesem Planlauf.

## Task: Verifikation

Mit p5 exakte Render-Parität für mentolder und neue Massage-Konfiguration abstimmen,
Flux-Abhängigkeiten und Fallback-Env/Secret-Checks abdecken. Vor Freigabe zwei Renderpfade
(Flux Environment und Workflow Environment) auf dieselben DB-/Brand-/TLS-Werte vergleichen.
Live DNS-/TLS-/Login-Smoke-Tests laufen erst nach Operator-Schritten aus p4.

```bash
kustomize build prod-fleet/website-korczewski --load-restrictor=LoadRestrictionsNone > /tmp/massage-website-render.yaml
bash scripts/pytest-run.sh tests/py/spec/massage-tenant/test_render_topology.py tests/py/spec/massage-tenant/test_flux_freeze.py
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
