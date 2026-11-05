"""RED-Test zum Decommission-Plan: keine Referenzen auf retirierte Prod-Dienste.

Laeuft ROT, solange Manifeste/Code/Doku retirierte Dienste referenzieren.
GRUeN heisst: entfernt oder explizit als decided-keep / geparkt dokumentiert.

Ausnahme-Klassen (alle mit Eigner-Bezug):
- ALLOWLIST_DIRS / ALLOWLIST_FILES (Historie): eingefrorene Aufzeichnungen
  (Archiv, abgeschlossene Plaene, ADRs, Changelogs). Geschichte wird nicht
  umgeschrieben — der Gate greift fuer alles Neue.
- DECIDED_KEEP_FILES: lebendige Infra fuer BEHALTENE Daten (eine Alt-DB
  in shared-db bleibt bestehen, inkl. Backup/Restore-Maschinerie). Ref ADR-018.
- DECIDED_KEEP_LINES: einzelne lebendige Zeilen mit inerten Referenzen
  (auskommentierte Links, WOPI-Allowlist des behaltenen Collabora, kept-DB
  Sync-Loop, Backup-Strom-Namen). Jede mit Begruendung.
- PARKED_REFS (tests/py/spec/decommission_parked_prod_refs.txt): Produkt-Code,
  dessen Schicksal der Eigner entscheidet (Portal/CalDAV/Talk-Client). Das File
  ist zugleich die Entscheidungsvorlage; es schrumpft mit der Entscheidung.
"""

import re

import pytest

from pathlib import Path

ALLOWLIST_DIRS = {
    "docs/superpowers/specs/archive",
    ".agents/plans/decommission-prod-services",
    ".agents/plans/archive",
    # Abgeschlossener Plan (fix-e2e-mentolder-nightly-11): Aufgabenstand-Record.
    ".agents/plans/fix-e2e-mentolder-nightly-11",
    # Abgeschlossene Migrations-Handovers: Records, keine lebendige Doku.
    "docs/handover",
    # Abgeschlossene Audit-Records.
    "docs/archive/audits",
}

ALLOWLIST_FILES = {
    "docs/adr/ADR-0xx-decommission-prod-services.md",
    # Der Gate selbst: enthaelt das Detektor-Pattern (muss die Namen nennen,
    # um sie zu finden). Das Pattern ist der Gate, nicht sein Gegenstand.
    "tests/py/spec/test_no_prod_services.py",
    # Abgeschlossene Plan-Records (aktive Plaene, erledigte Partials).
    ".agents/plans/brand-trennung/tasks.d/p5-mentolder-infra-weg.md",
    ".agents/plans/brand-trennung/tasks.d/p8-render-raus.md",
    ".agents/plans/gui-audits-plan-a/tasks.d/p2-brett-axe.md",
    ".agents/plans/gui-audits-plan-a/tasks.md",
    # SSOT-Quelle der Health-Goals mit historischen Versionsnotizen.
    ".claude/lib/goals.md",
    # Append-only Historie.
    "components/website/CHANGELOG.md",
    "docs/health-goals-history.md",
    # Datierte Design-Records (Vergangenheit, keine lebendige Doku).
    "components/website/docs/superpowers/plans/2026-04-10-client-portal.md",
    "components/website/docs/superpowers/plans/2026-04-10-document-signing.md",
    "components/website/docs/superpowers/plans/2026-04-10-meeting-history.md",
    "components/website/docs/superpowers/specs/2026-04-10-client-portal-design.md",
    "components/website/docs/superpowers/specs/2026-04-10-document-signing-design.md",
    "components/website/docs/superpowers/specs/2026-04-10-meeting-history-design.md",
    # ADR-Records (Entscheidungshistorie, unveraenderlich).
    "docs/adr/ADR-003-brand-namespace-split.md",
    "docs/adr/ADR-006-sdlc-isolation-dev-host.md",
    "docs/adr/ADR-008-local-k3s-dev-mesh.md",
    "docs/adr/ADR-011-pocket-id-sole-idp.md",
    "docs/adr/ADR-014-fleet-gekko-ohne-wireguard.md",
    "docs/adr/ADR-017-korczewski-prod-flux.md",
    "docs/adr/ADR-018-decommission-prod-services.md",
    # Datierte Spec-Records.
    "docs/superpowers/specs/2026-05-30-fleet-phase2a-dual-brand-design.md",
    "docs/superpowers/specs/2026-05-30-fleet-stage2-dns-cutover-design.md",
    "docs/superpowers/specs/2026-05-30-fleet-unified-cluster-design.md",
    "docs/superpowers/specs/2026-06-17-t000898-design.md",
    "docs/superpowers/specs/2026-06-19-secret-task-mismatch-guards-design.md",
    "docs/superpowers/specs/2026-06-20-coaching-studio-design.md",
    "docs/superpowers/specs/2026-06-21-pocket-id-migration-design.md",
    "docs/superpowers/specs/2026-06-27-react-login-edit-homepage-design.md",
    "docs/superpowers/specs/2026-06-30-pocket-id-client-seed-timeout-design.md",
    "docs/superpowers/specs/2026-07-01-pocket-id-smtp-port-quoting-hardening-design.md",
    "docs/superpowers/specs/2026-07-01-pocket-id-smtp-wiring-design.md",
    "docs/superpowers/specs/2026-07-01-rustdesk-server-design.md",
    "docs/superpowers/specs/2026-07-01-t001404-workspace-deploy-secrets-scope-design.md",
    "docs/superpowers/specs/2026-07-03-fleet-secrets-parity-test-design.md",
    "docs/superpowers/specs/2026-07-22-e2e-suite-repair-design.md",
    "docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md",
    "docs/superpowers/plans/2026-06-22-mentolder-web-unterseiten.md",
    # Validiert ein BEHALTENES Asset (Template); Pfad enthaelt das Literal.
    "scripts/tests/systembrett-template.test.sh",
    # GUI-Audit-Evidenz (Record eines abgeschlossenen Audits).
    "docs/agent-guide/gui-audit-evidence-a.md",
    # Komponenten-Registry im DB-Lock-Step (Validator erzwingt Paritaet mit den
    # DB-Seeds; Eintraege beschreiben existierende DB-Zeilen inkl. Sensitivitaet).
    "docs/agent-guide/registry/components.yaml",
}

# Behaltene Datenbank-Maschinerie: die `nextcloud`-DB in shared-db bleibt
# bestehen (Eigner-Entscheid Datenaufbewahrung), inkl. User/Backup/Restore.
# Ref ADR-018 (decided keeps).
DECIDED_KEEP_FILES = {
    "k3d/shared-db.yaml",
    # Backup/Restore-Maschinerie der BEHALTENEN Daten (DBs + PVC-Stroeme).
    "k3d/backup-cronjob.yaml",
    "k3d/pvc-backup-cronjob.yaml",
    "scripts/backup-restore-db.sh",
    "scripts/backup-restore-lib.sh",
    "scripts/backup-restore-pvc.sh",
    "scripts/backup-restore-recovery.sh",
    "scripts/backup-restore.sh",
}

# (Pfad, eindeutiger Zeilen-Ausschnitt): inerte Referenzen in lebendigen Dateien.
DECIDED_KEEP_LINES = {
    # WOPI-Allowlist des BEHALTENEN Collabora (Host tot/inert, keine Aenderung
    # am Laufzeitverhalten; Eigner entscheidet mit dem Produkt-Code).
    (
        "taskfiles/Taskfile.workspace.yml",
        'export COLLABORA_ALIASGROUP1="http://nextcloud.workspace.svc.cluster.local:80"',
    ),
    # Backup-Beschreibung des BEHALTENEN nextcloud-files-Stroms.
    (
        "taskfiles/Taskfile.workspace.yml",
        "Trigger an immediate PVC backup (nextcloud-files,",
    ),
    # Passwort-Sync der BEHALTENEN nextcloud-DB (shared-db User lebt weiter).
    (
        "taskfiles/Taskfile.workspace.yml",
        "for user in pocket_id nextcloud vaultwarden website docuseal; do",
    ),
    # BEHALTENER WOPI-Default (behaltenes Collabora, Host inert).
    (
        "environments/schema.yaml",
        'default_dev: "http://nextcloud.workspace.svc.cluster.local:80"',
    ),
    # BEHALTENER DB-Passwort-Eintrag (Datenbank bleibt, Sync lebt).
    (
        "environments/schema.yaml",
        "- name: NEXTCLOUD_DB_PASSWORD",
    ),
    (
        "k3d/backup-cronjob.yaml",
        'nextcloud)   PASS="$${NEXTCLOUD_DB_PASSWORD}" ;;',
    ),
    (
        "scripts/backup-restore-pvc.sh",
        'nextcloud-files)  PVC_NAME="nextcloud-data-pvc";  MOUNT_PATH="/data" ;;',
    ),
    (
        "scripts/backup-restore.sh",
        "db:        nextcloud | vaultwarden | website | docuseal | all",
    ),
    (
        "scripts/backup-restore.sh",
        "service:   nextcloud-files | vaultwarden-data | docuseal-data | all",
    ),
    (
        "scripts/backup-restore.sh",
        "$SCRIPT pvc-restore nextcloud-files pvc-20260427-030001 --context fleet --namespace workspace -y",
    ),
    # BEHALTENE Daten-Klassifikation (behaltene DB).
    (
        "docs/superpowers/references/shared-infrastructure-security.md",
        "| `nextcloud` | Dateinamen, Dateiinhalte",
    ),
    # Dev-Blanking der retirierten URL (explizit leer, kein Link-Ziel).
    (
        "dev-local/core/kustomization.yaml",
        'NEXTCLOUD_EXTERNAL_URL: ""',
    ),
    # BEHALTENER DB-Passwort-Key (Sync in die behaltene DB).
    (
        "k3d/secrets.yaml",
        'NEXTCLOUD_DB_PASSWORD: "devnextclouddb"',
    ),
    # BEHALTENER Backup-CronJob-Key (Sicherung der behaltenen DB).
    (
        "k3d/backup-cronjob.yaml",
        "- name: NEXTCLOUD_DB_PASSWORD",
    ),
    (
        "k3d/backup-cronjob.yaml",
        "key: NEXTCLOUD_DB_PASSWORD",
    ),
    # BEHALTENE Asset-Pipeline (Template bleibt, Tooling lebt).
    (
        "scripts/add-whiteboard-library.py",
        "WHITEBOARD = 'components/website/public/systembrett/systembrett.whiteboard'",
    ),
    (
        "scripts/backup-restore-lib.sh",
        "nextcloud)   echo NEXTCLOUD_DB_PASSWORD ;;",
    ),
    (
        "scripts/backup-restore-pvc.sh",
        "SVCS=(nextcloud-files vaultwarden-data docuseal-data)",
    ),
    (
        "scripts/backup-restore.sh",
        "db:        nextcloud | vaultwarden | website | docuseal | all",
    ),
    # BEHALTENE DB-Liste in der Backup-Doku (behaltene DBs).
    (
        "docs/superpowers/references/shared-infrastructure-security.md",
        "**Datenbanken im Backup:** `keycloak`, `nextcloud`, `vaultwarden`, `website`, `docuseal`",
    ),
    # BEHALTENE Strom-Namen in der Backup-Doku (Stroeme bleiben).
    (
        "docs/superpowers/references/shared-infrastructure-security.md",
        "keycloak`, `nextcloud`, `vaultwarden`",
    ),
    # BEHALTENES Vendor-Schema (nextcloud-Schema existiert in shared-db weiter).
    (
        "docs/runbooks/db-audit-playbook.md",
        "keycloak, nextcloud, vaultwarden, docuseal",
    ),
    # Decommission-Notiz der Implementierung (dokumentiert die Loeschung).
    (
        "scripts/flux-render-artifact.sh",
        "prod-fleet/coturn/ geloescht",
    ),
    # Negativ-Test: retirierte Measurements muessen INVALID sein (Guard).
    (
        "tests/py/spec/native_ported/spec/health-goals/test_service_health_goals.py",
        'for measurement in ("svc-nextcloud", "svc-whiteboard", "infra-tcp", "infra-http"):',
    ),
    # Negativ-Test: retirierte Dienste duerfen nicht im full-Profil rendern.
    (
        "tests/py/spec/native_ported/spec/local-dev-mesh/test_dev_local_render.py",
        'for d in ("nextcloud", "spreed-signaling"):',
    ),
    # Detektor-Pattern: muss retirierte Namen nennen, um sie zu finden (Negativ-Test).
    (
        "tests/py/spec/native_ported/spec/test_agent_skills.py",
        'services = re.findall(r"Nextcloud|Vaultwarden|Collabora|DocuSeal|Janus|coturn|Traefik|LiveKit", text)',
    ),
    # Legacy-Guard: Keycloak-Era Keys muessen aus dev-secrets verschwunden sein.
    (
        "tests/py/spec/native_ported/spec/secrets-deploy-automation/test_schema_dev_secrets_sync.py",
        '"DOCS_OIDC_SECRET", "MAIL_OIDC_SECRET", "NEXTCLOUD_OIDC_SECRET",',
    ),
    # Massage-Topologie: Guard assertiert ABWESENHEIT (Negativ-Test).
    (
        "tests/py/spec/massage-tenant/test_render_topology.py",
        'assert name not in ("nextcloud", "brett", "collabora", "shared-db"), (',
    ),
    # BEHALTENE DB-Rolle (Datenbank bleibt).
    (
        "tests/py/spec/massage-tenant/test_shared_db_roles.py",
        '"NEXTCLOUD_DB_PASSWORD",',
    ),
    # BEHALTENE DB-Namen (Rollen/DBs bleiben bestehen).
    (
        "tests/py/spec/massage-tenant/test_shared_db_roles.py",
        'OLD_DBS = ["nextcloud", "vaultwarden", "website", "pentest", "videovault", "pocket_id"]',
    ),
    # BEHALTENE Backup-Stroeme (Recovery-Test).
    (
        "tests/py/unit/ported/test_backup_restore_recovery.py",
        '"nextcloud-files.tar.gz.enc" in applied',
    ),
    # Detektor-Strings: Guard muss die verbotenen Namen nennen, um sie zu finden.
    (
        "tests/py/spec/remaining_root_specs/test_staging_stack_repair.py",
        "r'^\\s*NEXTCLOUD_DB_HOST:.*$'",
    ),
    (
        "tests/py/spec/remaining_root_specs/test_staging_stack_repair.py",
        'f"Retirierter DB-Host lebt noch in staging.yaml: {lines}"',
    ),
    # Deletion-Guard: Datei ist weg, Guard muss das belegen.
    (
        "tests/py/spec/native_ported/spec/website-core/test_email_notifications.py",
        '"ncjob": k3d / "nextcloud-notification-config-job.yaml",',
    ),
    # BEHALTENE Backup-Topologie (Stroeme bleiben, keine Clone-Mounts).
    (
        "tests/py/spec/remaining_domain_specs/backup-pipeline/test_pvc_backup_multinode.py",
        "stream_volume nextcloud-data nextcloud-data-pvc",
    ),
    # BEHALTENE Backup-Topologie (Strom nextcloud-data bleibt).
    (
        "tests/py/unit/ported/test_manifests_part2.py",
        'assert "nextcloud-data-pvc" in rendered',
    ),
    # BEHALTENER Strom-Name im Recovery-Test.
    (
        "tests/py/unit/ported/test_backup_restore_recovery.py",
        'nextcloud-files" in applied',
    ),
    # BEHALTENE DB-Nutzer im InitDB-Selfheal-Test.
    (
        "tests/py/unit/ported/test_shared_db_initdb_selfheal.py",
        '"nextcloud",',
    ),
    # BEHALTENE Collabora-Konfiguration (WOPI-Allowlist, Host inert).
    (
        "tests/py/unit/ported/test_manifests_part1.py",
        '"COLLABORA_ALIASGROUP1": "http://nextcloud.workspace.svc.cluster.local:80"',
    ),
    (
        "tests/py/unit/ported/test_manifests_part2.py",
        '"COLLABORA_ALIASGROUP1": "http://nextcloud.workspace.svc.cluster.local:80"',
    ),
    # BEHALTENE Backup-Strom-Topologie (Stroeme bleiben, keine Clone-Mounts).
    (
        "tests/py/spec/remaining_domain_specs/backup-pipeline/test_pvc_backup_multinode.py",
        "name: (nextcloud-data|vaultwarden-data)",
    ),
    # BEHALTENE Backup-Strom-Tests (Strom nextcloud-data bleibt).
    (
        "tests/local/SA-07.sh",
        "for db in keycloak nextcloud; do",
    ),
    (
        "tests/local/SA-07.sh",
        "backs up nextcloud-data,",
    ),
    (
        "tests/local/SA-07.sh",
        "nextcloud-data-pvc",
    ),
    (
        "tests/local/SA-07.sh",
        "nextcloud-data-pvc excluded",
    ),
    (
        "tests/local/SA-07.sh",
        "nextcloud's node via podAffinity",
    ),
    (
        "tests/local/SA-07.sh",
        "nextcloud-data is EXEMPT",
    ),
    (
        "tests/local/SA-07.sh",
        "nextcloud (local-path) is exempt",
    ),
    # BEHALTENER Direkt-Mount-Topologie (Strom nextcloud-data bleibt).
    (
        "tests/local/SA-07.sh",
        "nextcloud direct mount;",
    ),
    # Abgeleitete Guide-Sektionen aus der DB-Lock-Step-Registry (s. components.yaml).
    (
        "docs/agent-guide/30-bausteine.md",
        "### ☁️ Nextcloud",
    ),
    (
        "docs/agent-guide/30-bausteine.md",
        "### 📡 Talk HPB",
    ),
    (
        "docs/agent-guide/30-bausteine.md",
        "### 🎨 Whiteboard",
    ),
    (
        "docs/agent-guide/30-bausteine.md",
        "Kollaboratives Whiteboard für Skizzen und Ideen, direkt in Nextcloud.",
    ),
    # BEHALTENER DB-Nutzer im Rollen-Sync-Test (shared-db User lebt weiter).
    (
        "tests/py/spec/massage-tenant/test_shared_db_roles.py",
        'for role in ("nextcloud", "vaultwarden", "website", "videovault")',
    ),
    # BEHALTENER DB-Passwort-Key im Sync-Test (Datenbank bleibt, Sync lebt).
    (
        "tests/py/spec/massage-tenant/test_shared_db_roles.py",
        '"NEXTCLOUD_DB_PASSWORD": "synth"',
    ),
    # BEHALTENE Negativ-Assertion (geloeschte Job-Datei, kein Dienst).
    (
        "tests/py/spec/native_ported/spec/website-core/test_email_notifications.py",
        '"nextcloud-notification-config-job.yaml"',
    ),
    # BEHALTENER Strom-Name im Recovery-Stage-Test.
    (
        "tests/py/unit/ported/test_backup_restore_recovery.py",
        'rec.run("stage", "pvc-20260530-030001", "nextcloud-files"',
    ),
    # BEHALTENE Backup-PVC-Liste (Strom nextcloud-data bleibt).
    (
        "docs/superpowers/references/shared-infrastructure-security.md",
        "`nextcloud-data-pvc`, `vaultwarden-data-pvc`",
    ),
    # BEHALTENE Pod-Affinitaets-Topologie (Strom nextcloud-data bleibt).
    (
        "tests/local/SA-07.sh",
        "co-located with the nextcloud pod",
    ),
    # BEHALTENER DB-Dump-Schritt (behaltene DB wird weiter gedumpt).
    (
        "docs/systemtest-fragebogen.md",
        "pg_dump für nextcloud dumpbar",
    ),
    # Passwort-Staerke-Detektor (nextcloud als schwacher Beispiel-Wert, kein Dienst).
    (
        "tests/py/unit/ported/test_manifests_part2.py",
        "postgres|nextcloud|opensearch",
    ),
    # BEHALTENER Strom-Name im PVC-Topologie-Test.
    (
        "tests/py/unit/ported/test_manifests_part2.py",
        '"nextcloud-data-pvc" in rendered',
    ),
    # Abgeleitete Graph-Knoten aus geparkten Prod-Overlays (Eigner-Entscheid
    # zur Parkdatei ausstehend; Knoten beschreiben keinen lebendigen Dienst).
    (
        "docs/diagrams/architecture.md",
        'nextcloud["nextcloud"]',
    ),
    (
        "docs/diagrams/architecture.md",
        'coturn["coturn"]',
    ),
    (
        "docs/diagrams/architecture.md",
        'janus["janus"]',
    ),
    (
        "docs/diagrams/architecture.md",
        "| nextcloud",
    ),
    (
        "docs/diagrams/architecture.md",
        "| coturn",
    ),
    (
        "docs/diagrams/architecture.md",
        "| janus",
    ),
    # Abgeleitete Blast-Radius-Zeilen aus geparkten Prod-Overlays (s. o.).
    (
        "docs/generated/blast-radius.md",
        "| nextcloud |",
    ),
    (
        "docs/generated/blast-radius.md",
        "| coturn |",
    ),
    (
        "docs/generated/blast-radius.md",
        "| janus |",
    ),
    (
        "docs/generated/blast-radius.md",
        "### nextcloud",
    ),
    (
        "docs/generated/blast-radius.md",
        "### coturn",
    ),
    (
        "docs/generated/blast-radius.md",
        "### janus",
    ),
    # BEHALTENE DB-Liste im Rollen-Sync-Test (s. o.).
    (
        "tests/py/spec/massage-tenant/test_shared_db_roles.py",
        'for db in ("nextcloud", "vaultwarden", "website")',
    ),
    # BEHALTENER Strom-Name im Restore-File-Test (s. o.).
    (
        "tests/py/unit/ported/test_backup_restore_recovery.py",
        'rec.run("restore-file", "pvc-20260530-030001", "nextcloud-files"',
    ),
    # BEHALTENER Claim-Name im Restore-Test (s. o.).
    (
        "tests/py/unit/ported/test_backup_restore_recovery.py",
        '"claimName: nextcloud-data-pvc"',
    ),
    # BEHALTENER Datei-Pfad im Restore-Test (s. o.).
    (
        "tests/py/unit/ported/test_backup_restore_recovery.py",
        'nextcloud-files/admin/files/Doc.pdf"',
    ),
    # BEHALTENER Restore-Aufruf im Restore-Test (s. o.).
    (
        "tests/py/unit/ported/test_backup_restore_recovery.py",
        "pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf",
    ),
    # BEHALTENE PVC-Datenklassifikation (behaltene DB, s. o.).
    (
        "docs/superpowers/references/shared-infrastructure-security.md",
        "`nextcloud-data-pvc` | Nutzerdateien",
    ),
    (
        "tests/prod/SA-07.sh",
        "for db in keycloak nextcloud; do",
    ),
}

PATTERN = re.compile(
    r"nextcloud|whiteboard|coturn|\bjanus\b|\bnats\b|nextcloud-redis|talk-hpb",
    re.IGNORECASE,
)

SUFFIXES = {".yaml", ".yml", ".ts", ".tsx", ".svelte", ".py", ".sh", ".md"}

PARKED_FILE = Path(__file__).with_name("decommission_parked_prod_refs.txt")


def _load_parked() -> set:
    if not PARKED_FILE.is_file():
        return set()
    parked = set()
    for line in PARKED_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            parked.add(line)
    return parked


def test_keine_prod_service_referenzen_ausser_allowlist(repo_root):
    root = Path(str(repo_root))
    parked = _load_parked()
    hits = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUFFIXES:
            continue
        rel = path.relative_to(root).as_posix()
        if rel.startswith(".git/") or "node_modules" in rel or "__pycache__" in rel:
            continue
        if any(rel.startswith(d + "/") for d in ALLOWLIST_DIRS):
            continue
        if rel in ALLOWLIST_FILES:
            continue
        if rel in DECIDED_KEEP_FILES:
            continue
        if rel in parked:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="strict")
        except (OSError, ValueError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if PATTERN.search(line):
                if any(sub in line for (p, sub) in DECIDED_KEEP_LINES if p == rel):
                    continue
                hits.append(f"{rel}:{lineno}:{line.strip()[:100]}")
                break
    assert not hits, (
        "Retirierte Prod-Dienste werden noch referenziert:\n" + "\n".join(hits[:20])
    )
