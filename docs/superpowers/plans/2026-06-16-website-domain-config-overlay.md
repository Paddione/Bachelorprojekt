---
title: website-ns domain-config deklarativ im Website-Overlay Implementation Plan
ticket_id: T000873
domains: [infra]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# website-ns domain-config deklarativ im Website-Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verankere die `domain-config` ConfigMap deklarativ in beiden Website-Overlays (`website` + `website-korczewski` ns), sodass ein neuer required `configMapKeyRef`-Key in `k3d/website.yaml` keinen frischen `website:deploy` mehr mit `CreateContainerConfigError` bricht — plus ein Offline-CI-Guard, der einen fehlenden Key in CI rot macht statt erst zur Deploy-Zeit.

**Architecture:** Eine einzige geteilte ConfigMap-Datei unter `prod-fleet/website-common/domain-config.yaml` (ohne `metadata.namespace`) wird von beiden Brand-Overlays per `resources:`-Eintrag eingebunden; die `namespace:`-Direktive jedes Overlays re-namespaced sie korrekt. Werte sind env-Platzhalter identisch zur workspace-SSOT (`prod/configmap-domains.yaml`). Ein neuer bats-Parity-Guard hält k3d/website.yaml ↔ geteilte ConfigMap ↔ prod/configmap-domains.yaml drift-frei.

**Tech Stack:** Kustomize-Overlays, Bash/BATS (bats-core submodule), go-task (`Taskfile.yml`), `kubectl apply --server-side`.

---

## Kontext & verifizierte Fakten (NICHT neu herleiten)

Alle Fakten unten wurden im Worktree `/tmp/wt-website-domain-config-overlay` verifiziert (Branch `feature/website-domain-config-overlay`, Ticket T000873):

- **`k3d/website.yaml:433-437`** — der einzige `configMapKeyRef` aus `domain-config`:
  `MEDIAVIEWER_HOST` (Zeile 433 `name:`, 436 `name: domain-config`, 437 `key: MEDIAVIEWER_HOST`), **required, kein `optional: true`**.
- **`prod/configmap-domains.yaml:27`** — `MEDIAVIEWER_HOST: "mediaviewer.${PROD_DOMAIN}"` (SSOT-Ausdruck, exakt spiegeln).
- **`environments/schema.yaml:182`** — `MEDIAVIEWER_HOST` registriert (`default_dev: mediaviewer.localhost`). **KEINE schema-Änderung nötig.**
- **`Taskfile.yml` Prod-Pfad Z.3562-3566** — `kustomize build $WEBSITE_OVERLAY | sed(quotet bare ${VAR}) | envsubst "<liste>" | sed($$→$) | kubectl apply --server-side --force-conflicts`. Die envsubst-Liste (Z.3564) **enthält bereits `\$PROD_DOMAIN`** → **keine envsubst-Listen-Änderung nötig**, solange der ConfigMap-Wert `mediaviewer.${PROD_DOMAIN}` lautet.
- **`Taskfile.yml` Dev-Pfad Z.3528-3539** — applied `k3d/website.yaml` imperativ in die website-ns, dessen envsubst-Liste (Z.3538) **ebenfalls `\$PROD_DOMAIN`** enthält. **Aber:** dieser Pfad applied **keine** domain-config in die website-ns (Z.2240 applied `k3d/configmap-domains.yaml` nur in `workspace`, nicht website). → Dev hat dieselbe Lücke (siehe Task 5, Verifikation-first).
- **`environments/dev.yaml`** hat **KEINE `PROD_DOMAIN`-Schlüssel** (verifiziert: `grep PROD_DOMAIN environments/dev.yaml` → leer); es setzt nur `MEDIAVIEWER_HOST: mediaviewer.localhost` direkt unter `env_vars` (Z.19). Konsequenz für Dev siehe Task 5.
- **Overlay-Auswahl:** mentolder→`prod-fleet/website-mentolder` (Z.3550), korczewski→`prod-fleet/website-korczewski` (Z.3551).
- **Beide Overlay-`kustomization.yaml` haben `namespace:` gesetzt** (`website` bzw. `website-korczewski`) → eine geteilte ConfigMap **ohne** `metadata.namespace` wird korrekt re-namespaced.
- **`tests/unit/mediaviewer-host-durability.bats`** existiert (51 Z.), deckt aber NUR den workspace-ns-Pfad ab. Der neue Guard ist **komplementär** (website-ns).
- **Test-Wiring-Punkt:** `Taskfile.yml:263` listet `- task: test:unit:mediaviewer-host-durability` im `test:unit`-Aggregator (Z.249-290); die Subtask-Definition steht Z.408-411. Der neue Test wird **identisch** eingehängt. Der `coverage-guard` (`scripts/tests/unit-coverage-guard.sh`, Task Z.502-506) prüft, dass **jede** `tests/unit/*.bats` von einem Task per `grep -qF "<name>.bats" Taskfile.yml` referenziert wird ODER in `tests/unit/.coverage-allowlist` steht — die Subtask-Definition (die `tests/unit/website-domain-config-overlay.bats` enthält) erfüllt das automatisch.

### S1-Ratchet-Budget (pro zu ändernder Datei, gegen die **wirksame** Schwelle)

`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json` ausgeführt für alle Dateien:

| Datei | Ext-Limit | Baseline | Ist `wc -l` | Wirksame Schwelle | Budget | Plan-Konsequenz |
|---|---|---|---|---|---|---|
| `Taskfile.yml` | (nicht in S1-Limit-Tabelle; `.yml` nicht gelistet) | **nicht-baselined** | 4644 | n/a (`.yml` kein S1-Ext-Limit) | n/a | Trotzdem **zeilenneutral pro Edit halten** wo möglich; die einzigen Edits sind +2 Aggregator-Zeile + Subtask-Definition (s.u.) — additiv, aber `.yml` triggert kein S1-Ratchet. |
| `prod-fleet/website-mentolder/kustomization.yaml` | (`.yaml` kein S1-Ext-Limit) | nicht-baselined | 8 | n/a | n/a | +1 resources-Zeile, unkritisch. |
| `prod-fleet/website-korczewski/kustomization.yaml` | (`.yaml` kein S1-Ext-Limit) | nicht-baselined | 31 | n/a | n/a | +1 resources-Zeile, unkritisch. |
| `prod-fleet/website-common/domain-config.yaml` | (`.yaml` kein S1-Ext-Limit) | nicht-baselined (NEU) | 0 (neu, ~10 Z.) | n/a | groß | Neue Datei, weit unter jeder Grenze. |
| `tests/unit/website-domain-config-overlay.bats` | `.bats` = **300** | nicht-baselined (NEU) | 0 (neu, ~90 Z.) | 300 | ~210 | Neue Datei, weit unter Limit; Wachstumsreserve groß. |

> **S1-Hinweis:** `.yml`/`.yaml`/`.bats` — nur `.bats` (Limit 300) fällt unter ein S1-Extension-Limit; YAML-Dateien sind nicht im S1-Limit-Set, daher kein Ratchet-Risiko durch additive Zeilen. Trotzdem werden alle Edits minimal gehalten. **Keine Baseline-/Ignore-Ausnahme** wird hinzugefügt (verbietet `freshness:check` Key-Count-Assertion).

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `prod-fleet/website-common/domain-config.yaml` | Geteilte, ns-lose `domain-config` ConfigMap mit genau den vom website-Deployment konsumierten Keys (heute: `MEDIAVIEWER_HOST`), Wert als env-Platzhalter = workspace-SSOT. | **NEU** |
| `prod-fleet/website-mentolder/kustomization.yaml` | mentolder-Overlay (`namespace: website`); referenziert die geteilte ConfigMap zusätzlich. | **EDIT** (+1 resource) |
| `prod-fleet/website-korczewski/kustomization.yaml` | korczewski-Overlay (`namespace: website-korczewski`); referenziert die geteilte ConfigMap zusätzlich. | **EDIT** (+1 resource) |
| `tests/unit/website-domain-config-overlay.bats` | Offline-Parity/Presence/Drift-Guard (website-ns), komplementär zu `mediaviewer-host-durability.bats` (workspace-ns). | **NEU** |
| `Taskfile.yml` | Test-Wiring: Subtask-Definition + Aggregator-Eintrag (analog `mediaviewer-host-durability`). | **EDIT** (+ Subtask + 1 Aggregator-Zeile) |
| `environments/schema.yaml` | — | **KEINE Änderung** (MEDIAVIEWER_HOST bereits registriert). |

---

## Task 1: Geteilte domain-config ConfigMap (DRY über beide Brands)

**Files:**
- Create: `prod-fleet/website-common/domain-config.yaml`

- [x] **Step 1: Datei anlegen**

Wert-Ausdruck `mediaviewer.${PROD_DOMAIN}` ist **byte-identisch** zu `prod/configmap-domains.yaml:27` → konsistente Werte zwischen workspace-ns und website-ns, kein Drift. `${PROD_DOMAIN}` wird im Prod-Pfad von `website:deploy` per envsubst gefüllt (steht bereits in der Liste). Datei hat **bewusst kein `metadata.namespace`** — die `namespace:`-Direktive des einbindenden Overlays setzt sie korrekt.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: domain-config
  # KEIN namespace: hier — die Overlay-namespace:-Direktive (website / website-korczewski)
  # re-namespaced diese ConfigMap brand-korrekt. NICHT hinzufügen.
data:
  # Muss exakt dem prod/configmap-domains.yaml-Ausdruck entsprechen (SSOT, drift-guarded
  # durch tests/unit/website-domain-config-overlay.bats). Wert wird via website:deploy-
  # envsubst gefüllt ($PROD_DOMAIN ist bereits in der Liste, Taskfile.yml Z.3564/3538).
  # Jeder neue required configMapKeyRef name: domain-config in k3d/website.yaml MUSS hier
  # ergänzt werden, sonst macht der bats-Guard CI rot.
  MEDIAVIEWER_HOST: "mediaviewer.${PROD_DOMAIN}"
```

- [x] **Step 2: Wert-Parität gegen die SSOT verifizieren**

Run:
```bash
diff <(grep -E '^[[:space:]]+MEDIAVIEWER_HOST:' prod/configmap-domains.yaml | tr -s ' ') \
     <(grep -E '^[[:space:]]+MEDIAVIEWER_HOST:' prod-fleet/website-common/domain-config.yaml | tr -s ' ')
```
Expected: kein Output (Exit 0) — die `MEDIAVIEWER_HOST:`-Zeile ist in beiden Dateien identisch (`MEDIAVIEWER_HOST: "mediaviewer.${PROD_DOMAIN}"`).

- [x] **Step 3: Commit**

```bash
git add prod-fleet/website-common/domain-config.yaml
git commit -m "feat(infra): add shared domain-config ConfigMap for website overlays"
```

---

## Task 2: mentolder-Overlay referenziert die geteilte ConfigMap

**Files:**
- Modify: `prod-fleet/website-mentolder/kustomization.yaml`

- [x] **Step 1: resources-Eintrag ergänzen**

Aktueller Inhalt (verifiziert, 8 Z.):
```yaml
namespace: website
resources:
  - ../../k3d/website.yaml
  - ../../k3d/website-seller-config.yaml
  - website-ingress-web.yaml
```

Ergänze die geteilte ConfigMap als neuen `resources`-Eintrag (Pfad relativ zu `prod-fleet/website-mentolder/`):
```yaml
namespace: website
resources:
  - ../../k3d/website.yaml
  - ../../k3d/website-seller-config.yaml
  - ../website-common/domain-config.yaml
  - website-ingress-web.yaml
```

- [x] **Step 2: kustomize build prüft die Einbindung + Namespace**

Run:
```bash
kustomize build prod-fleet/website-mentolder --load-restrictor=LoadRestrictionsNone \
  | grep -A6 'kind: ConfigMap' | grep -E 'name: domain-config|namespace: website|MEDIAVIEWER_HOST'
```
Expected: zeigt `name: domain-config`, `namespace: website` und `MEDIAVIEWER_HOST: "mediaviewer.${PROD_DOMAIN}"` (Wert noch un-substituiert — envsubst läuft erst im Deploy-Pfad).

> Falls `kustomize` lokal fehlt: `kubectl kustomize prod-fleet/website-mentolder` als Fallback.

- [x] **Step 3: Commit**

```bash
git add prod-fleet/website-mentolder/kustomization.yaml
git commit -m "feat(infra): wire shared domain-config into mentolder website overlay"
```

---

## Task 3: korczewski-Overlay referenziert die geteilte ConfigMap

**Files:**
- Modify: `prod-fleet/website-korczewski/kustomization.yaml`

- [x] **Step 1: resources-Eintrag ergänzen**

Aktueller Inhalt (verifiziert, 31 Z. — `namespace: website-korczewski`, `resources:` mit `../../k3d/website.yaml`, `../../k3d/website-seller-config.yaml`, `website-security-headers.yaml`, plus `patches:` für den IngressRoute-TLS/Middleware-Patch). **Den `patches:`-Block unverändert lassen.** Nur den `resources:`-Block erweitern:

```yaml
resources:
  - ../../k3d/website.yaml
  - ../../k3d/website-seller-config.yaml
  - ../website-common/domain-config.yaml
  - website-security-headers.yaml
```

> Hinweis: Lies die Datei zuerst vollständig und füge die Zeile `  - ../website-common/domain-config.yaml` exakt in den bestehenden `resources:`-Block ein (z.B. nach `website-seller-config.yaml`). `patches:` und `namespace: website-korczewski` bleiben unangetastet.

- [x] **Step 2: kustomize build prüft die Einbindung + Namespace**

Run:
```bash
kustomize build prod-fleet/website-korczewski --load-restrictor=LoadRestrictionsNone \
  | grep -A6 'kind: ConfigMap' | grep -E 'name: domain-config|namespace: website-korczewski|MEDIAVIEWER_HOST'
```
Expected: zeigt `name: domain-config`, `namespace: website-korczewski` und `MEDIAVIEWER_HOST: "mediaviewer.${PROD_DOMAIN}"`.

- [x] **Step 3: Commit**

```bash
git add prod-fleet/website-korczewski/kustomization.yaml
git commit -m "feat(infra): wire shared domain-config into korczewski website overlay"
```

---

## Task 4: Offline-Anti-Regression-Guard (bats)

**Files:**
- Create: `tests/unit/website-domain-config-overlay.bats`
- Modify: `Taskfile.yml` (Subtask-Definition + Aggregator-Eintrag)

Dieser Guard ist **offline** (keine Cluster-Calls, kein kubectl, kein Netzwerk). Er prüft drei Eigenschaften per `grep`:
1. **Parity:** jeder `configMapKeyRef`-Key mit `name: domain-config` in `k3d/website.yaml` existiert in der geteilten ConfigMap.
2. **Presence:** beide Overlays referenzieren `../website-common/domain-config.yaml`.
3. **Drift:** `MEDIAVIEWER_HOST`-Ausdruck in der geteilten ConfigMap == der in `prod/configmap-domains.yaml`.

Die `kustomize build`-Assertion aus der Spec wird **bewusst weggelassen** — `kustomize` ist im Offline-CI-Lauf (`task test:all`) nicht garantiert installiert; die `kustomize build`-Verifikation läuft stattdessen in Task 2/3 (manuell) und Task 6 (`task workspace:validate`). Der bats-Guard bleibt rein `grep`-basiert und damit zuverlässig offline.

- [x] **Step 1: Den failing Guard schreiben**

> TDD-Hinweis: Schreibe zuerst den vollständigen Guard. Er ist initial **rot** für die Parity/Presence-Tests, solange Task 1-3 noch nicht committed sind — in der subagent-Reihenfolge laufen Task 1-3 aber zuerst, sodass er nach dem Wiring grün wird. Um den failing-Zustand zu demonstrieren, siehe Step 3.

Inhalt von `tests/unit/website-domain-config-overlay.bats`:

```bash
#!/usr/bin/env bats
# Regression: die website-Namespace muss die domain-config ConfigMap deklarativ
# im Overlay tragen — sonst bricht ein frischer `task website:deploy ENV=<brand>`
# mit CreateContainerConfigError, weil k3d/website.yaml MEDIAVIEWER_HOST per
# required configMapKeyRef aus `domain-config` bezieht, die in der website-ns
# (ohne dieses Overlay) gar nicht existiert. So live-gefixt bei PR #1735.
#
# Komplementär zu tests/unit/mediaviewer-host-durability.bats:
#   - mediaviewer-host-durability.bats schützt den WORKSPACE-ns-Pfad
#     (prod/configmap-domains.yaml + dessen envsubst).
#   - DIESER Guard schützt den WEBSITE-ns-Pfad (geteilte Overlay-ConfigMap).
# Keine Überschneidung. Rein offline (grep), keine Cluster-Calls.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  WEBSITE="$REPO_ROOT/k3d/website.yaml"
  SHARED_CM="$REPO_ROOT/prod-fleet/website-common/domain-config.yaml"
  PROD_DOMAINS="$REPO_ROOT/prod/configmap-domains.yaml"
  KUST_MENTOLDER="$REPO_ROOT/prod-fleet/website-mentolder/kustomization.yaml"
  KUST_KORCZEWSKI="$REPO_ROOT/prod-fleet/website-korczewski/kustomization.yaml"
}

@test "shared website domain-config ConfigMap file exists" {
  [ -f "$SHARED_CM" ]
}

@test "shared domain-config is named 'domain-config' (matches configMapKeyRef name)" {
  run grep -qE '^[[:space:]]*name:[[:space:]]*domain-config[[:space:]]*$' "$SHARED_CM"
  [ "$status" -eq 0 ]
}

@test "shared domain-config carries NO metadata.namespace (overlay re-namespaces it)" {
  # Ein hartes namespace: hier würde das brand-korrekte Re-Namespacing brechen.
  run grep -qE '^[[:space:]]*namespace:' "$SHARED_CM"
  [ "$status" -ne 0 ]
}

@test "parity: every domain-config configMapKeyRef key in website.yaml is in the shared ConfigMap" {
  # Extrahiere alle keys, die k3d/website.yaml via configMapKeyRef aus domain-config zieht.
  # Heuristik (offline, ohne yaml-Parser): finde Blöcke 'name: domain-config' gefolgt von
  # 'key: <KEY>' im selben valueFrom.configMapKeyRef. Wir lesen alle 'key:' Zeilen, die
  # in einem configMapKeyRef-Block mit name: domain-config stehen.
  keys="$(awk '
    /configMapKeyRef:/ { in_ref=1; name=""; next }
    in_ref && /name:[[:space:]]*domain-config/ { name="domain-config"; next }
    in_ref && /key:/ {
      if (name=="domain-config") { gsub(/^[[:space:]]*key:[[:space:]]*/,""); gsub(/[[:space:]]*$/,""); print }
      in_ref=0; name=""; next
    }
    in_ref && /name:/ { name=""; }   # ein anderer ConfigMap-name → kein domain-config-key
  ' "$WEBSITE")"
  [ -n "$keys" ]   # mindestens MEDIAVIEWER_HOST muss gefunden werden
  while IFS= read -r k; do
    [ -z "$k" ] && continue
    run grep -qE "^[[:space:]]+${k}:" "$SHARED_CM"
    [ "$status" -eq 0 ] || { echo "FEHLT in shared domain-config: $k"; false; }
  done <<< "$keys"
}

@test "presence: mentolder overlay references the shared domain-config" {
  run grep -qF '../website-common/domain-config.yaml' "$KUST_MENTOLDER"
  [ "$status" -eq 0 ]
}

@test "presence: korczewski overlay references the shared domain-config" {
  run grep -qF '../website-common/domain-config.yaml' "$KUST_KORCZEWSKI"
  [ "$status" -eq 0 ]
}

@test "drift: shared MEDIAVIEWER_HOST expression equals prod/configmap-domains.yaml" {
  shared="$(grep -E '^[[:space:]]+MEDIAVIEWER_HOST:' "$SHARED_CM" | tr -s ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  prod="$(grep -E '^[[:space:]]+MEDIAVIEWER_HOST:' "$PROD_DOMAINS" | tr -s ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -n "$shared" ]
  [ "$shared" = "$prod" ]
}

@test "MEDIAVIEWER_HOST derives from \${PROD_DOMAIN} (no hardcoded brand domain, S3)" {
  run grep -qE '^[[:space:]]+MEDIAVIEWER_HOST:[[:space:]]*"mediaviewer\.\$\{PROD_DOMAIN\}"' "$SHARED_CM"
  [ "$status" -eq 0 ]
}
```

- [x] **Step 2: Subtask + Aggregator-Eintrag im Taskfile ergänzen (analog mediaviewer-host-durability)**

Im Aggregator `test:unit` (Taskfile.yml, Block Z.249-290), direkt **nach** der Zeile
`      - task: test:unit:mediaviewer-host-durability` (Z.263) eine Zeile einfügen:
```yaml
      - task: test:unit:website-domain-config-overlay
```

Und die Subtask-Definition direkt **nach** dem `test:unit:mediaviewer-host-durability`-Block (endet Z.411) einfügen:
```yaml
  test:unit:website-domain-config-overlay:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/website-domain-config-overlay.bats
```

> Beide Edits sind rein additiv. `.yml` fällt unter kein S1-Extension-Limit (kein Ratchet-Risiko). Der `coverage-guard` (`scripts/tests/unit-coverage-guard.sh`) sieht `website-domain-config-overlay.bats` über die Subtask-`cmds`-Zeile per `grep -qF` → kein Allowlist-Eintrag nötig.

- [x] **Step 3: Demonstriere den failing-Zustand des Parity-Guards (TDD-Beweis)**

Temporär einen Dummy-required-Key in `k3d/website.yaml` hinzufügen, der NICHT in der geteilten ConfigMap ist, und den Parity-Test laufen lassen:
```bash
# Backup + Dummy einfügen direkt nach dem MEDIAVIEWER_HOST-configMapKeyRef-Block (~Z.437)
cp k3d/website.yaml /tmp/website.yaml.bak
# Manuell einfügen (oder via Editor): ein zweiter env-Eintrag, der aus domain-config
# einen nicht-gemirrorten Key zieht, z.B.:
#   - name: DUMMY_HOST
#     valueFrom:
#       configMapKeyRef:
#         name: domain-config
#         key: DUMMY_HOST
./tests/unit/lib/bats-core/bin/bats tests/unit/website-domain-config-overlay.bats
```
Expected: der Test `parity: every domain-config configMapKeyRef key in website.yaml is in the shared ConfigMap` schlägt mit `FEHLT in shared domain-config: DUMMY_HOST` **FEHL** → beweist, dass ein neuer required Key ohne Mirror CI rot macht.

Danach Backup zurückspielen:
```bash
mv /tmp/website.yaml.bak k3d/website.yaml
```

- [x] **Step 4: Guard grün laufen lassen (echter Zustand)**

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/website-domain-config-overlay.bats
```
Expected: alle Tests **PASS** (9 ok).

> Falls bats-Submodul fehlt: `git submodule update --init --recursive` (wie `test:unit` Z.252 es tut).

- [x] **Step 5: Über den Aggregator-Task laufen lassen (Wiring-Beweis)**

Run:
```bash
task test:unit:website-domain-config-overlay
```
Expected: PASS (beweist die Subtask-Definition greift).

Und den coverage-guard:
```bash
bash scripts/tests/unit-coverage-guard.sh
```
Expected: `unit-coverage: all <N> tests/unit/*.bats files are tracked (run by a task or allowlisted).` — kein Eintrag fehlt.

- [x] **Step 6: Commit**

```bash
git add tests/unit/website-domain-config-overlay.bats Taskfile.yml
git commit -m "test(infra): add offline website-ns domain-config parity guard"
```

---

## Task 5: Dev-Pfad-Frage klären (Verifikation-first, nur bei echter Lücke anfassen)

**Files:**
- (potenziell) Modify: `Taskfile.yml` Dev-Zweig (Z.3528-3539) — **NUR falls verifizierte Lücke**.

**Verifizierter Ausgangsbefund:** Der Dev-Zweig von `website:deploy` (Z.3528-3539) applied `k3d/website.yaml` imperativ in die website-ns, applied dabei aber **keine** `domain-config` (Z.2240 applied `k3d/configmap-domains.yaml` ausschließlich in die `workspace`-ns). `environments/dev.yaml` hat **keinen `PROD_DOMAIN`-Schlüssel** — ein `envsubst "\$PROD_DOMAIN"` der geteilten ConfigMap würde im Dev daher `mediaviewer.` (leer) oder den literalen Platzhalter ergeben, NICHT `mediaviewer.localhost`. Die Dev-SSOT für den Wert ist `k3d/configmap-domains.yaml` (`MEDIAVIEWER_HOST: "mediaviewer.localhost"`).

- [x] **Step 1: Prüfen, ob der Dev-`website:deploy` aktuell überhaupt bricht**

Entscheidungslogik (rein lokal, kein Cluster nötig falls kein dev-Cluster läuft):
```bash
# a) Bezieht das website-Deployment in dev MEDIAVIEWER_HOST aus domain-config? (ja, gleiche k3d/website.yaml)
grep -n 'domain-config' k3d/website.yaml
# b) Applied der Dev-Zweig eine domain-config in die website-ns? (Befund: nein)
sed -n '3528,3540p' Taskfile.yml | grep -c 'domain-config' || true   # erwartet 0
# c) Falls ein dev-k3d-Cluster läuft, existiert die cm bereits ad-hoc in website-ns?
kubectl --context k3d-mentolder-dev -n website get configmap domain-config 2>/dev/null \
  && echo "DEV: domain-config existiert bereits (Lücke evtl. nicht akut)" \
  || echo "DEV: keine domain-config in website-ns → frischer Dev-Deploy würde brechen"
```

- [x] **Step 2: Entscheidung dokumentieren**

**Wenn (c) zeigt, dass keine `domain-config` in der dev-website-ns existiert** (Lücke akut) → fahre mit Step 3 fort.
**Wenn die cm existiert** (z.B. aus einem früheren Apply geerbt) ODER **kein dev-Cluster verfügbar ist und Dev nicht im Scope der Bachelorarbeit-Deploys liegt** → **Prod-only bleiben**, Step 3 überspringen, Begründung als Commit-/PR-Kommentar festhalten: „Dev-Zweig nicht angefasst — Dev-website-ns trägt keine domain-config über das Overlay (imperativer Apply), Wert-SSOT ist `k3d/configmap-domains.yaml`; eine Dev-Lücke wird separat behandelt, da `environments/dev.yaml` kein `PROD_DOMAIN` führt und der geteilte Overlay-ConfigMap-Ausdruck im Dev nicht korrekt substituieren würde."

- [ ] **Step 3 (NUR bei akuter Dev-Lücke): Dev-Zweig die Dev-domain-config applizieren lassen**

Da der geteilte Overlay-ConfigMap-Ausdruck (`mediaviewer.${PROD_DOMAIN}`) im Dev mangels `PROD_DOMAIN` NICHT korrekt auflöst, applied der Dev-Zweig stattdessen die **Dev-SSOT** `k3d/configmap-domains.yaml` in die website-ns (analog dem workspace-ns-Apply Z.2240, aber in `${WEBSITE_NAMESPACE}`). Füge im Dev-Zweig (nach dem `website-seller-config.yaml`-Apply, Z.3539) ein:
```bash
          # Dev: domain-config (mediaviewer.localhost etc.) auch in die website-ns spiegeln,
          # damit der required MEDIAVIEWER_HOST-configMapKeyRef nicht CreateContainerConfigError
          # wirft. Wert-SSOT für dev ist k3d/configmap-domains.yaml (nicht der ${PROD_DOMAIN}-
          # Overlay-Ausdruck — environments/dev.yaml führt kein PROD_DOMAIN).
          kubectl ${CTX_ARG} apply -f k3d/configmap-domains.yaml -n "${WEBSITE_NAMESPACE}"
```
> `WEBSITE_NAMESPACE` ist im Block bereits exportiert (Z.3526). Dies ist **kein** envsubst des Overlay-ConfigMaps — bewusst, weil der Dev-Wert literal `mediaviewer.localhost` ist und nicht aus `${PROD_DOMAIN}` abgeleitet werden kann.

- [ ] **Step 4 (NUR falls Step 3 ausgeführt): Dev-Apply verifizieren**

Run (falls dev-Cluster läuft):
```bash
ENV=dev task website:deploy 2>&1 | tail -20
kubectl --context k3d-mentolder-dev -n website get configmap domain-config -o jsonpath='{.data.MEDIAVIEWER_HOST}'
```
Expected: `mediaviewer.localhost`; das website-Pod kommt ohne `CreateContainerConfigError` hoch.

- [ ] **Step 5: Commit (nur falls Step 3 ausgeführt)**

```bash
git add Taskfile.yml
git commit -m "fix(infra): mirror domain-config into dev website namespace"
```

---

## Task 6: SSA-Adoptions-Risiko adressieren (Prod-Apply der neuen ConfigMap)

**Files:** keine Code-Änderung — Verifikations-Task + Doku.

Der Prod-Pfad nutzt `kubectl apply --server-side --force-conflicts` (Z.3566). Die live `domain-config` in `website`/`website-korczewski` wurde bei PR #1735 **ad-hoc imperativ** erstellt (`kubectl create`/`cp`), ist also evtl. nicht SSA-gemanagt (field-manager `kubectl-client-side-apply` oder gar keiner). Beim ersten Overlay-Deploy übernimmt SSA das Field-Ownership — analog dem `knowledge-secrets`-Adoptionsproblem aus CLAUDE.md (dort verweigerte der SealedSecrets-Controller die Adoption eines secretGenerator-Secrets). Bei einer ConfigMap via `--server-side --force-conflicts` ist die Adoption i.d.R. konfliktfrei, MUSS aber verifiziert werden.

- [x] **Step 1: Diff der gebauten ConfigMap gegen live (Server-Side dry-run, kein echter Apply)**

Run (für beide Brands, hier mentolder; `--context fleet`):
```bash
source scripts/env-resolve.sh mentolder
kustomize build prod-fleet/website-mentolder --load-restrictor=LoadRestrictionsNone \
  | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
  | PROD_DOMAIN="$PROD_DOMAIN" envsubst '$PROD_DOMAIN' \
  | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
  | kubectl --context fleet -n website diff --server-side --force-conflicts -f - 2>&1 \
  | grep -A8 'domain-config' || echo "kein Diff an domain-config (oder cm-Werte identisch)"
```
Expected: der Diff zeigt höchstens eine `managedFields`-Übernahme bzw. identische `data.MEDIAVIEWER_HOST` (`mediaviewer.mentolder.de`). **Kein `Apply failed with N conflicts`** im Output.

> `kubectl diff --server-side` simuliert den Apply ohne Mutation. Falls `diff` einen Konflikt meldet, ist `--force-conflicts` (bereits im Deploy-Pfad gesetzt, Z.3566) die korrekte Auflösung — sie übernimmt das Field-Ownership. Das ist erwartet und sicher für eine ConfigMap (keine Secret-Daten, kein Datenverlust). Dokumentiere das Ergebnis im PR-Body.

- [x] **Step 2: Dasselbe für korczewski**

Run:
```bash
source scripts/env-resolve.sh korczewski
kustomize build prod-fleet/website-korczewski --load-restrictor=LoadRestrictionsNone \
  | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
  | PROD_DOMAIN="$PROD_DOMAIN" envsubst '$PROD_DOMAIN' \
  | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
  | kubectl --context fleet -n website-korczewski diff --server-side --force-conflicts -f - 2>&1 \
  | grep -A8 'domain-config' || echo "kein Diff an domain-config (oder cm-Werte identisch)"
```
Expected: `data.MEDIAVIEWER_HOST` = `mediaviewer.korczewski.de`, kein un-auflösbarer Konflikt.

> **Hinweis (kein Step):** Der eigentliche Prod-Deploy (`task website:deploy ENV=mentolder` + `ENV=korczewski`) erfolgt erst **nach** PR-Merge im post-merge-Deploy (push-based, kein GitOps). Dieser Task verifiziert nur vorab, dass die Adoption sauber laufen wird. Falls kein Cluster-Zugang während der Implementierung besteht, Step 1/2 als „im post-merge-Deploy zu verifizieren" im PR-Body markieren — der Deploy selbst nutzt bereits `--force-conflicts`.

---

## Task 7: Finaler Verifikations-Task (CI-Äquivalent, PFLICHT)

**Files:** keine — nur Verifikation + ein Commit für regenerierte Artefakte.

- [x] **Step 1: Kustomize-Strukturvalidierung**

Run:
```bash
task workspace:validate
```
Expected: grün (alle Overlays inkl. `prod-fleet/website-*` bauen fehlerfrei).

- [x] **Step 2: Manifest-Testrunner für den betroffenen Bereich (falls passende TEST-ID existiert)**

Run:
```bash
./tests/runner.sh local --list 2>/dev/null | grep -iE 'website|domain' || echo "keine spezifische TEST-ID — bats-Guard (Task 4) deckt ab"
```
Expected: entweder eine passende ID ausführen, oder bestätigen, dass der neue bats-Guard die Abdeckung liefert.

- [ ] **Step 3: Gezielte Tests für geänderte Domains**

Run:
```bash
task test:changed
```
Expected: grün (vitest --changed + BATS-Selection + quality), inkl. des neuen `website-domain-config-overlay.bats`.

- [ ] **Step 4: Test-Inventar regenerieren (wegen neuem Test PFLICHT)**

Run:
```bash
task test:inventory
git add website/src/data/test-inventory.json
```
Expected: `website/src/data/test-inventory.json` enthält jetzt `website-domain-config-overlay` (sonst failt CI's Inventory-Check).

- [ ] **Step 5: Freshness-Artefakte regenerieren**

Run:
```bash
task freshness:regenerate
```
Expected: aktualisiert generierte Artefakte (test-inventory, repo-index, …). Generierte Konflikt-Magnete (`docs/generated/**`, `docs/code-quality/repo-index.json`, `k3d/docs-content-built/architecture/index.html`) ggf. mit `git add` aufnehmen.

- [ ] **Step 6: CI-Äquivalent prüfen (S1-S4-Ratchet + Baseline-Assertion)**

Run:
```bash
task freshness:check
```
Expected: grün — insbesondere:
- S1-Ratchet meldet **kein** Wachstum (alle YAML-Dateien außerhalb des S1-Limit-Sets; `.bats`-Guard ~90 Z. << 300).
- Baseline-Key-Count unverändert (keine neuen Baseline-Einträge — Plan fügt keine hinzu).
- S3 (keine hardcodierten Brand-Domains): die geteilte ConfigMap nutzt `${PROD_DOMAIN}`, der bats-Guard nutzt Regex-Pattern, keine Literale.
- S4 (Orphans): `prod-fleet/website-common/domain-config.yaml` ist in beiden `kustomization.yaml` referenziert; der bats-Test in `Taskfile.yml` verdrahtet.

- [ ] **Step 7: Test-Inventar + Freshness-Artefakte committen**

```bash
git add website/src/data/test-inventory.json docs/generated docs/code-quality/repo-index.json 2>/dev/null; \
git status --short
git commit -m "chore: regenerate test-inventory + freshness artifacts for website domain-config guard"
```
> Falls `git status` keine Änderungen zeigt (Artefakte bereits aktuell), diesen Commit überspringen.

- [ ] **Step 8: Abschluss-Verifikation der Akzeptanzkriterien**

Run (Sammel-Check):
```bash
echo "== AK1/AK2: domain-config in beiden Overlays =="
for b in mentolder korczewski; do
  kustomize build "prod-fleet/website-$b" --load-restrictor=LoadRestrictionsNone \
    | grep -qE 'name: domain-config' && echo "  $b: domain-config present OK"
done
echo "== AK3: bats-Guard grün + wired =="
./tests/unit/lib/bats-core/bin/bats tests/unit/website-domain-config-overlay.bats >/dev/null && echo "  guard green OK"
grep -qF 'website-domain-config-overlay.bats' Taskfile.yml && echo "  wired in Taskfile OK"
echo "== AK6: Wert-Konsistenz (Ausdruck == SSOT) =="
diff <(grep MEDIAVIEWER_HOST prod/configmap-domains.yaml | tr -s ' ') \
     <(grep MEDIAVIEWER_HOST prod-fleet/website-common/domain-config.yaml | tr -s ' ') \
     && echo "  expression matches SSOT OK"
```
Expected: alle `OK`-Zeilen erscheinen; `diff` kein Output.

---

## Spec-Coverage-Selbstreview

- **Lösung §1 (geteilte ConfigMap)** → Task 1.
- **Lösung §2 (Overlays referenzieren)** → Task 2 + Task 3.
- **Lösung §3 (Dev-Pfad)** → Task 5 (Verifikation-first, Prod-only-Fallback dokumentiert).
- **Lösung §4 (bats-Guard) + Komplementarität** → Task 4 (Parity/Presence/Drift, offline, Wiring + coverage-guard).
- **Risiko SSA-Adoption** → Task 6 (server-side dry-run-diff für beide Brands).
- **Risiko S1-Ratchet** → in der S1-Budget-Tabelle adressiert; alle Edits additiv/außerhalb S1-Limit-Set.
- **Risiko Brand-Literale (S3)** → ConfigMap + bats nutzen `${PROD_DOMAIN}`/Regex, Task 7 Step 6 verifiziert.
- **Akzeptanzkriterien 1-6** → Task 7 Step 8 prüft AK1/2/3/6; AK4 (`workspace:validate`) Task 7 Step 1; AK5 (`test:changed`+`freshness:*`+`test:inventory`) Task 7 Steps 3-6.
- **environments/schema.yaml KEINE Änderung** → bestätigt (MEDIAVIEWER_HOST bereits Z.182).
