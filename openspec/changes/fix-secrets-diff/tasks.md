## 1. Re-seal workspace-secrets mit korrekten Prod-Werten

- [ ] 1.1 `task env:seal ENV=mentolder` ausführen — erzeugt korrekte encryptedData für workspace-secrets
- [ ] 1.2 Commit und Push des aktualisierten `environments/sealed-secrets/mentolder.yaml`

## 2. Koordinierte Anwendung auf Prod (mentolder)

- [ ] 2.1 SealedSecret anwenden: `kubectl apply -f environments/sealed-secrets/mentolder.yaml` (setzt neue encryptedData)
- [ ] 2.2 DB-Passwörter syncen: `task workspace:sync-db-passwords ENV=mentolder` (führt ALTER USER für alle vier DB-Rollen + Nextcloud config.php-Patch)
- [ ] 2.3 Pods neustarten: `kubectl -n workspace rollout restart deploy` — Applikationen lesen korrekte Passwörter aus den Secrets
- [ ] 2.4 Verifikation: Website-Login testen (`/api/auth/callback`), Nextcloud-Zugriff, Vaultwarden, Pocket-ID

## 3. Dokumentation

- [ ] 3.1 Ticket T001961 schließen mit resolution=fixed, Referenz auf den Fix-PR
- [ ] 3.2 Root-Cause und Fix in Ticket notieren (git-blame auf 5f2a1e86f)
