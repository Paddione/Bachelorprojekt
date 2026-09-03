---
title: "p2-penpot-secrets — Penpot Secret-Keys PROD+Staging (T900030)"
ticket_id: T900030
domains: [fleet-operations]
status: active
target_files: ["k3d/penpot.yaml", "k3d/shared-db.yaml", "environments/sealed-secrets/fleet-mentolder.yaml", "environments/sealed-secrets/staging.yaml"]
---

# p2-penpot-secrets — Penpot Secret-Keys PROD+Staging (T900030)

## Goal

Der Penpot-Stack blockiert PROD (`workspace`) und Staging (`workspace-staging`) seit 3d11h und haelt
damit die Flux-Reconciliation (flux-staging Ready=False) auf. Die Secrets
`workspace/workspace-secrets` und `workspace-staging/workspace-secrets` fehlen die Keys
`PENPOT_MINIO_SECRET_KEY`, `PENPOT_DB_PASSWORD` und `SESSIONS_CRON_TOKEN`.

## Root-Cause / Befund

- Events: "couldnt find key PENPOT_MINIO_SECRET_KEY in Secret workspace/workspace-secrets",
  "couldnt find key PENPOT_DB_PASSWORD in Secret workspace-staging/workspace-secrets",
  "couldnt find key SESSIONS_CRON_TOKEN in Secret workspace-staging/workspace-secrets".
- Zwei parallele kaputte ReplicaSets pro Namespace (penminio ImagePullBackOff, penpot Init:1/2)
  wurden nie aufgeraeumt.
- Die Schema-Keys existieren bereits (`environments/schema.yaml`:629/643/1049), die SealedSecrets
  enthalten die Keys teils bereits (`fleet-mentolder.yaml`:129/131, `staging.yaml`:38/39) — die
  live-Secrets in den Ziel-Namespaces sind jedoch veraltet, d.h. env:seal wurde nach dem Hinzufuegen
  der Keys fuer fleet/staging nicht (vollstaendig) ausgefuehrt bzw. angewendet.

## File Structure

```
k3d/penpot.yaml                                      # MODIFIED: Secret-Key-Referenzen abgleichen (falls noetig)
k3d/shared-db.yaml                                   # MODIFIED: Penpot-Role/DB-Zugriff (falls noetig)
environments/sealed-secrets/fleet-mentolder.yaml     # REGENERATED: env:seal ENV=mentolder
environments/sealed-secrets/staging.yaml             # REGENERATED: env:seal ENV=staging
tests/spec/fleet-operations/penpot-secret-keys.bats  # NEW (in p7): Guard
```

## Tasks

1. **Investigate:** Bestaetigen, welche Keys in welchem live-Secret fehlen:
   `kubectl --context fleet -n workspace get secret workspace-secrets -o jsonpath='{.data}'` und
   analog fuer `workspace-staging` (nur Key-Namen, keine Werte loggen). Zusaetzlich prüfen, ob
   `SESSIONS_CRON_TOKEN` in beiden Namespaces zur `sessions-purge`-DB-Logik benoetigt wird.
2. **Schema-Vollstaendigkeit:** Sicherstellen, dass `environments/schema.yaml` die drei Keys als
   `required` fuehrt (PENPOT_DB_PASSWORD, PENPOT_MINIO_SECRET_KEY) und `SESSIONS_CRON_TOKEN`
   (bereits vorhanden). Keine neuen Keys ohne Plaintext hinzufuegen.
3. **env:seal neu ausfuehren:** `task env:seal ENV=mentolder` und `task env:seal ENV=staging`
   (nach Ruecksprache mit dem Operator wegen Sealing-Key; SealedSecrets fuer die Shared-Namespaces
   laufen ueber den owner_brand-Mechanismus, siehe env-seal.sh SHARED_NAMESPACES). Die regenerierten
   `environments/sealed-secrets/*.yaml` committen.
4. **Verwaiste ReplicaSets prunen:** Nach bestandenem Vorcheck die redundant/verwaisten Penpot- und
   penminio-ReplicaSets in PROD und Staging per `kubectl delete rs` entfernen (bestehende geeignete
   ReplicaSets, die auf die eingefrorenen/alten Images zeigen). Dry-run zuerst: `kubectl get rs -n
   workspace | grep -E 'pen(minio|pot)'`.
5. **Verify:** Nach Deploy gilt: keine "couldnt find key"-Events mehr, Penpot/penminio-Pods Running,
   `flux-staging` Ready=True.

## Verify

Der BATS-Guard `penpot-secret-keys.bats` prueft, dass Schema + regenerierte SealedSecrets die drei
Keys enthalten (und nicht leer sind):

```bash
# Requirement: Penpot-Secret-Keys sind in den workspace-secrets vollständig
# expected: FAIL (vor env:seal fehlen Keys in den SealedSecrets/der Anwendung)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/penpot-secret-keys.bats
```

## Ausfuehrungsergebnis 2026-09-03: NICHT umgesetzt

**Die Root-Cause-Annahme dieses Partials ist widerlegt.** Der Plan nimmt an,
`env:seal` sei fuer fleet/staging nicht (vollstaendig) gelaufen. Gemessen gegen
den fleet-Cluster:

```bash
kubectl --context fleet -n workspace get sealedsecret workspace-secrets \
  -o jsonpath='{.status.conditions[0].message}'
# -> no key could decrypt secret (PENPOT_DB_PASSWORD, POCKET_ID_PENPOT_SECRET,
#    PENPOT_MINIO_SECRET_KEY, PENPOT_SECRET_KEY)
```

Die SealedSecrets **enthalten** die Keys (`fleet-mentolder.yaml`, `staging.yaml`),
und der Repo-Cert ist aktuell — Fingerprint identisch mit dem Live-Controller:

```bash
for c in environments/certs/*.pem; do openssl x509 -in "$c" -noout -fingerprint -sha256; done
kubeseal --context fleet --controller-namespace sealed-secrets \
         --controller-name sealed-secrets --fetch-cert \
  | openssl x509 -noout -fingerprint -sha256
# beide: 7B:0C:E0:70:EA:35:42:13:E6:4E:FA:A4:8C:EE:AC:E8:66:71:BA:4A:5F:34:79:22:C9:5C:8F:5A:3B:4F:66:5C
```

Der Live-Ciphertext ist byte-identisch mit `fleet-mentolder.yaml`, d.h. Flux
liefert genau das aus, was im Repo steht. Die uebrigen 117 Keys entschluesseln
sauber — nur diese vier nicht. "no key could decrypt" bei passendem Cert heisst
Scope-/Label-Mismatch: die vier Werte wurden ausserhalb der Pipeline von Hand
gesealt (Commit 17794adbe) und tragen ein anderes namespace/name-Label.

Bestaetigt wird das dadurch, dass die vier Keys in **keiner**
`environments/.secrets/<env>.yaml` stehen (`generate: true` im Schema) —
`scripts/env-seal.sh` kann sie also gar nicht erzeugt haben, und ein erneutes
`task env:seal` wuerde sie ersatzlos **entfernen**, nicht reparieren.

**Warum hier gestoppt:** Der korrekte Weg ist `task env:generate` fuer die vier
Keys plus `task env:seal` fuer mentolder und staging — also das Erzeugen und
Ausrollen neuer Produktiv-Secrets, inklusive `PENPOT_DB_PASSWORD`, an dem die
shared-db-Rolle haengt. Das ist eine Rotation, deren Korrektheit CI nicht
verifizieren kann (CI kann nicht entschluesseln), sie faellt in die
security-Domaene und ueberschneidet sich mit dem parallelen Batch T900042.
Diese Entscheidung steht dem ausfuehrenden Agenten nicht zu.

**Kein Guard-Test angelegt.** Der geplante Guard (Schema + SealedSecrets
enthalten die drei Keys) waere sofort gruen gewesen, ohne dass der Defekt
behoben ist — genau die Fehlerklasse "Konfiguration statt Laufzeit" aus
`tests/CLAUDE.md` (T003548): ein RED-Lauf, der gruen ist, ist ein Befund am
Test.
