---
title: "website-ns domain-config deklarativ in den Website-Overlay aufnehmen"
date: 2026-06-16
slug: website-domain-config-overlay
ticket_id: T000873
plan_ref: null
status: spec
domains: [infra]
---

# Spec: website-ns domain-config deklarativ in den Website-Overlay

## Problem

Das `website` Deployment (`k3d/website.yaml:433`) bezieht `MEDIAVIEWER_HOST` per
`configMapKeyRef` aus der ConfigMap **`domain-config`** (required, kein `optional: true`).
Diese ConfigMap ist in den Website-Overlays **nicht deklariert** —
`prod-fleet/website-mentolder/` und `prod-fleet/website-korczewski/` importieren nur
`k3d/website.yaml` + `k3d/website-seller-config.yaml` (+ Ingress/Middleware). Die
`domain-config` existiert deklarativ nur in der **workspace**-Overlay
(`prod/kustomization.yaml` patcht `prod/configmap-domains.yaml` in die `workspace`-ns),
**nicht** in `website` / `website-korczewski`.

**Folge:** Sobald ein neuer required `configMapKeyRef`-Key zu `k3d/website.yaml`
hinzukommt (so geschehen mit `MEDIAVIEWER_HOST`, PR #1735), bricht ein frischer
`task website:deploy ENV=korczewski` mit **CreateContainerConfigError**, weil
`website-korczewski` gar keine `domain-config` hat. Der Rollout hängt auf
„1 old replicas pending termination". Bei PR #1735 musste das für mentolder UND
korczewski **live** gefixt werden (cm aus `workspace[-korczewski]` kopieren) — das ist
die latente Fragilität, die PR #1735 selbst geflaggt hat.

## Ziel

`domain-config` für die website-Namespace **deklarativ** im Website-Overlay verankern —
analog zur workspace-Overlay — sodass ein neuer `domain-config`-Key keinen frischen
`website:deploy` mehr bricht. Plus ein **Offline-CI-Guard**, der einen fehlenden Key
in CI rot macht statt erst zur Deploy-Zeit als CreateContainerConfigError.

## Nicht-Ziel

- Keine Änderung am Laufzeitverhalten der Website (Werte bleiben identisch).
- Keine Migration der workspace-ns `domain-config` (die ist bereits deklarativ und korrekt).
- Kein Voll-Mirror aller ~30 Domain-Keys in die website-ns (siehe Design-Entscheidung).

## Design-Entscheidung (autonom gewählt, mit Begründung)

Drei Optionen abgewogen:

| Option | Inhalt | Bewertung |
|---|---|---|
| **A: Minimaler Subset + Guard** ✅ | Eine `domain-config` ConfigMap mit genau den vom website-Deployment via `configMapKeyRef` konsumierten Keys (heute: `MEDIAVIEWER_HOST`), Werte als env-Platzhalter identisch zu `prod/configmap-domains.yaml`. Plus bats-Parity-Guard. | **Gewählt.** Kleinste Blast-Radius, SSOT-konsistente Werte, Footgun via CI eliminiert. |
| B: Voll-Mirror | Komplette `prod/configmap-domains.yaml` (alle Keys, inkl. KC_USER-Credentials, TURN-IPs) in die website-ns spiegeln. | Verworfen: leakt irrelevante Keys (Credentials/IPs) in die website-ns, koppelt website-Overlay an prod/-Interna. |
| C: Cross-NS-Referenz | website-Overlay re-namespaced den workspace base+patch. | Verworfen: hacky (`patches:` ist nicht als Cross-Overlay-Resource gedacht), zieht trotzdem alle Keys. |

**Warum kein visueller Brainstorm-Tunnel:** reine Config/Overlay-Refaktorierung ohne
UI-/Design-Ambiguität; Problem + Lösung sind durch das Auto-Memory
`reference-website-korczewski-domain-config-gap` und die Codebase-Exploration
vollständig bestimmt.

## Lösung (Option A)

### 1. Geteilte ConfigMap-Datei (DRY über beide Brands)

Neue Datei `prod-fleet/website-common/domain-config.yaml` — **ohne** `metadata.namespace`
(die Overlay-`namespace:`-Direktive setzt sie korrekt auf `website` bzw.
`website-korczewski`):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: domain-config
data:
  # Muss exakt dem prod/configmap-domains.yaml-Ausdruck entsprechen (SSOT, drift-guarded).
  # Wert wird via website:deploy-envsubst gefüllt ($PROD_DOMAIN ist bereits in der Liste).
  MEDIAVIEWER_HOST: "mediaviewer.${PROD_DOMAIN}"
```

> Wert-Ausdruck `mediaviewer.${PROD_DOMAIN}` ist **identisch** zu
> `prod/configmap-domains.yaml:27` → konsistente Werte zwischen workspace-ns und
> website-ns, kein Drift. `$PROD_DOMAIN` ist in der website:deploy-envsubst-Liste
> (Taskfile.yml Prod-Pfad Z.3564 und Dev-Pfad Z.3538) bereits enthalten → **keine
> Taskfile-envsubst-Änderung nötig**.

### 2. Overlays referenzieren die geteilte Datei

`prod-fleet/website-mentolder/kustomization.yaml` und
`prod-fleet/website-korczewski/kustomization.yaml` bekommen je einen `resources`-Eintrag:

```yaml
resources:
  - ../../k3d/website.yaml
  - ../../k3d/website-seller-config.yaml
  - ../website-common/domain-config.yaml   # ← NEU
  # ... (bestehende Ingress/Middleware bleiben)
```

### 3. Dev-Pfad

Der Dev-Zweig von `website:deploy` (Taskfile.yml ~Z.3528–3539) applied `k3d/website.yaml`
imperativ in die `website`-ns ohne domain-config → gleiche Fehlerklasse in dev.
**Verifizieren** ob dev aktuell überhaupt funktioniert (evtl. erbt die dev-website-ns die
cm aus einem früheren Apply). Falls Lücke: im Dev-Zweig
`envsubst "\$PROD_DOMAIN ..." < prod-fleet/website-common/domain-config.yaml | kubectl apply -f -`
mit `WEBSITE_NAMESPACE` ergänzen. Dev-`PROD_DOMAIN` (aus `environments/dev.yaml`) muss zu
`mediaviewer.localhost` auflösen (= `default_dev` in schema.yaml) — prüfen.

### 4. Anti-Regression-Guard (bats, offline)

Neue Datei `tests/unit/website-domain-config-overlay.bats`:

- **Parity:** Jeder `configMapKeyRef`-Key mit `name: domain-config` in `k3d/website.yaml`
  MUSS in `prod-fleet/website-common/domain-config.yaml` vorhanden sein. → ein neuer Key
  ohne Mirror macht **CI rot** statt CreateContainerConfigError zur Deploy-Zeit.
- **Presence:** Beide Overlays (`website-mentolder`, `website-korczewski`) referenzieren
  `../website-common/domain-config.yaml`.
- **Drift:** `MEDIAVIEWER_HOST`-Ausdruck in der geteilten ConfigMap == der in
  `prod/configmap-domains.yaml` (gemeinsame Keys dürfen nicht auseinanderlaufen).
- **Kustomize-Build:** `kustomize build prod-fleet/website-mentolder` bzw.
  `…website-korczewski` emittiert eine `domain-config` ConfigMap in der korrekten
  Namespace mit dem Key (falls offline-fähig; sonst als nicht-CI-Step markieren).

Test in `task test:all` einhängen (coverage-guard-Konvention — wie bei
`mediaviewer-host-durability.bats` in PR #1735; den Wiring-Punkt im Taskfile finden).

### Komplementarität zur bestehenden `mediaviewer-host-durability.bats`

Die existierende `tests/unit/mediaviewer-host-durability.bats` schützt nur den
**workspace-ns**-Pfad (`prod/configmap-domains.yaml` + dessen envsubst). Der neue Guard
deckt die **website-ns** ab — keine Überschneidung, sondern die fehlende Hälfte.

## Betroffene Dateien

| Datei | Aktion |
|---|---|
| `prod-fleet/website-common/domain-config.yaml` | NEU (geteilte ConfigMap, ~8 Z.) |
| `prod-fleet/website-mentolder/kustomization.yaml` | EDIT (+1 resource) |
| `prod-fleet/website-korczewski/kustomization.yaml` | EDIT (+1 resource) |
| `tests/unit/website-domain-config-overlay.bats` | NEU (Guard) |
| `Taskfile.yml` | EDIT nur falls Dev-Pfad-cm-Apply nötig (verifizieren) + Test-Wiring in test:all |
| `environments/schema.yaml` | KEINE Änderung (MEDIAVIEWER_HOST bereits registriert, Z.182) |

## Akzeptanzkriterien

1. `kustomize build prod-fleet/website-mentolder` enthält eine `domain-config` ConfigMap
   (namespace `website`) mit `MEDIAVIEWER_HOST`.
2. `kustomize build prod-fleet/website-korczewski` enthält eine `domain-config` ConfigMap
   (namespace `website-korczewski`) mit `MEDIAVIEWER_HOST`.
3. Der neue bats-Guard ist grün und in `task test:all` eingehängt; ein hinzugefügter
   Dummy-`configMapKeyRef`-Key ohne Mirror würde ihn rot machen.
4. `task workspace:validate` (kustomize-Strukturvalidierung) bleibt grün.
5. CI-Äquivalent grün: `task test:changed` + `task freshness:regenerate` +
   `task freshness:check` + (wegen Test-Änderung) `task test:inventory`.
6. Werte-Konsistenz: website-ns `MEDIAVIEWER_HOST` löst zu `mediaviewer.<PROD_DOMAIN>` auf
   (mentolder/korczewski), nicht zum dev-Default.

## Risiken / Gotchas

- **`$patch: delete` / SSA:** Prod-Apply nutzt `kubectl apply --server-side
  --force-conflicts`. Eine via SSA gemanagte `domain-config` übernimmt das Feld-Ownership
  — sicherstellen, dass das die live (ad-hoc erstellte) cm sauber adoptiert, nicht
  konfligiert (analog `knowledge-secrets`-Adoptionsproblem in CLAUDE.md).
- **S1-Ratchet:** `Taskfile.yml` ist groß und evtl. baselined — pro Datei `wc -l` +
  `baseline.json` prüfen; Edits zeilenneutral halten (nur bestehende Zeilen ändern, keine
  Netto-Zeilen), sonst echten Verkleinerungs-Schritt einplanen.
- **Keine Brand-Domain-Literale** in Code/Snippets (S3) — Werte über `${PROD_DOMAIN}`.
- **Dev-Regression:** Dev-Pfad-Änderung nur falls verifizierte Lücke; sonst nicht anfassen.
