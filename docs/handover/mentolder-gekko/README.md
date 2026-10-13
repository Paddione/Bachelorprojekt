# Übergabe Mentolder-Prod → Gekko (T016564)

Ziel: Die Mentolder-Produktionsumgebung liegt als eigenständiges Repo vor und
kann an Gekko übergeben werden. Umfang: Prod-only-Manifeste, Secrets per
bestehendem git-crypt-Schlüssel (keine Rotation).

## Stand

- Export-Skript: [scripts/export-mentolder-prod.sh](../../scripts/export-mentolder-prod.sh)
- Datei-Inventar mit Begründung: [INVENTORY.md](INVENTORY.md)
- Neue-Repo-Vorlagen: [templates/](templates/)
- Verifikation: Export nach `/tmp` + Render-Äquivalenzbeweis (siehe unten),
  vor dem PR ausgeführt.

## Ablauf für Patrick (Ersteller)

1. Neues (privates oder öffentliches) GitHub-Repo anlegen, z. B.
   `mentolder-prod`. Öffentlich ist möglich: Klartext-Secrets liegen nur
   git-crypt-verschlüsselt vor.
2. Export erzeugen:
   `bash scripts/export-mentolder-prod.sh --out /tmp/mentolder-prod`
3. Im Ziel-Repo initial committen und pushen (`main`).
4. git-crypt-Schlüssel an Gekko übergeben — Verfahren nach
   `docs/runbooks/git-crypt-key-distribution.md` (im Export enthalten).
   Schlüssel NIE per unverschlüsselter Mail/Chat; Übergabe bestätigen lassen.
5. Repo-Zugang für Gekko einrichten (Write), GHCR-Pull-Zugang für die
   bestehenden Images (`paddione/website`, `paddione/workspace-brett`,
   `paddione/studio-server`, `paddione/mcp-node`) prüfen oder eigene
   Image-Versorgung vereinbaren (siehe Gekko-Checkliste Punkt 2).

## Checkliste für Gekko (Empfänger)

1. `__GEKKO_*__`-Platzhalter ersetzen (alle Fundstellen):
   - `flux/clusters/fleet-gekko/flux-instance.yaml` und `source.yaml`:
     `__GEKKO_GIT_URL__` = URL des neuen Repos.
   - `flux/clusters/fleet-gekko/oci-source.yaml`: `__GEKKO_OCI_ARTIFACT_URL__`
     und `__GEKKO_WORKFLOW_SUBJECT__` (escapte Owner/Repo-Punkte wie im
     Kommentar beschrieben).
   - `Taskfile.yml` und `.github/workflows/render-fleet-artifact.yml`:
     `__GEKKO_GHCR_OWNER__`, `__GEKKO_ARTIFACT_NAME__`.
   - Kontrolle: `grep -rn __GEKKO_ .` muss leer sein.
2. Image-Versorgung klären: Entweder weiter die `ghcr.io/paddione/*`-Images
   nutzen (Pull-Rechte + `WEBSITE_IMAGE_DIGEST`/`BRETT_IMAGE_DIGEST` in
   `environments/fleet-mentolder.yaml` aktuell halten) oder eigene Images
   bauen und Digests umstellen. Ohne gültige Digests bleibt der
   Placeholder-Guard rot (fail-closed, T004041).
3. git-crypt entsperren (`git-crypt unlock <keyfile>`), dann
   `task manifests:validate` und `task flux:render` lokal prüfen.
4. CI-Secrets im neuen Repo setzen: `GH_PAT` (GHCR-Push), `FLUX_WEBHOOK_URL`,
   `FLUX_WEBHOOK_TOKEN` (optional, beschleunigt nur den Reconcile),
   Repo-Variable `FLUX_ENABLED=true`.
5. Cluster-Bootstrap: flux-operator installieren, `ghcr-auth`-Secret
   (SealedSecret, im `flux-system`-Namespace) und FluxInstance aus
   `flux/clusters/fleet-gekko/` anwenden. Die SealedSecrets unter
   `environments/sealed-secrets/fleet-mentolder.yaml` entschlüsselt der
   bestehende Controller — kein Reseal nötig, solange dessen Schlüssel
   (Backup: `environments/.secrets/sealed-secrets-key.fleet.yaml`) gilt.
6. Ersten CI-Lauf abwarten (Render → Push → Cosign-Signatur), dann
   `flux get kustomizations` und `flux events` prüfen. Bei `NotReady`:
   zuerst OCI-Signatur-Identität (`oci-source.yaml`) gegen die tatsächliche
   Workflow-Identität halten — das ist die häufigste Fehlerquelle nach
   einem Repo-Umzug.

## Secrets-Matrix

- `environments/.secrets/fleet-mentolder.yaml` (Ciphertext im Repo):
  Live-Secrets, lesbar nur mit dem übergebenen git-crypt-Schlüssel.
- `environments/sealed-secrets/fleet-mentolder.yaml` (Klartext im Repo):
  nur mit dem Controller-Schlüssel entschlüsselbar; unkritisch zu teilen.
- Bootstrap-Secrets des Gekko-Clusters (`ghcr-auth`, Webhook-Token) sind
  NICHT im Export — Gekko legt sie neu an (Punkt 5).
- `k3d/secrets.yaml`, `k3d/backup-secrets.yaml`: Dev-Platzhalter, werden im
  Prod-Pfad per `$patch: delete` entfernt (SealedSecrets sind führend).

## Was nach dem Split zu beachten ist

- Upstream-Änderungen an den Kustomize-Basen (`k3d/`, `prod/`) fließen nicht
  mehr automatisch ein — Patches müssen manuell portiert werden, bis ein
  Sync-Prozess vereinbart ist.
- Die Cosign-Verify-Identität bindet das Artefakt an genau ein Repo und einen
  Workflow; jeder erneute Umzug erfordert Schritt 1 und 6 erneut.
- SealedSecrets-Rotation auf Clusterseite macht die exportierte
  `fleet-mentolder.yaml` ungültig — dann neu sealen (`env-seal.sh`).

## Verifikation dieser Chore (Nachweis, kein Versprechen)

- `scripts/export-mentolder-prod.sh --out /tmp/mentolder-prod-test` läuft
  fehlerfrei durch und schreibt `MANIFEST.sha256`.
- Render-Äquivalenz: `kustomize build` aller vier Overlays
  (`platform`, `mentolder`, `website-mentolder`, `coturn`) liefert im
  Export-Baum byte-identische Ausgaben wie im Voll-Repo; die kopierten
  SealedSecrets- und Env-Dateien sind per SHA256 identisch.
- `task test:changed` + `task freshness:check` + `task workspace:validate`
  sind vor dem PR grün (Verify-Block).
