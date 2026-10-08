---
title: "massage-tenant p4 — docs-runbook"
ticket_id: T901440
domains: [docs, flux, website, auth]
status: active
---

# massage-tenant p4 — docs-runbook

Partial p4 (role impl, depends_on p2, p3). Nur Doku und Kommentare. Kein Produktcode, kein
`suspend`-Wechsel. Spec: `.agents/plans/massage-tenant/design.md` Abschnitte „Rollout" und „Doku".

Zielformel für alle Freeze-Aussagen: „korczewski-Workspace (Nextcloud, Brett, Collabora, eigene
shared-db, Jobs) eingefroren per T002479; Website (Massagepraxis Vögelsen, BRAND `massage`) und
Pocket ID laufen auf dem korczewski-Slot, für Go-live vorbereitet durch T901440."

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `AGENTS.md` | 155 | n/a (Markdown ohne S1-Limit) |
| `CLAUDE.md` | 89 | n/a (Markdown ohne S1-Limit) |
| `docs/runbooks/credentials-finden.md` | 106 | n/a (Markdown ohne S1-Limit) |
| `docs/website/massage-owner-runbook/README.md` | 160 | n/a (Markdown ohne S1-Limit) |
| `flux/clusters/fleet/ks-korczewski.yaml` | 35 | n/a (YAML ohne S1-Limit) |
| `flux/clusters/fleet/ks-jobs-korczewski.yaml` | 21 | n/a (YAML ohne S1-Limit) |

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Befunde (Ist-Stand, belegt)

- F1 Freeze-Stellen: `AGENTS.md:43`, `AGENTS.md:67`, `CLAUDE.md:38`,
  `docs/runbooks/credentials-finden.md:49`, `flux/clusters/fleet/ks-korczewski.yaml:10-12`,
  `flux/clusters/fleet/ks-jobs-korczewski.yaml:10-11`.
- F2 Guard-Tests: `grep -rn 'T002479\|FROZEN' tests/py` trifft nur
  `tests/py/spec/native_ported/spec/test_p0min_freeze_embed.py:10,40,56` (`FROZEN_COMMIT`,
  anderes Thema). Kein Test prüft den Freeze-Wortlaut in `AGENTS.md`, `CLAUDE.md`,
  `credentials-finden.md` oder den Flux-Kommentaren. Es müssen keine Substrings erhalten bleiben,
  p5 braucht kein Gegenstück für p4.
- F3 Strukturtests auf `ks-korczewski.yaml`, die unverändert bleiben müssen:
  `tests/py/spec/native_ported/spec/test_workspace_deploy.py:511-518` (kein nacktes `wait: true`,
  `healthChecks:` vorhanden), `tests/py/unit/ported/test_flux_healthchecks.py:46`
  (healthCheck-Ziele `shared-db`, `pocket-id` existieren unter `k3d/`),
  `tests/py/spec/native_ported/spec/workspace-deploy/test_flux_secrets_ordering.py:8`
  (`dependsOn flux-sealed-secrets-korczewski`). Darum nur Kommentarzeilen ändern.
- F4 Der Task heißt `env:seal` (`taskfiles/Taskfile.platform.yml:266`, Parameter `ENV`, Default
  `mentolder`). `env:generate` (`:260`) bricht bei vorhandener Datei ab
  (`scripts/env-generate.sh:132`). Die Dateien `environments/.secrets/fleet-mentolder.yaml` und
  `fleet-korczewski.yaml` existieren (`credentials-finden.md:48-49`), die zwei neuen Keys
  `WEBSITE_MASSAGE_DB_PASSWORD` und `POCKET_ID_KORCZEWSKI_DB_PASSWORD` werden deshalb von Hand
  angehängt statt per `env:generate` erzeugt. `env:seal` rotiert nur `workspace-secrets`
  (Beschreibung `Taskfile.platform.yml:267`).
- F5 `docs/website/massage-owner-runbook/README.md` hat Abschnitte 1-11 (letzter: `## 11.
  Performance- und Accessibility-Budgets (T901307)`). Der Go-live-Abschnitt wird als `## 12.`
  angehängt, ohne Umnummerierung.
- F6 `docs/runbooks/pocket-id-bootstrap.md` beschreibt den Bootstrap für `auth.localhost`
  (Schritt 1) und schreibt `POCKET_ID_API_KEY` per `kubectl patch` in `workspace-secrets`
  (Schritt 3). Für korczewski gilt dasselbe mit Namespace `workspace-korczewski`.

## Task 1: Roter Check für die Doku-Zielzustände

Vor den Edits ausführen, beide Checks schlagen fehl.

```bash
export AGENT_LOCK_SID="$(bash scripts/agent-lock.sh mine)"
cd /home/patrick/Bachelorprojekt/.worktrees/massage-tenant-T901440
grep -c 'für Go-live vorbereitet durch T901440' AGENTS.md CLAUDE.md docs/runbooks/credentials-finden.md \
  flux/clusters/fleet/ks-korczewski.yaml flux/clusters/fleet/ks-jobs-korczewski.yaml
grep -c '^## 12\. Go-live' docs/website/massage-owner-runbook/README.md
```

expected: FAIL (alle Zähler 0, Go-live-Abschnitt fehlt). Die dauerhaften Tests liegen in p5
(`tests/py/spec/massage-tenant/test_flux_freeze.py`), der pytest-Aufruf dort:
`bash scripts/pytest-run.sh tests/py/spec/massage-tenant/test_flux_freeze.py`.

## Task 2: Flux-Kommentare präzisieren

**`flux/clusters/fleet/ks-korczewski.yaml`**, Zeilen 10-12 ersetzen (Zeile 13 `suspend: true` und
alles darunter bleibt byte-identisch):

```yaml
  # T002479: Bewusst suspendiert (2026-07-23, bestätigt 2026-07-31) — der korczewski-Workspace
  # (Nextcloud, Brett, Collabora, eigene shared-db, Jobs) bleibt eingefroren (Kosten/Wartung);
  # seine Workloads stehen live auf 0/0 Replicas.
  # Ausgenommen: Website (Massagepraxis Vögelsen, BRAND massage) und Pocket ID laufen seit
  # T901440 auf dem korczewski-Slot über flux-website-korczewski und flux-korczewski-auth,
  # für Go-live vorbereitet durch T901440. Diese Kustomization taut dafür NICHT auf.
  # Vor einem Re-Aktivieren die Suspension in einem separaten Change aufheben.
```

Das ersetzt 3 Kommentarzeilen durch 6, Dateilänge 35 → 38.

**`flux/clusters/fleet/ks-jobs-korczewski.yaml`**, Zeilen 10-11 ersetzen (Zeile 12 `suspend: true`
unverändert):

```yaml
  # T002479: Bewusst suspendiert (2026-07-26, bestätigt 2026-07-31) — korczewski-Workspace
  # eingefroren (Kosten/Wartung). Folgt flux-korczewski, das ebenfalls suspendiert ist.
  # Die Massage-Website auf dem korczewski-Slot (für Go-live vorbereitet durch T901440) braucht keine
  # Jobs aus ./korczewski-jobs.
```

Dateilänge 21 → 22.

Verifikation:

```bash
git diff -U0 flux/clusters/fleet/ks-korczewski.yaml flux/clusters/fleet/ks-jobs-korczewski.yaml | grep '^[+-]' | grep -v '^[+-]\s*#' | grep -v '^+++\|^---'
# erwartet: leere Ausgabe (nur Kommentarzeilen geändert)
grep -c '^  suspend: true$' flux/clusters/fleet/ks-korczewski.yaml flux/clusters/fleet/ks-jobs-korczewski.yaml
# erwartet: je 1
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/test_workspace_deploy.py tests/py/unit/ported/test_flux_healthchecks.py tests/py/spec/native_ported/spec/workspace-deploy/test_flux_secrets_ordering.py
```

## Task 3: AGENTS.md und CLAUDE.md

**`AGENTS.md:43`** (Beispielzeile im Kommando-Block, Spaltenausrichtung beibehalten):

```text
task workspace:deploy ENV=mentolder              # Prod deploy (mentolder live; korczewski-Workspace frozen per T002479)
```

**`AGENTS.md:67`** ersetzen durch:

```text
- **korczewski (BRAND — Workspace FROZEN per T002479, Website vorbereitet)**: Standalone cluster torn down; hosts joined `fleet`. **Workspace FROZEN since 2026-07-23** (Nextcloud, Brett, Collabora, own shared-db, jobs: `ks-korczewski.yaml` / `ks-jobs-korczewski.yaml` `suspend: true`, namespaces scaled to 0). Do not deploy or scale these up. **Exception (T901440):** the Massagepraxis Vögelsen website (`BRAND=BRAND_ID=massage`, `flux-website-korczewski`, ns `website-korczewski`) and its own Pocket ID (`flux-korczewski-auth`, ns `workspace-korczewski`) are configured on the korczewski slot, für Go-live vorbereitet durch T901440. They use the central `shared-db` in ns `workspace` (DBs `website_massage`, `pocket_id_korczewski`).
```

**`CLAUDE.md:38`** ersetzen durch:

```text
- **Brands**: `mentolder` live on the `fleet` cluster (`workspace` ns); `korczewski` workspace (Nextcloud, Brett, Collabora, own shared-db, jobs) **FROZEN per T002479** (`suspend: true`, 0 replicas — do not deploy). Exception: the Massagepraxis website (BRAND `massage`) and Pocket ID are configured on the korczewski slot, für Go-live vorbereitet durch T901440 (`flux-website-korczewski`, `flux-korczewski-auth`).
```

Zeilenanzahl bleibt 155 bzw. 89 (Einzeilen-Ersetzungen). Keine Datei wird erweitert.

Verifikation:

```bash
grep -n 'T002479\|T901440' AGENTS.md CLAUDE.md
# erwartet: AGENTS.md:43, AGENTS.md:67 (T002479 und T901440), CLAUDE.md:38 (beide)
wc -l AGENTS.md CLAUDE.md
# erwartet: 155 und 89
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/repo-structure/test_root_agent_md.py tests/py/evals/test_routing_docs_guard.py
```

## Task 4: credentials-finden.md

**`docs/runbooks/credentials-finden.md:49`** ersetzen durch:

```text
| `fleet-korczewski.yaml` | Prod korczewski: Workspace eingefroren (T002479), aber aktiv für Massage-Website und Pocket ID (T901440): `WEBSITE_MASSAGE_DB_PASSWORD`, `POCKET_ID_KORCZEWSKI_DB_PASSWORD`, `flux-sealed-secrets-korczewski` bleibt aktiv |
```

Zeile 48 (`fleet-mentolder.yaml`) bekommt zusätzlich den Hinweis, dass die zwei Passwörter dort
identisch stehen müssen, weil die zentrale `shared-db` `workspace-secrets` aus mentolder liest:

```text
| `fleet-mentolder.yaml` | Prod mentolder (aktiv); enthält auch `WEBSITE_MASSAGE_DB_PASSWORD` und `POCKET_ID_KORCZEWSKI_DB_PASSWORD` (identisch zu `fleet-korczewski.yaml`, T901440) |
```

Verifikation:

```bash
sed -n 48,49p docs/runbooks/credentials-finden.md
grep -c 'WEBSITE_MASSAGE_DB_PASSWORD' docs/runbooks/credentials-finden.md
# erwartet: 2
wc -l docs/runbooks/credentials-finden.md
# erwartet: 106
```

## Task 5: Go-live-Abschnitt im Massage-Owner-Runbook

An `docs/website/massage-owner-runbook/README.md` am Dateiende (nach der Tabelle in §11 und der
Zeile „Alle fünf Seiten: axe 0 critical/serious gegen denselben Prod-Build.") anhängen:

````markdown

## 12. Go-live auf korczewski.de (T901440)

Die Website läuft auf dem korczewski-Slot (`web.korczewski.de`), der Owner-Login über die eigene
Pocket ID (`auth.korczewski.de`). Der übrige korczewski-Workspace bleibt eingefroren (T002479).
Alle Schritte hier macht der Operator von Hand. Der Agent führt sie nicht aus.

**Go-live bestätigt am:** ____-__-__ (Operator erst nach erfolgreichem Smoke-Test eintragen). Ein Merge allein belegt keinen Live-Betrieb.

Reihenfolge einhalten, jeder Schritt hat einen Prüfbefehl.

### 12.1 Secrets erzeugen und versiegeln

1. Zuerst prüfen, ob die zwei Keys bereits vorhanden sind. Bei vorhandenen Keys die Werte erhalten und zwischen beiden Dateien sicher angleichen, keine Rotation. Nur fehlende Keys erzeugen. Zwei neue Passwörter erzeugen und in beide git-crypt-Dateien mit identischem Wert eintragen
   (`environments/.secrets/fleet-mentolder.yaml` und `environments/.secrets/fleet-korczewski.yaml`,
   Entsperr-Check siehe `docs/runbooks/credentials-finden.md` §2). `task env:generate` bricht bei
   vorhandener Datei ab, deshalb von Hand anhängen:

   ```bash
   WEBSITE_PW=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
   POCKET_PW=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
   for f in fleet-mentolder fleet-korczewski; do
     printf 'WEBSITE_MASSAGE_DB_PASSWORD: "%s"\nPOCKET_ID_KORCZEWSKI_DB_PASSWORD: "%s"\n' \
       "$WEBSITE_PW" "$POCKET_PW" >> "environments/.secrets/${f}.yaml"
   done
   unset WEBSITE_PW POCKET_PW
   ```

2. Beide Umgebungen versiegeln (braucht `kubeseal` und Cluster-Zugriff auf `fleet`):

   ```bash
   task env:seal ENV=fleet-mentolder
   task env:seal ENV=fleet-korczewski
   ```

3. Prüfen, dass die Keys in den SealedSecrets stehen, dann committen und mergen lassen. Flux
   reconciled `flux-sealed-secrets-korczewski` automatisch:

   ```bash
   grep -c 'WEBSITE_MASSAGE_DB_PASSWORD' environments/sealed-secrets/fleet-mentolder.yaml environments/sealed-secrets/fleet-korczewski.yaml
   # erwartet: jeweils > 0 (workspace-secrets plus website-secrets können denselben Key enthalten)
   kubectl --context fleet -n workspace-korczewski get secret workspace-secrets -o jsonpath='{.data.POCKET_ID_KORCZEWSKI_DB_PASSWORD}' | wc -c
   # erwartet: größer 0
   ```

Nach dem zentralen shared-db-Rollout und bevor Owner-Funktionen freigegeben werden, den in p1 erweiterten Bootstrap-/Migrations-Task ausführen:

```bash
task db:migrate ENV=fleet-korczewski
```

Er muss ausschließlich `website_massage` im zentralen Namespace `workspace` initialisieren. Den idempotenten zweiten Lauf und die vorgesehenen Owner-Rechte prüfen.

### 12.2 DNS bei ipv64

Der ipv64-Updater bleibt aus. Drei A-Records setzen, Ziel ist die öffentliche IP des
fleet-Ingress (identisch zu den A-Records von `mentolder.de`):

```bash
INGRESS_IP=$(dig +short mentolder.de A | head -1); echo "$INGRESS_IP"
```

| Name | Typ | Wert | Prüfbefehl |
|---|---|---|---|
| `korczewski.de` | A | `$INGRESS_IP` | `dig +short korczewski.de A` |
| `web.korczewski.de` | A | `$INGRESS_IP` | `dig +short web.korczewski.de A` |
| `auth.korczewski.de` | A | `$INGRESS_IP` | `dig +short auth.korczewski.de A` |

Jeder `dig`-Aufruf muss genau `$INGRESS_IP` liefern. Danach das Zertifikat prüfen (Wildcard
`*.korczewski.de` plus Apex, `workspace-wildcard` in `workspace-korczewski`):

```bash
kubectl --context fleet -n workspace-korczewski get certificate workspace-wildcard
# erwartet: READY True
curl -sSI https://web.korczewski.de | head -1
# erwartet: HTTP/2 200
```

Vor dem ersten Website-Aufruf den bestehenden `tls-sync`-CronJob einmal als Job ausführen und dessen Abschluss prüfen. Er spiegelt nur nach `website-korczewski`:

```bash
kubectl --context fleet -n workspace-korczewski create job tls-sync-massage-initial --from=cronjob/tls-sync
kubectl --context fleet -n workspace-korczewski wait --for=condition=complete job/tls-sync-massage-initial --timeout=120s
kubectl --context fleet -n website-korczewski get secret korczewski-tls
```

### 12.3 Pocket-ID-Admin-Bootstrap

Einmalig nach `docs/runbooks/pocket-id-bootstrap.md`, mit diesen Abweichungen für korczewski:

- Schritt 1 unter `https://auth.korczewski.de/setup` statt `auth.localhost` (Passkey, Chromium).
- Schritt 3 und 4 mit `-n workspace-korczewski` und `--context fleet`
  (`workspace-secrets`, Job `pocket-id-client-seed`).

Der zentrale DB-Initializer legt keinen Pocket-ID-API-Key an. Den API-Key nach dem Bootstrap in der UI erstellen, sicher in der korczewski-Secret-Quelle unter `POCKET_ID_API_KEY` hinterlegen und über `env:seal` versiegeln. Keine Werte in Logs oder Tickets ausgeben. Anschließend den fehlgeschlagenen Seed-Job gezielt erneut erstellen (bestehender Bootstrap-Runbook-Pfad), ohne die suspendierte Workspace-Kustomization zu aktivieren.

Prüfung, dass der Seed-Job lief und die Clients existieren:

```bash
kubectl --context fleet -n workspace-korczewski get job pocket-id-client-seed
# erwartet: COMPLETIONS 1/1
```

### 12.4 Inhaberin-Konto und Gruppe

1. In der Pocket-ID-UI (`https://auth.korczewski.de`) Benutzerkonto der Inhaberin anlegen.
2. Gruppe `workspace-owners` anlegen (falls nicht vorhanden) und die Inhaberin zuordnen. Der
   Owner-Bereich (`/owner/*`) lässt nur Sessions mit dieser Gruppe durch (`OWNER_GROUP`).
3. Prüfung: Login unter `https://web.korczewski.de/owner/anfragen` führt über
   `auth.korczewski.de` zurück in den Owner-Bereich. Ein Konto ohne Gruppe bekommt keinen Zugriff.

Vor Freigabe außerdem rechtliche Angaben, Rechnungssteller und Steuerangaben der Praxis im Owner-Bereich pflegen und mit der bestehenden Massage-Brand-Konfiguration abgleichen. Keine korczewski-Workspace-Identität ungeprüft als Praxisdaten übernehmen.

Vorhandene Apex-Routen mit demselben Host inventarisieren. Eine konkurrierende alte `workspace-ingress-apex` kontrolliert entfernen oder deaktivieren, ohne die eingefrorene Workspace-Kustomization zu aktivieren.

### 12.5 Smoke-Test

1. Auf `https://web.korczewski.de/kontakt` eine Test-Anfrage senden (Service, Slot, Kontakt).
2. Als Inhaberin unter `/owner/anfragen` anmelden und die Anfrage annehmen. Die Bestätigung geht
   an die Gast-Adresse.
3. Unter `/owner/rechnungen` aus dem bestätigten Termin eine Rechnung erstellen
   (Nummer fortlaufend, Pflichtangaben vorhanden).
4. Test-Anfrage und Test-Rechnung per Storno/Neuausstellung bereinigen (§2, §5), nie überschreiben.
5. Im nächsten erfolgreichen zentralen Backup die beiden verschlüsselten Archive für `website_massage` und `pocket_id_korczewski` nachweisen. Ein Log mit „unkonfiguriert/übersprungen“ genügt nach Go-live nicht.

Schlägt Schritt 2 fehl, Pocket ID, Gruppenzuordnung, Seed-Clients, Callback und DB-Verbindung prüfen (§12.3, §12.4). Die öffentliche
Seite samt Anfrageformular bleibt davon unberührt.

### 12.6 Rollback

Die Rollen und Datenbanken `website_massage` und `pocket_id_korczewski` bleiben erhalten.

```bash
flux suspend kustomization flux-website-korczewski -n flux-system
flux suspend kustomization flux-korczewski-auth -n flux-system
flux get kustomizations -n flux-system | grep -E 'korczewski'
# erwartet: flux-website-korczewski und flux-korczewski-auth SUSPENDED True
```

Vor dem Go-live vorhandenen Flux-Inventarbesitz von Pocket ID, PVC und Certificate prüfen. Das alte `flux-korczewski` bleibt suspendiert. Bei späterem vollständigem Auftauen muss der Ressourcenbesitz separat geklärt werden, sonst konkurrieren Kustomizations.

Dauerhaft zurückbauen: in `flux/clusters/fleet/ks-website-korczewski.yaml` und
`flux/clusters/fleet/ks-korczewski-auth.yaml` `suspend: true` setzen (Revert-PR). Flux-Suspend per
CLI wird beim nächsten Merge der Git-Quelle nicht zurückgesetzt, wenn die Datei `suspend: true`
trägt.
````

Außerdem im Kopfabsatz (Zeilen 3-5) keine Änderung. Das bestehende `[PLATZHALTER: ID]`-Schema
bleibt, das Go-live-Datum ist ein ausdrückliches Operator-Feld und kein Platzhalterwort.

Verifikation:

```bash
grep -n '^## 12\. Go-live' docs/website/massage-owner-runbook/README.md
# erwartet: genau 1 Treffer
for h in 12.1 12.2 12.3 12.4 12.5 12.6; do grep -c "^### $h " docs/website/massage-owner-runbook/README.md; done
# erwartet: je 1
grep -c 'dig +short' docs/website/massage-owner-runbook/README.md
# erwartet: 4 (3 Records plus Ingress-IP-Ermittlung)
grep -c 'task env:seal ENV=fleet-' docs/website/massage-owner-runbook/README.md
# erwartet: 2
grep -c 'pocket-id-bootstrap.md' docs/website/massage-owner-runbook/README.md
# erwartet: mindestens 1
test -f docs/runbooks/pocket-id-bootstrap.md && echo link-ok
```

Hinweis zu S3: `docs/` ist nicht Teil des Host-Literal-Gates (nur `fleet/`, `prod*/`,
`components/website/src/`). Die Domains im Runbook sind zulässig.

## Task 6: Finale Verifikation

```bash
export AGENT_LOCK_SID="$(bash scripts/agent-lock.sh mine)"
cd /home/patrick/Bachelorprojekt/.worktrees/massage-tenant-T901440
grep -c 'für Go-live vorbereitet durch T901440' AGENTS.md CLAUDE.md docs/runbooks/credentials-finden.md \
  flux/clusters/fleet/ks-korczewski.yaml flux/clusters/fleet/ks-jobs-korczewski.yaml
# erwartet: je mindestens 1 (credentials-finden.md nennt T901440 ohne diese Formel, dort stattdessen: grep -c T901440 >= 1)
bash scripts/pytest-run.sh tests/py/spec/massage-tenant
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
