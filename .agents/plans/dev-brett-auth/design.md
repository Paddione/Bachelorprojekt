---
title: Dev-Brett Auth Design
ticket_id: T901678
domains: [infra, security, test]
status: design
---

# Dev-Brett Auth Design

## Entscheidungen

Standardbibliothek-Python-CLI im Operator-Kontext; default read-only --check, ausdrücklich --apply für genehmigte Provisionierung. Kubectl-Kontext fleet und Ziel workspace-dev fest begrenzen. Provider-URL aus environments/dev-cluster.yaml/PROD_DOMAIN bestimmen, HTTP nur für expliziten localhost-Portforward erlauben, Redirects unterbinden, Timeouts und Größenlimits setzen. API-Key ausschließlich mit subprocess stdout=PIPE aus sanctioned workspace/workspace-secrets lesen; nie über argv, stdout, Logs oder Exceptions ausgeben. Kein dauerhafter API-Key im Dev-Namespace.

Nur Client-IDs brett-dev und workspace-dev erlaubt. brett-dev Callback https://BRETT_DEV_HOST/auth/callback; workspace-dev Callback https://DEV_DOMAIN/oauth2/callback. Vor jedem CREATE alle Clients und vorhandenen Geheimnisse vollständig prüfen. Bestehende Clients: ausschließlich lesen, exakte IDs/Callbacks prüfen, bekannten Secret gegen Provider mit kontrolliertem token-endpoint invalid-code Probe validieren (invalid_client ist Drift); kein PUT, DELETE oder secret POST. Probe darf keine Session erzeugen und braucht dokumentierte Pocket-ID-Fehlersemantik; bei uneindeutiger Antwort abbrechen.

Receipt außerhalb Repository unter ~/.local/state/dev-brett-auth, Verzeichnis 0700, Datei 0600, sichere atomare/fsync Writes ohne Symlink-Follow. Vor CREATE Receipt anlegen, nach CREATE ID sofort sichern, nach erfolgreichem secret POST Wert sofort sichern. Erst dann seal. Bei existierendem Client ohne sicher bekannten passenden Secret abbrechen. Ist secret POST möglicherweise erfolgt, aber Antwort verloren, niemals nochmals POST: Operator-Eskalation. Bei lokalem Receipt mit gültigem Secret sind weitere Läufe reine Verifikation/Seal; kein Rotieren. Private Receipt nach Fehler behalten.

BRETT_SESSION_SECRET stammt aus vorhandenen environments/.secrets/dev.yaml/BRETT_OIDC_SECRET; keine Zufallswerte. Neue Provider-Client-Secrets ausschließlich bei Neuanlage erzeugen. Laufzeit-Secrets dürfen nur lesend abgeglichen werden. Strict Fleet Seal für namespace workspace-dev/name dev-oidc-secrets mit live gefetchtem Controller-Cert; kein env:seal ENV=dev (dies zeigt auf devmesh). Erst nach Freigabe entsteht k3d/dev-stack/dev-oidc-secrets.yaml mit encryptedData, nie leeres oder plaintext Secret stagen. Provider-Generierung plus Receipt und SealedSecret ist transaktional nicht atomar: dokumentierte fail-closed Recovery gehört zum Design.

Dev-Brett erhält POCKET_ID_URL, POCKET_ID_PUBLIC_URL, BRETT_CLIENT_ID=brett-dev, BRETT_PUBLIC_URL und passende SecretRefs. Dev-Gate liest nur DEV_WORKSPACE_OIDC_SECRET aus dediziertem Secret, Cookiequelle bleibt unverändert. GitOps resource-Verknüpfung erfolgt erst wenn vollständiger SealedSecret vorhanden und validiert ist.

Bestehendes Playwright-Setup erhält BRETT_AUTH_STATE_PATH als optionalen Override (Default unverändert). Vor storageState Board plus tatsächliche Session statt bloß Rückkehr zur Base-URL prüfen. Dev/Prod States strikt getrennt, Auth-Dateien nie committen. Helper/current-context in tests/e2e/lib/oidc.ts verwendet impliziten Kontext: Operator vor Setup fleet sicherstellen; kein Scope-Edit dieses Helpers.

## Freigabe

Reviewbarer Helper/Draft vor Freigabe; zentrale Pocket-ID-Neuanlage ist Prod-State-Mutation und erfordert gemäß AGENTS ausdrückliche Operator-Freigabe. Kein Merge aktiver SecretRefs ohne vollständigen Ciphertext. Keine Secretrotation, kein Cluster-apply, kein Dev-DB-Refresh, kein vollständiger workspace deploy.
