# Backup Recovery — Browsable Staging + Selective Restore (Design Spec)

- **Datum:** 2026-05-31
- **Branches (parallel):** `feature/recovery-engine` (Plan 1), `feature/recovery-browse` (Plan 2)
- **Status:** approved (brainstorming)
- **Betrifft:** `scripts/backup-restore.sh`, neue `recovery-*`-Manifeste, `database-ops`-Skill
- **Vorgänger:** `2026-05-30-backup-filen-pull-design.md` (one-way → two-way Filen), `2026-05-29-pvc-backup.md`

## Problem & Ziel

Heute sind Backups **undurchsichtig** und Recovery ist **nur-Automatik & destruktiv**:
- DB-Dumps: `pg_dump -Fc` (Binär) → `*.dump.enc` (AES-256). PVCs: `tar.gz` → `*.tar.gz.enc` (AES-256).
- `restore` / `pvc-restore` entschlüsseln direkt in ein `dropdb`+`pg_restore` bzw. `tar x` über den Live-Daten. Man kann **nichts vorher ansehen**, **nichts browsen**, **nichts gezielt** zurückholen, und der volle Pfad ist **nie end-to-end bewiesen** worden.

Ziel (alle vier vom User bestätigt):
1. **Backup browsen** — Dateien in einem Dateibaum sehen, *bevor*/*ohne* destruktiven Restore.
2. **Vertrauenswürdiger Restore** — der Weg `filen-pull → entschlüsseln → wiederherstellen → verifizieren` ist nachweislich lauffähig, mit klarer Erfolgs-/Fehlerausgabe.
3. **Selektives Recovery** — einzelne Dateien bzw. DB-Tabellen zurückholen, nicht alles-oder-nichts.
4. **DB-Inhalte ansehen** — Tabellen/Zeilen eines Backups inspizieren, bevor man zurückspielt.

## Gewählter Ansatz (aus Brainstorming)

**„Recovery-Staging":** Ein Backup wird **einmal** in einen *browsebaren* Bereich entpackt, statt direkt destruktiv wiederhergestellt:
- PVC-Tarballs → **per Dienst on-demand** entpackt nach `recovery-pvc:/recovery/<ts>/<service>/…`
- jede DB → restauriert in eine **Wegwerf-Inspektions-DB** `<db>_recovery` in derselben Marken-`shared-db`

Davon ausgehend: browsen (Dateien per Web, DB per `psql`), gezielt zurückholen, und das erfolgreiche Staging **beweist** die Wiederherstellbarkeit. Browse-Oberfläche: **Hybrid** — Web-Filebrowser für Dateien, `psql` für DB. Web-UI ist **on-demand** (durch den Recovery-Befehl hoch-/runtergefahren), Daten bleiben **im Cluster** (DSGVO).

**Wichtig — per-service:** Staging entpackt **bewusst pro Dienst** (nicht alles auf einmal), damit `recovery-pvc` klein bleibt; man staged genau, was man braucht.

## Aufteilung in zwei parallel ausführbare Pläne

Disjunkte Dateien → zwei `dev-flow-execute`-Läufe kollidieren nie.

### Plan 1 — Recovery-Engine (`feature/recovery-engine`)
Datei-Eigentum: `scripts/backup-restore.sh`, `k3d/recovery-pvc.yaml`, `Taskfile.yml` (neue `recovery:*`-Tasks), `tests/unit/backup-restore-recovery.bats`.

Neue Subkommandos in `backup-restore.sh` (gleiche Job-via-heredoc-Muster wie heute — PodSecurity, nodeAffinity ohne Home-Nodes, shared-db-podAffinity, `BACKUP_PASSPHRASE`/`SHARED_DB_PASSWORD` aus `workspace-secrets`, durchgängig `-n "$NS"`):
- `stage <ts> <db|service>` — entschlüsselt **einen** Eintrag und stagt ihn: DB → `createdb <db>_recovery` + `pg_restore` hinein (Live-DB unangetastet); Service → `tar x` nach `recovery-pvc:/recovery/<ts>/<service>/`.
- `verify <ts> <db>` — stagt in eine Inspektions-DB, druckt Tabellen-/Zeilen-Zähler, dann `unstage` (beweist Wiederherstellbarkeit).
- `restore-file <ts> <service> <path>` — kopiert genau diesen Pfad aus dem Staging in die **Live**-PVC (Bestätigung; Job mountet recovery-pvc + Ziel-PVC).
- `restore-table <ts> <db> <table>` — `pg_restore -t <table>` (optional `--data-only`) aus dem entschlüsselten Dump in die Live-DB (Bestätigung).
- `browse [<ts>]` — `kubectl apply -f k3d/recovery-browser.yaml` (Manifest aus Plan 2) und druckt die `recover.<domain>`-URL.
- `unbrowse` / `unstage <ts>` — `unbrowse` löscht die Browser-Stack-Ressourcen; `unstage <ts>` zusätzlich: `dropdb` aller `*_recovery`, leert `recovery-pvc:/recovery/<ts>`.
- `recovery-pvc`: neues PVC (Longhorn in Prod / local-path Dev), Default-Größe konfigurierbar (z. B. 20Gi); per-service-Staging hält den realen Bedarf klein.

### Plan 2 — Recovery-Browse-Surface (`feature/recovery-browse`)
Datei-Eigentum: `k3d/recovery-browser.yaml`, `k3d/configmap-domains.yaml` (+`RECOVER_DOMAIN`), `prod-mentolder/realm-workspace-mentolder.json` + `prod-korczewski/realm-workspace-korczewski.json` (+ OIDC-Client `recovery`), `tests/unit/recovery-browser-manifest.bats`.

- `k3d/recovery-browser.yaml` (NICHT in `k3d/kustomization.yaml` — on-demand wie office/coturn): `filebrowser/filebrowser`-Deployment + Service (mountet `recovery-pvc:/recovery` **read-only** unter `/srv`), `oauth2-proxy-recovery`-Deployment + Service (Klon von `oauth2-proxy-docs.yaml`, `--client-id=recovery`, `--upstream=http://recovery-browser:80`, `--allowed-groups=/recovery-access`, Cookie `_oauth2_proxy_recovery`), Traefik-IngressRoute `recover.<domain>` → `oauth2-proxy-recovery:4180`.
- Keycloak-Client `recovery` (gespiegelt vom `docs`-Client) mit Redirect `…/oauth2/callback` und Gruppen-Mapper für `/recovery-access`.
- `RECOVER_DOMAIN: "recover.localhost"` (Dev) in der Domains-ConfigMap; Prod-Overlay überschreibt auf `recover.<PROD_DOMAIN>`.
- Secret-Key `RECOVERY_OIDC_SECRET` (+ Schema/Seal-Eintrag) analog `DOCS_OIDC_SECRET`.

**Integrationsvertrag (beide Pläne):** PVC-Name `recovery-pvc`, Pfad-Layout `/recovery/<ts>/<service>/`, Manifest-Dateiname `k3d/recovery-browser.yaml`, Filebrowser mountet read-only.

## Lebenszyklus & Sicherheit

- `unstage`/`unbrowse` räumen vollständig auf (Inspektions-DBs gedroppt, Staging gelöscht, Browser entfernt). Stale-Staging älter als N Tage → Warnung.
- Web-UI nur on-demand, gruppen-gated (`/recovery-access`), read-only Mount, Cookie-Secret-Pattern wie docs. Entschlüsselte Daten verlassen nie den Cluster.
- Pro Marke über `--namespace` (`workspace` / `workspace-korczewski`); `<db>_recovery` liegt in der jeweiligen `shared-db`.

## Out of Scope / Non-Goals

- **Kein** Download/Entschlüsseln auf einen lokalen Rechner (DSGVO — echte Vaultwarden/Nextcloud-Daten blieben sonst auf dem Laptop).
- **Kein** Web-DB-Browser (pgweb/adminer) — DB-Inspektion bleibt `psql` (mächtiger, kein Extra-Image).
- **Keine** Änderung am Backup-Mechanismus (CronJobs, Format, Verschlüsselung, Filen-Upload) — nur die Recovery-Seite.
- **Keine** Änderung am bestehenden destruktiven `restore`/`pvc-restore` außer „verify-first"-Hinweisen + klarerer Ausgabe.

## Risiko

Mittel. Plan 1 ist additiv zu einem bewährten Skript (gleiche Job-Muster); neue Inspektions-DBs/Recovery-PVC berühren keine Live-Daten außer beim expliziten, bestätigten `restore-file`/`restore-table`. Plan 2 fügt eine on-demand, gruppen-gated, read-only Web-Oberfläche hinzu (Sicherheitsfläche bewusst minimiert: nicht im kustomization, kein Dauerbetrieb).
