---
title: Penpot-Ingress-Konflikt beheben und Penpot auf design.mentolder.de live bringen
ticket_id: T900009
domains:
  - bachelorprojekt-infra
  - bachelorprojekt-security
status: plan_staged
---

# Penpot-Ingress-Konflikt und design.mentolder.de — Implementation Plan

## File Structure

| Datei | Änderung |
|---|---|
| `tests/spec/fleet-operations/penpot-manifests.bats` | erweitern — Guards für Ingress-Eindeutigkeit unter envsubst, benannte `penminio`-Ports, einzelner `patches:`-Key |
| `prod/kustomization.yaml` | `$patch: delete` für `workspace-ingress-penpot` ergänzen |
| `k3d/penpot.yaml` | `penminio`-Service: beide Ports benennen (`api`, `console`) |
| `prod-fleet/mentolder/kustomization.yaml` | zwei `patches:`-Blöcke zu einem zusammenführen |
| `environments/.secrets/mentolder.yaml` | `PENPOT_DB_PASSWORD`, `PENPOT_SECRET_KEY`, `PENPOT_MINIO_SECRET_KEY` ergänzen |
| `environments/sealed-secrets/mentolder.yaml` | regeneriert durch `task env:seal ENV=mentolder` |
| `docs/runbooks/freetoken-native.md` | OpenDesign-Abschnitt präzisieren (FreeToken-HTTP kann kein Vision; LM-Studio-Messreihe) |
| `docs/runbooks/penpot.md` | neu — Betrieb, OIDC-Flow, Brand-Scope, Wiederanlauf |

## Task 1 — Failing Tests schreiben (RED)

Die bestehende Datei `tests/spec/fleet-operations/penpot-manifests.bats` um drei Guards
erweitern. Alle drei müssen gegen den aktuellen Stand **fehlschlagen** — sie beschreiben
genau die drei Defekte.

1. **Ingress-Eindeutigkeit unter envsubst.** Der Test rendert `prod-fleet/mentolder` mit
   ersetzten Variablen und zählt Ingresses namens `workspace-ingress-penpot`. Erwartet: genau
   eines, mit Host `design.<PROD_DOMAIN>`. Der Test MUSS `envsubst` anwenden — ohne
   Variablenersetzung tritt der Fehler nicht auf und der Test wäre wertlos.
   Verfügbarkeits-Guard voranstellen:
   `command -v envsubst >/dev/null 2>&1 || skip "envsubst not installed"`
   (in CI vorhanden prüfen: `grep -rn 'envsubst' .github/workflows/`)

2. **`penminio`-Ports benannt.** Prüft, dass der Service `penminio` in `k3d/penpot.yaml` für
   beide Ports ein nicht-leeres `name` trägt.

3. **Ein `patches:`-Key.** Prüft, dass `prod-fleet/mentolder/kustomization.yaml` genau einen
   `patches:`-Schlüssel auf oberster Ebene enthält.

Ausführen und den roten Zustand belegen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/penpot-manifests.bats
# expected: FAIL — drei neue Assertions schlagen fehl, die bestehenden bleiben grün
```

## Task 2 — Die drei Build-Blocker beheben (GRÜN)

**2a — Ingress-ID-Konflikt (`prod/kustomization.yaml`).** Einen `$patch: delete`-Eintrag für
`workspace-ingress-penpot` ergänzen. Dem vorhandenen Muster in Zeile 105–122 folgen, das
dasselbe bereits für `workspace-ingress` und `workspace-ingress-internal` tut — Form und
Einrückung übernehmen, nicht neu erfinden. Die brandspezifischen `penpot-ingress-route.yaml`
bleiben unverändert unter `resources:` und sind nach dem Delete die einzige Quelle.

```bash
source scripts/env-resolve.sh mentolder >/dev/null
kubectl kustomize prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone \
  | envsubst | grep -c 'name: workspace-ingress-penpot'   # erwartet: 1
```

**2b — `penminio`-Ports (`k3d/penpot.yaml`).** Beide Ports benennen: `api` für 9000 (S3-API),
`console` für 9001 (Web-Konsole). Prüfen, ob andere Manifeste diese Ports per Nummer oder per
Name referenzieren — bei Referenz per Name müssen die Namen dazu passen.

**2c — Doppelter `patches:`-Schlüssel (`prod-fleet/mentolder/kustomization.yaml`).** Die zwei
Blöcke zu einem zusammenführen (`bge-hosts-patch.yaml`, `studio-patch.yaml`,
`brett-patch.yaml`). **Vorher feststellen, was der bislang ignorierte Patch bewirkt hätte:**
Render mit und ohne `bge-hosts-patch.yaml` vergleichen. Korrigiert er BGE-Hosts, die heute
falsch im Cluster stehen, gehört dieses Ergebnis in die Abnahme von Task 5 — sonst ändert
dieser Schritt unbemerkt Laufzeitverhalten.

## Task 3 — Penpot-Secrets für mentolder anlegen

Drei Werte in `environments/.secrets/mentolder.yaml` ergänzen: `PENPOT_DB_PASSWORD`,
`PENPOT_SECRET_KEY`, `PENPOT_MINIO_SECRET_KEY`. Werte kryptografisch zufällig erzeugen, nicht
aus anderen Umgebungen kopieren.

```bash
task env:validate ENV=mentolder
task env:seal ENV=mentolder
```

Anschließend `environments/sealed-secrets/mentolder.yaml` committen. Die Klartextdatei ist
git-crypt-verschlüsselt und wird ebenfalls committed — das ist im Repo so vorgesehen.

**Vorbedingung:** git-crypt muss entsperrt sein. Stand 2026-08-30 ist es das; der Key liegt
unter `~/.local/share/git-crypt/keyfile` und ist identisch mit `.git/git-crypt/keys/default`.
Kontrolle vor dem Start: `environments/.secrets/mentolder.yaml` darf nicht mit dem
`\x00GITCRYPT`-Header beginnen.

**Bekannte Ausnahme:** `environments/.secrets/.ssh/config` lässt sich mit diesem Key nicht
entschlüsseln (`encrypted file has been tampered with`). Diese Datei nicht anfassen; sie
blockiert `env:seal` nicht, verhindert aber ein Auschecken des gesamten Secrets-Baums in
frischen Worktrees.

## Task 4 — Ressourcen prüfen, dann Rollout und Flux-Wiederanlauf

**Vor** dem Rollout gegen den laufenden Cluster prüfen, ob Penpot unterkommt: Backend,
Frontend, Exporter, Redis und MinIO mit PVC kommen hinzu, die Metadaten liegen in der
geteilten `shared-db`.

```bash
kubectl --context fleet top nodes
kubectl --context fleet get pvc -n workspace
kubectl --context fleet get storageclass
```

Node-Affinity gegen die `fleet-common`-Komponente abgleichen: Penpot braucht keine GPU und
gehört auf einen Worker, nicht auf eine Control-Plane-Node.

Danach mergen und den Flux-Pfad durchlaufen lassen (pull-based, kein `workspace:deploy`).
Reconcile beobachten, bis alle vier Kustomizations grün sind:

```bash
kubectl --context fleet get kustomization -n flux-system
# erwartet READY=True: flux-mentolder, flux-mentolder-jobs, flux-staging, flux-korczewski
kubectl --context fleet get pods -n workspace -l app=penpot
```

`flux-korczewski` mitprüfen: es hängt derzeit auf der älteren Revision `c3aa8f70` und zieht
mit diesem Merge erstmals den korrigierten Stand.

## Task 5 — Abnahme: Erreichbarkeit, TLS und OIDC end-to-end

1. **DNS und TLS**: `design.mentolder.de` löst auf die fleet-IPs auf, das Zertifikat deckt
   den Host ab.

   ```bash
   dig +short design.mentolder.de
   curl -sSI https://design.mentolder.de/ | head -3   # erwartet: kein Traefik-404
   ```

2. **OIDC-Client**: Der `pocket-id-client-seed`-Job ist durchgelaufen und hat den
   Penpot-Client mit Redirect `https://design.mentolder.de/api/external-auth` angelegt.

   ```bash
   kubectl --context fleet logs -n workspace job/pocket-id-client-seed | grep -i penpot
   ```

3. **Login end-to-end**: Anmeldung über Pocket ID im Browser durchspielen, bis eine
   Penpot-Session besteht. Dieser Schritt ist manuell und Teil der Abnahme — ohne ihn ist
   nicht belegt, dass der Dienst hinter Authentifizierung steht.

4. **Negativprobe**: Ein nicht angemeldeter Aufruf darf keine Projektdaten liefern.

## Task 6 — Runbooks schreiben

**`docs/runbooks/penpot.md` (neu)**: Betrieb des Dienstes — Komponenten, Datenhaltung
(shared-db + MinIO-PVC), OIDC-Flow über Pocket ID, Wiederanlauf, und der bewusst gesetzte
Brand-Scope: mentolder live, korczewski hat Ingress und Domain-Variablen, aber keine
Secrets — Penpot startet dort deshalb nicht.

**`docs/runbooks/freetoken-native.md` (Nachtrag)**: Der Abschnitt „OpenDesign als
BYOK-Client" aus T900008 wird präzisiert. Nach Mess-Konvention T002717 gehören die Befehle
mit in den Text:

- FreeToken kann über HTTP **grundsätzlich kein Vision** — für kein Modell und mit keinem
  Checkpoint. Belegstelle: `freetoken/server/generation.py:240`, `_flatten_text_parts` wirft
  bedingungslos bei jedem Nicht-Text-Part, ohne Modell- oder Flag-Prüfung. Die bisherige
  Formulierung „nimmt Bildinhalte noch nicht verlässlich an" ist zu schwach.
- `qwen3_5_moe` trägt in FreeToken `vision_config=None` („text-only milestone");
  `FREETOKEN_LOAD_VISION` greift nur in `gemma4` und `minimax_m3`.
- Der funktionierende Weg ist LM Studio auf `:1234` mit `gemma-4-26b-a4b-it`
  (`type: "vlm"`, `capabilities: ["tool_use"]`), Vision 4/4 Merkmale erkannt.
- Messreihe (RTX 5070 Ti 16 GB, 128k Kontext, K `q8_0` / V `q4_0`, `mmproj-F16`):

  | Quant | offloadRatio | Durchsatz | VRAM-Reserve |
  |---|---|---|---|
  | MXFP4_MOE | 0,76 | 33,1 tok/s | 772 MiB |
  | IQ4_XS | 0,90 | 44,0 tok/s | 1328 MiB |
  | IQ4_XS | 0,95 | 50,1 tok/s | 579 MiB, ein Lauf brach ab |

- **Gegenintuitive Erkenntnis, die dokumentiert gehört:** Mehr GPU-Offload ist unterhalb
  einer VRAM-Reserveschwelle **langsamer**. MXFP4 lieferte bei `0,82` nur 26,8 tok/s
  (350 MiB Reserve), bei `0,76` dagegen 33,1 tok/s. Das Optimum liegt knapp unterhalb des
  Limits, nicht am Limit.
- **Fallstricke:** FreeToken und LM Studio können nicht gleichzeitig laden. FreeToken sauber
  stoppen NICHT über `restart-freetoken.ps1 -Stop` — das findet eine von der Desktop-App
  gestartete Engine nicht, weil sie als `python.exe` unter einem `ft.exe daemon` läuft.
  Stattdessen die Daemon-Control-API: `POST http://127.0.0.1:1900/engine/stop`, Start über
  `POST /engine/start` mit `{model, port, args}`.
- LM Studio löst Nicht-Standard-Quantnamen (`MXFP4_MOE`, `UD-IQ4_XS`) nicht als Varianten
  auf und zeigt `@?`. Abhilfe: die Variante in einen eigenen `publisher/repo`-Ordner legen —
  sie wird dann sofort als eigenes Modell erkannt, ohne App-Neustart.

## Task 7 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich der vollständige BATS-Lauf der berührten Spec und ein abschließender Blick auf
den Cluster:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/penpot-manifests.bats
tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso/penpot-oidc.bats
kubectl --context fleet get kustomization -n flux-system
```

Abnahmekriterium: alle vier Kustomizations `READY=True`, `design.mentolder.de` liefert
Penpot hinter TLS, und der OIDC-Login wurde einmal manuell erfolgreich durchlaufen.
