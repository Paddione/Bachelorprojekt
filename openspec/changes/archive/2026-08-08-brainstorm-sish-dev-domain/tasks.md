---
title: "brainstorm-sish bindet wieder die Dev-Domain, Guard wieder scharf"
ticket_id: T002705
domains: [bachelorprojekt-infra, bachelorprojekt-test]
status: plan_staged
---

# brainstorm-sish Dev-Domain — Implementation Plan

## File Structure

| Datei | Änderung | Zeilen (ist → soll) |
|---|---|---|
| `k3d/dev-stack/sish.yaml` | 2 Argumentwerte: `${PROD_DOMAIN}` → `${DEV_DOMAIN}`, `brainstorm.` → `*.` | 78 → 78 |
| `tests/unit/.coverage-allowlist` | Zeile `brainstorm-dev-host` entfernen | 40 → 39 |
| `tests/unit/brainstorm-dev-host.bats` | RED-Test für den Registrierungs-Guard (bereits im Stage-Commit) | 63 → 80 |
| `openspec/changes/brainstorm-sish-dev-domain/specs/llm-local-dev.md` | Delta: Requirement um Durchsetzungs-Satz + Szenario erweitert (bereits im Stage-Commit) | — |

Kein S1-Budget betroffen: `.yaml`/`.bats`/Listen sind ungated (`plan-lint residual_budget` liefert
für alle vier Pfade leer).

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| p1 | infra+test | `k3d/dev-stack/sish.yaml`, `tests/unit/.coverage-allowlist` |

Ein Partial: die beiden Änderungen sind eine Einheit. Das Manifest allein behebt den Zustand,
aber nicht seine Unsichtbarkeit; die Listenzeile allein macht CI rot, ohne den Fehler zu beheben.
Getrennt gemergt wäre jeder Teil für sich falsch — genau die Konstellation, die den Bug erzeugt hat
(zwei parallele PRs, einzeln grün, zusammen kaputt).

## Tasks

### 1. RED bestätigen — expected: FAIL

Vor jeder Änderung den Ausgangszustand belegen:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/brainstorm-dev-host.bats
```

expected: FAIL — Test 4 (`binds *.dev.<domain>`) und Test 6 (`not parked in .coverage-allowlist`)
sind rot, die übrigen fünf grün. Sind sie es nicht, stimmt die Ausgangslage nicht und der Fix
adressiert etwas anderes als angenommen — dann abbrechen und neu diagnostizieren.

### 2. `k3d/dev-stack/sish.yaml` auf die Dev-Domain-Ebene zurücksetzen

Im `args`-Block des `sish`-Containers exakt zwei Werte ändern:

```yaml
- --domain=${DEV_DOMAIN}            # war: ${PROD_DOMAIN}
- --bind-hosts=*.${DEV_DOMAIN}      # war: brainstorm.${PROD_DOMAIN}
```

Beide Variablen stehen in der envsubst-Allowlist von `dev:apply`
(`taskfiles/Taskfile.dev-stack.yml`: `envsubst '$DEV_DOMAIN $DEV_WEBSITE_HOST $DEV_BRETT_HOST
$PROD_DOMAIN $CONTACT_EMAIL'`), werden also expandiert. `${PROD_DOMAIN}` bleibt in der Allowlist —
andere Dateien des Bundles nutzen sie weiterhin; nur dieses Manifest darf sie nicht mehr führen.

Nichts sonst im Manifest anfassen: `--force-requested-subdomains`, die Ports und der gepinnte
Image-Digest bleiben unverändert.

### 3. Guard aus der Ausschlussliste nehmen

In `tests/unit/.coverage-allowlist` die Zeile `brainstorm-dev-host` ersatzlos streichen. Sie steht
unter der Rubrik „Need a live DB / cluster / kubectl / ssh" — der Test führt aber ausschließlich
`grep` auf Repo-Dateien aus und gehört nicht unter diese Begründung.

Die übrigen 30 Einträge bleiben unangetastet (→ T002707).

### 4. GRÜN verifizieren

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/brainstorm-dev-host.bats   # 7/7 grün
task test:unit                                                          # Guard läuft jetzt mit
```

Der zweite Befehl ist der eigentliche Beleg: er zeigt, dass der Guard im Offline-Gate ankommt.
Ein grüner Einzellauf allein belegt das nicht — genau diese Lücke ließ den Bug entstehen.

Zusätzlich der Kustomize-Bau, weil ein Manifest berührt ist:

```bash
kubectl kustomize k3d/dev-stack/ > /dev/null && echo "kustomize OK"
```

### 5. Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`freshness:regenerate` erfasst die geänderte Testdatei im `test-inventory.json`; die regenerierten
Artefakte gehören in denselben Commit, sonst meldet `freshness:check` sie als veraltet.

## Nicht in diesem Vorgang

- Die 8 weiteren vermutlich offline-fähigen Einträge der Ausschlussliste → **T002707**.
- Ein Deploy des Dev-Stacks. Die Korrektur wirkt beim nächsten `task dev:apply`; ob und wann der
  lokale k3d-Stack neu ausgerollt wird, entscheidet der Operator.
