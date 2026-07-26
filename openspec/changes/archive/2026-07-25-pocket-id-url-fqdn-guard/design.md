---
ticket_id: T002154
plan_ref: openspec/changes/pocket-id-url-fqdn-guard/tasks.md
status: active
date: 2026-07-25
---

# Design: POCKET_ID_URL FQDN-Guard + Config-Rollout-Trigger

## Purpose (DE)

Der Website-Login auf beiden Brands bricht wiederkehrend, weil zwei unabhängige Lücken sich
gegenseitig verdecken: Ein Taskfile-Fallback schreibt einen namespace-lokalen Kurznamen in
`POCKET_ID_URL`, der aus der `website`-Namespace nicht auflösbar ist — und weil `website-config`
per `envFrom` eingebunden ist, erreicht eine Korrektur der ConfigMap laufende Pods nie. Diese
Änderung schließt beide Lücken und sichert sie mit einer Regression ab.

## Root Cause (verifiziert 2026-07-25, Incident zu T002154)

Pocket ID führt den Login vollständig aus — `webauthn/login/finish` 200, `/api/oidc/authorize` 200
(Code ausgestellt) — aber es folgt **nie** ein `POST /api/oidc/token`. Der serverseitige
Token-Exchange der Website scheitert mit `TypeError: fetch failed` (undici: Verbindung kam nie
zustande, kein HTTP-Fehler) und leitet auf `/404`. Für Nutzende sieht das aus wie
„Auth bestätigt, trotzdem nicht eingeloggt".

Im Prod-Pod gemessen:

| Ziel | Ergebnis |
|---|---|
| `http://pocket-id:1411/.well-known/openid-configuration` | 5/5 `ENOTFOUND` |
| `http://pocket-id.workspace.svc.cluster.local:1411/…` | HTTP 200 |

Die Website läuft in ns `website`, Pocket ID in ns `workspace`. Der Kurzname löst nur
*innerhalb* von `workspace` auf; cross-namespace ist der FQDN zwingend.

### Lücke 1 — Kurzname-Fallback im Taskfile

`Taskfile.yml` setzt an fünf Stellen `POCKET_ID_URL="${POCKET_ID_URL:-http://pocket-id:1411}"`:

| Zeile | Task |
|---|---|
| 2647 | `workspace:deploy` |
| 2807 | `workspace:deploy` |
| 2947 | `workspace:partial-deploy` |
| 3638 | `website:deploy` |
| 3664 | `website:deploy` |

Alle Git-Konfigurationsquellen (`environments/{mentolder,fleet-mentolder,korczewski,fleet-korczewski}.yaml`,
`.github/workflows/build-website.yml`) setzen korrekt den FQDN. Läuft ein Deploy ohne aufgelöstes
Env, greift still der Kurzname-Fallback. Da es **kein** literales `${…}` ist, schlagen die
bestehenden Platzhalter-Assertions aus T001993 nicht an — der Fehlwert sieht plausibel aus.

### Lücke 2 — ConfigMap-Korrekturen erreichen laufende Pods nicht

`website-config` hängt per `envFrom: configMapRef` am Deployment, und das Pod-Template trägt
**keine** Checksum-Annotation. `envFrom`-Werte werden nur beim Containerstart in die
Prozess-Umgebung kopiert (anders als gemountete ConfigMap-*Volumes*, die der kubelet nachzieht).
Live-Zustand war auf **beiden** Brands: ConfigMap = FQDN (korrekt), Pod-Env = Kurzname (kaputt),
der mentolder-Pod lief so seit 37 Stunden.

Der CI-Workflow macht nur `rollout status`, keinen Restart — dass Pods dort trotzdem neu starten,
liegt allein am geänderten Image-Tag. Ein reiner Config-Deploy über das Taskfile erzeugt also
**gar keinen** Rollout.

Daraus entsteht der beobachtete Zyklus: Deploy ohne Env schreibt den Kurznamen → Login kaputt;
eine ConfigMap-Korrektur sieht richtig aus, wirkt aber nicht; erst ein zufälliger Rollout
(Website-Push, Node-Umzug) repariert es — bis zum nächsten Deploy.

## Entscheidungen

### D1 — Fallback: FQDN-Default statt Kurzname

Der Fallback bleibt bestehen, zeigt aber auf den namespace-korrekten FQDN:

```
POCKET_ID_URL="${POCKET_ID_URL:-http://pocket-id.${WORKSPACE_NAMESPACE}.svc.cluster.local:1411}"
```

Bewusst **nicht** fail-closed (`:?`), damit Deploys ohne vollständig aufgelöstes Env weiterlaufen.
Restrisiko: Ist `WORKSPACE_NAMESPACE` ebenfalls leer, entsteht `pocket-id..svc.cluster.local`.
Dieses Restrisiko wird durch die Regression aus D3 abgedeckt, nicht durch den Default selbst.

### D2 — Rollout-Trigger: Checksum-Annotation **nach** envsubst

Verworfen: `configMapGenerator` mit Hash-Suffix. Empirisch widerlegt — der Prod-Pfad ist
`kustomize build prod-fleet/website-<brand> | envsubst | kubectl apply`, Kustomize berechnet den
Hash also über den **unsubstituierten** Text:

```
kustomize build .                      → website-config-9cc9bh8bmc
POCKET_ID_URL=http://pocket-id:1411    → website-config-9cc9bh8bmc   (kaputter Wert)
POCKET_ID_URL=…svc.cluster.local:1411  → website-config-9cc9bh8bmc   (richtiger Wert)
```

Der Hash-Suffix reagiert damit auf Manifest-Änderungen, aber ausgerechnet nicht auf
Wert-Änderungen — also genau nicht auf diesen Fehlerfall. Der Reihenfolge-Konflikt ist
strukturell: Jeder Mechanismus **vor** `envsubst` ist blind für den eingesetzten Wert.

Gewählt: Der Hash wird auf dem fertig substituierten Manifest gebildet und als
Pod-Template-Annotation `checksum/config` gesetzt. Das muss in **beiden** Render-Pfaden passieren
(`Taskfile.yml` → `website:deploy`/`workspace:deploy`, `.github/workflows/build-website.yml`),
sonst überschreibt der eine Pfad die Annotation des anderen und der Rollout entfällt wieder.

Verworfen: `rollout restart` nach jedem Apply — funktioniert, startet aber auch ohne Änderung neu
(kurze Lücke bei 1 Replica).

Verworfen: Deploy-Pfad auf reines Kustomize umbauen — saubere Endform, aber Umbau des gesamten
Website-Deploy-Pfads inklusive CI. Eigenes Ticket, würde diesen Fix blockieren.

### D3 — Regression: FQDN-Assertion auf dem gerenderten Manifest

Der Test prüft den **gerenderten** Wert, nicht die Taskfile-Zeile — damit deckt er auch andere
Apply-Pfade ab (z. B. rohes `kustomize build`, vgl. T002108). Zwei Assertions:
`POCKET_ID_URL` enthält `.svc.cluster.local`, und der Wert enthält kein leeres Namespace-Segment
(`pocket-id..svc`), womit auch das D1-Restrisiko abgedeckt ist.

## Scope

**In:** `Taskfile.yml` (5 Fallback-Stellen + Checksum-Injektion in 2 Deploy-Tasks),
`k3d/website.yaml` (Annotations-Platzhalter im Pod-Template),
`.github/workflows/build-website.yml` (Checksum-Injektion, beide Brand-Jobs),
`tests/spec/auth-sso.bats` (Regression).

**Out:** Umbau des Deploy-Pfads auf reines Kustomize. Die E2E-Suite gegen Prod (T002155).
Der bereits live durchgeführte `rollout restart` — Symptombehandlung, hier nicht zu wiederholen.

## Edge-Cases

- **Dev-Pfad ohne Kustomize:** `website:deploy` rendert im Dev-Zweig `envsubst < k3d/website.yaml`
  direkt. Die Checksum-Injektion muss in beiden Zweigen greifen, nicht nur im Prod-Overlay-Zweig.
- **Beide Brands:** `build-website.yml` hat zwei getrennte Jobs (mentolder ~Z.199, korczewski ~Z.346).
  Eine Änderung an nur einem Job reproduziert exakt die Allowlist-Drift aus T001993.
- **Server-side apply:** Der CI-Pfad nutzt `kubectl apply --server-side --force-conflicts`.
  Die Annotation muss vor dem Apply im Manifest stehen, nicht nachträglich gepatcht werden,
  sonst kollidiert der nächste Apply mit dem Field-Manager.
- **`workspace:partial-deploy`** (Z. 2947) rendert ebenfalls, deployt aber selektiv — der
  Fallback muss dort mitkorrigiert werden, auch wenn die Website nicht immer Teil des Ziels ist.

## Verwandt

Gleiche Fehlerklasse wie T001933 (brett bekam denselben Kurznamen) und T001993/T002108
(Deploy-Pfad ohne vollständige Substitution). **Nicht** T001327/T001328/T001435 — das sind
Secret- und Rate-Limit-Ursachen und hier durch `fetch failed` (Verbindungsebene) ausgeschlossen.
