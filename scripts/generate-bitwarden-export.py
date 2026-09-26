#!/usr/bin/env python3
"""
generate-bitwarden-export.py

1. Verifies plaintext env and secret files against environments/schema.yaml.
2. Generates an importable bitwarden.json for Mentolder and Korczewski tenants:
   - Every secret with its variable NAME, secret type, reroll command, and 3rd-party links.
   - Separate web login entries with user/password and direct URLs for web consoles.
   - Bundled non-secret environment values in Secure Notes with searchable custom fields.
"""

import json
import os
import re
import sys
import uuid
import yaml

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_DIR = os.path.join(REPO_ROOT, "environments")
SECRETS_DIR = os.path.join(ENV_DIR, ".secrets")
OUTPUT_PATH = os.path.join(REPO_ROOT, "bitwarden.json")

def load_yaml(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def get_secret_metadata(key_name, schema_entry, domain):
    """
    Returns (secret_type, reroll_cmd, third_party_url, is_third_party)
    """
    desc = schema_entry.get("description", "") if schema_entry else ""
    length = schema_entry.get("length", 32) if schema_entry else 32

    # Database Passwords
    if key_name.endswith("_DB_PASSWORD") or key_name == "SHARED_DB_PASSWORD":
        db_name = key_name.replace("_DB_PASSWORD", "").lower()
        if key_name == "SHARED_DB_PASSWORD":
            db_name = "postgres / shared-db"
        return (
            "Database Role Password (PostgreSQL)",
            f"# 1. Generate new password:\nNEW_PASS=$(openssl rand -hex 32)\n# 2. Update environments/.secrets/fleet-<tenant>.yaml\n# 3. Reseal and apply:\ntask env:seal ENV=fleet-<tenant>\n# 4. Synchronize live DB role password:\ntask workspace:sync-db-passwords ENV=fleet-<tenant>\n# 5. Restart dependent workloads:\nkubectl -n <namespace> rollout restart deployment/<service>",
            None,
            False
        )

    # Pocket ID OIDC Client Secrets
    if key_name.startswith("POCKET_ID_") and key_name.endswith("_SECRET"):
        client_name = key_name.replace("POCKET_ID_", "").replace("_SECRET", "").lower()
        return (
            "OIDC Client Secret (Pocket ID)",
            f"# Pocket ID OIDC client secret is seeded to Postgres (pocket_id.oidc_clients)\n# To reroll:\nNEW_SECRET=$(openssl rand -hex 32)\n# Update environments/.secrets/fleet-<tenant>.yaml, then reseal and re-seed:\ntask env:seal ENV=fleet-<tenant>\nkubectl -n <namespace> delete job pocket-id-client-seed 2>/dev/null || true\nkubectl apply -f fleet/pocket-id-client-seed.yaml -n <namespace>",
            f"https://auth.{domain}",
            True
        )

    # Pocket ID Admin / Encryption
    if key_name == "POCKET_ID_API_KEY":
        return (
            "Bearer API Token (Pocket ID Admin REST API)",
            f"openssl rand -hex 32\n# Update in environments/.secrets/fleet-<tenant>.yaml and reseal:\ntask env:seal ENV=fleet-<tenant>\nkubectl -n <namespace> rollout restart deployment/pocket-id",
            f"https://auth.{domain}",
            True
        )
    if key_name == "POCKET_ID_ENCRYPTION_KEY":
        return (
            "AES-256 Symmetric Key (Pocket ID Database Encryption)",
            "openssl rand -hex 32\n# CAUTION: Rotating this key invalidates all currently encrypted records in Pocket ID database!",
            f"https://auth.{domain}",
            False
        )

    # Admin Passwords / Tokens
    if key_name == "NEXTCLOUD_ADMIN_PASSWORD":
        return (
            "Application Administrator Password (Nextcloud)",
            f"# Generate new password:\nNEW_PASS=$(openssl rand -base64 24)\n# Reset inside Nextcloud pod:\nkubectl -n <namespace> exec -it deploy/nextcloud -- su -s /bin/bash www-data -c \"php occ user:resetpassword admin --password-from-env\" <<< \"$NEW_PASS\"\n# Update in environments/.secrets/fleet-<tenant>.yaml and reseal:\ntask env:seal ENV=fleet-<tenant>",
            f"https://files.{domain}/login",
            True
        )
    if key_name == "GRAFANA_ADMIN_PASSWORD":
        return (
            "Application Administrator Password (Grafana)",
            f"NEW_PASS=$(openssl rand -base64 24)\nkubectl -n <namespace> exec -it deploy/grafana -- grafana-cli admin reset-admin-password \"$NEW_PASS\"\ntask env:seal ENV=fleet-<tenant>",
            f"https://monitoring.{domain}/login",
            True
        )
    if key_name == "VAULTWARDEN_ADMIN_TOKEN":
        return (
            "Application Admin Token / Master Passphrase (Vaultwarden)",
            f"NEW_TOKEN=$(openssl rand -base64 32)\n# Update environments/.secrets/fleet-<tenant>.yaml and reseal:\ntask env:seal ENV=fleet-<tenant>\nkubectl -n <namespace> rollout restart deployment/vaultwarden",
            f"https://vault.{domain}/admin",
            True
        )
    if key_name == "COLLABORA_ADMIN_PASSWORD":
        return (
            "Application Administrator Password (Collabora Online)",
            f"NEW_PASS=$(openssl rand -base64 24)\n# Update environments/.secrets/fleet-<tenant>.yaml and sync:\ntask workspace:office:sync-secret ENV=fleet-<tenant>",
            f"https://office.{domain}/browser/dist/admin/admin.html",
            True
        )

    # Internal JWT / HMAC / Tokens
    if key_name == "OAUTH2_PROXY_COOKIE_SECRET":
        return (
            "Session Encryption Secret (oauth2-proxy cookie secret)",
            "openssl rand -base64 32 | tr -- '+/' '-_'",
            None,
            False
        )
    if key_name == "WHITEBOARD_JWT_SECRET":
        return (
            "JWT Signing Secret (Nextcloud Whiteboard Backend)",
            "openssl rand -hex 32\n# Reseal and sync with Nextcloud Whiteboard app:\ntask env:seal ENV=fleet-<tenant>",
            None,
            False
        )
    if key_name in ["SIGNALING_SECRET", "TURN_SECRET", "RECORDING_SECRET", "TRANSCRIBER_SECRET"]:
        return (
            "Cryptographic Shared Secret (Janus WebRTC / CoTURN / Spreed)",
            f"openssl rand -hex 32\n# Update in environments/.secrets/fleet-<tenant>.yaml\ntask env:seal ENV=fleet-<tenant>\ntask workspace:coturn:sync-secret ENV=fleet-<tenant>",
            None,
            False
        )
    if key_name == "TRANSCRIBER_BOT_PASSWORD":
        return (
            "Service Account Password (Talk Transcriber Bot)",
            "openssl rand -base64 24\n# Update in environments/.secrets/fleet-<tenant>.yaml and reseal",
            None,
            False
        )
    if key_name in ["INTERNAL_API_TOKEN", "MONITORING_WEBHOOK_TOKEN", "FACTORY_OTLP_TOKEN", "SESSIONS_CRON_TOKEN"]:
        return (
            "Internal Service Bearer Token / Webhook Secret",
            "openssl rand -hex 32\n# Update in environments/.secrets/fleet-<tenant>.yaml and reseal",
            None,
            False
        )
    if key_name == "BACKUP_PASSPHRASE":
        return (
            "Symmetric Backup Encryption Passphrase (Duplicity / Restic / PVC Backup)",
            "openssl rand -base64 32\n# CAUTION: Backups encrypted with previous passphrase require the old passphrase to restore!",
            None,
            False
        )

    # 3rd-Party APIs
    if "ANTHROPIC" in key_name:
        return (
            "3rd-Party API Key (Anthropic Claude API)",
            "# Generate new key in Anthropic Console, revoke old key, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://console.anthropic.com/settings/keys",
            True
        )
    if "OPENAI" in key_name:
        return (
            "3rd-Party API Key (OpenAI API)",
            "# Generate new key in OpenAI Platform, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://platform.openai.com/api-keys",
            True
        )
    if "DEEPSEEK" in key_name:
        return (
            "3rd-Party API Key (DeepSeek API)",
            "# Generate new key in DeepSeek Open Platform, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://platform.deepseek.com/api_keys",
            True
        )
    if "GEMINI" in key_name:
        return (
            "3rd-Party API Key (Google AI Studio / Gemini API)",
            "# Create API key in Google AI Studio, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://aistudio.google.com/app/apikey",
            True
        )
    if "OPENROUTER" in key_name:
        return (
            "3rd-Party API Key (OpenRouter AI Gateway)",
            "# Create key in OpenRouter dashboard, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://openrouter.ai/keys",
            True
        )
    if "HUGGINGFACE" in key_name:
        return (
            "3rd-Party Access Token (Hugging Face Hub)",
            "# Create access token in Hugging Face settings, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://huggingface.co/settings/tokens",
            True
        )
    if "VOYAGE" in key_name:
        return (
            "3rd-Party API Key (Voyage AI Embeddings)",
            "# Create API key in Voyage AI Dashboard, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://dash.voyageai.com/",
            True
        )
    if "DASHSCOPE" in key_name:
        return (
            "3rd-Party API Key (Alibaba Cloud DashScope)",
            "# Create API key in Alibaba Cloud DashScope console, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://dashscope.console.aliyun.com/apiKey",
            True
        )
    if "GITHUB" in key_name or "GHCR" in key_name:
        return (
            "GitHub Personal Access Token (PAT / Fine-Grained Token)",
            "# Generate new PAT in GitHub Settings with appropriate scopes, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://github.com/settings/tokens",
            True
        )
    if "GITLAB" in key_name:
        return (
            "GitLab Runner Authentication / Registration Token",
            "# Generate in GitLab CI/CD Settings -> Runners, update .secrets, and reseal:\ntask env:seal ENV=fleet-<tenant>",
            "https://gitlab.com/",
            True
        )
    if "HETZNER" in key_name:
        return (
            "Cloud Infrastructure API Token (Hetzner Cloud)",
            "# Create API Token in Hetzner Cloud Console -> Project -> Security -> API Tokens:\ntask env:seal ENV=fleet-<tenant>",
            "https://console.hetzner.cloud/projects",
            True
        )
    if "CLOUDFLARE" in key_name:
        return (
            "DNS / CDN API Token (Cloudflare)",
            "# Create Token in Cloudflare Dashboard -> My Profile -> API Tokens:\ntask env:seal ENV=fleet-<tenant>",
            "https://dash.cloudflare.com/profile/api-tokens",
            True
        )
    if "IPV64" in key_name:
        return (
            "Dynamic DNS API Key / Update Hash (ipv64.net)",
            "# Retrieve or regenerate API key in IPv64 account settings:\ntask env:seal ENV=fleet-<tenant>",
            "https://ipv64.net/",
            True
        )
    if "SMTP" in key_name:
        return (
            "SMTP Mail Authentication Credential (mailbox.org)",
            "# Manage mailbox passwords or app passwords in mailbox.org settings:\ntask env:seal ENV=fleet-<tenant>",
            "https://login.mailbox.org/",
            True
        )
    if "FILEN" in key_name:
        return (
            "Encrypted Cloud Storage Credential (filen.io)",
            "# Manage in filen.io account settings:\ntask env:seal ENV=fleet-<tenant>",
            "https://filen.io/login",
            True
        )
    if "PUSHOVER" in key_name:
        return (
            "Mobile Push Notification Token (Pushover)",
            "# Create or copy Application API Token from Pushover dashboard:\ntask env:seal ENV=fleet-<tenant>",
            "https://pushover.net/apps",
            True
        )

    # WireGuard & SSH
    if key_name.startswith("WG_MESH_"):
        if "PRIVATE" in key_name:
            return (
                "WireGuard Mesh Private Key (Curve25519)",
                "wg genkey | tee privatekey | wg pubkey > publickey",
                None,
                False
            )
        else:
            return (
                "WireGuard Mesh Public Key",
                "echo '<privatekey>' | wg pubkey",
                None,
                False
            )
    if "SSH_PRIVATE_KEY" in key_name or key_name == "RUSTDESK_ID_ED25519":
        return (
            "SSH / Asymmetric Private Key (Ed25519)",
            "ssh-keygen -t ed25519 -C 'workspace-key' -f id_ed25519",
            None,
            False
        )

    # SEPA Banking
    if key_name.startswith("SEPA_CREDITOR_"):
        return (
            "Banking / SEPA Direct Debit Credential",
            "# Banking credentials issued by bank / Deutsche Bundesbank Gläubiger-ID registry",
            None,
            True
        )

    # Legacy OIDC keys
    if key_name.endswith("_OIDC_SECRET"):
        return (
            "Legacy OIDC Client Secret (Keycloak/Pocket-ID transition)",
            "openssl rand -hex 32",
            f"https://auth.{domain}",
            True
        )

    # Generic fallback
    gen = schema_entry.get("generate", False) if schema_entry else False
    if gen:
        return (
            f"Generated Secret ({length}-char / alphanumeric)",
            f"openssl rand -hex {max(16, length // 2)}\n# Update in environments/.secrets/fleet-<tenant>.yaml and reseal:\ntask env:seal ENV=fleet-<tenant>",
            None,
            False
        )
    return (
        "Configured Credential / API Secret",
        f"# Manual rotation: update in environments/.secrets/fleet-<tenant>.yaml and reseal:\ntask env:seal ENV=fleet-<tenant>",
        None,
        False
    )


def build_bitwarden_export():
    schema = load_yaml(os.path.join(ENV_DIR, "schema.yaml"))
    schema_secrets = {s["name"]: s for s in schema.get("secrets", [])}
    schema_env_vars = {e["name"]: e for e in schema.get("env_vars", [])}
    schema_setup_vars = {s["name"]: s for s in schema.get("setup_vars", [])}

    tenants = [
        {
            "id": "mentolder",
            "name": "Mentolder",
            "folder_id": "11111111-1111-1111-1111-111111111111",
            "env_file": os.path.join(ENV_DIR, "fleet-mentolder.yaml"),
            "secret_file": os.path.join(SECRETS_DIR, "fleet-mentolder.yaml"),
            "domain": "mentolder.de"
        },
        {
            "id": "korczewski",
            "name": "Korczewski",
            "folder_id": "22222222-2222-2222-2222-222222222222",
            "env_file": os.path.join(ENV_DIR, "fleet-korczewski.yaml"),
            "secret_file": os.path.join(SECRETS_DIR, "fleet-korczewski.yaml"),
            "domain": "korczewski.de"
        }
    ]

    export_data = {
        "encrypted": False,
        "folders": [
            {"id": t["folder_id"], "name": t["name"]} for t in tenants
        ],
        "items": []
    }

    validation_reports = {}

    for t in tenants:
        t_id = t["id"]
        t_name = t["name"]
        folder_id = t["folder_id"]
        domain = t["domain"]
        env_data = load_yaml(t["env_file"])
        sec_data = load_yaml(t["secret_file"])

        env_vars = env_data.get("env_vars", {})
        setup_vars = env_data.get("setup_vars", {})

        # Validation against schema
        sec_keys = set(sec_data.keys())
        req_schema_keys = {k for k, v in schema_secrets.items() if v.get("required", False)}
        missing_req = sorted(list(req_schema_keys - sec_keys))
        all_schema_keys = set(schema_secrets.keys())
        missing_opt = sorted(list((all_schema_keys - req_schema_keys) - sec_keys))
        extra_keys = sorted(list(sec_keys - all_schema_keys))

        validation_reports[t_name] = {
            "total_secrets_in_file": len(sec_keys),
            "missing_required": missing_req,
            "missing_optional": missing_opt,
            "extra_keys": extra_keys
        }

        # ── 1. Every Secret as an Individual Item ───────────────────
        for sec_name in sorted(sec_keys):
            val = str(sec_data.get(sec_name, ""))
            schema_entry = schema_secrets.get(sec_name, {})
            sec_type, reroll_cmd, url, is_third_party = get_secret_metadata(sec_name, schema_entry, domain)
            desc = schema_entry.get("description", "")

            uris = []
            if url:
                uris.append({"match": None, "uri": url})

            # Determine appropriate username
            username = ""
            if sec_name == "NEXTCLOUD_ADMIN_PASSWORD":
                username = "admin"
            elif sec_name == "GRAFANA_ADMIN_PASSWORD":
                username = "admin"
            elif sec_name == "COLLABORA_ADMIN_PASSWORD":
                username = "admin"
            elif sec_name == "VAULTWARDEN_ADMIN_TOKEN":
                username = "admin"
            elif sec_name == "SMTP_PASSWORD":
                username = str(sec_data.get("SMTP_USER") or env_vars.get("SMTP_USER") or f"{t_id}@mailbox.org")
            elif sec_name == "FILEN_PASSWORD":
                username = str(sec_data.get("FILEN_EMAIL") or env_vars.get("FILEN_EMAIL") or f"info@{domain}")

            notes_lines = [
                f"# [{t_name}] {sec_name}",
                f"",
                f"- **Variable Name**: `{sec_name}`",
                f"- **Secret Category**: {sec_type}",
                f"- **Required by Schema**: {'Yes' if schema_entry.get('required') else 'No'}",
            ]
            if desc:
                notes_lines.append(f"- **Description**: {desc}")
            if url:
                notes_lines.append(f"- **Management Console**: {url}")
            notes_lines.extend([
                f"",
                f"### Reroll / Rotation Command",
                f"```bash",
                f"{reroll_cmd}",
                f"```"
            ])

            item_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{t_id}.secret.{sec_name}"))
            item = {
                "id": item_id,
                "organizationId": None,
                "folderId": folder_id,
                "type": 1,  # Login
                "name": f"[{t_name}] {sec_name}",
                "notes": "\n".join(notes_lines),
                "favorite": False,
                "login": {
                    "uris": uris,
                    "username": username,
                    "password": val,
                    "totp": None
                },
                "fields": [
                    {"name": "VARIABLE_NAME", "value": sec_name, "type": 0},
                    {"name": "SECRET_TYPE", "value": sec_type, "type": 0},
                    {"name": "REROLL_COMMAND", "value": reroll_cmd, "type": 0},
                    {"name": "REQUIRED", "value": str(schema_entry.get("required", False)), "type": 0},
                    {"name": "TENANT", "value": t_name, "type": 0}
                ]
            }
            if url:
                item["fields"].append({"name": "3RD_PARTY_URL", "value": url, "type": 0})

            export_data["items"].append(item)

        # ── 2. Dedicated Web Login Entries for Administrative Panels ──
        admin_web_entries = [
            {
                "title": f"[{t_name}] Nextcloud Admin Console",
                "url": f"https://files.{domain}/login",
                "username": "admin",
                "password": str(sec_data.get("NEXTCLOUD_ADMIN_PASSWORD", "")),
                "notes": f"Nextcloud Web Administration for {t_name} tenant.\nInternal Secret: NEXTCLOUD_ADMIN_PASSWORD"
            },
            {
                "title": f"[{t_name}] Pocket ID Admin Console",
                "url": f"https://auth.{domain}/",
                "username": "admin",
                "password": str(sec_data.get("POCKET_ID_API_KEY", "")),
                "notes": f"Pocket ID SSO and Identity Provider admin panel for {t_name}.\nBearer API Key / Admin Secret: POCKET_ID_API_KEY"
            },
            {
                "title": f"[{t_name}] Vaultwarden Admin Panel",
                "url": f"https://vault.{domain}/admin",
                "username": "admin",
                "password": str(sec_data.get("VAULTWARDEN_ADMIN_TOKEN", "")),
                "notes": f"Vaultwarden server administration panel for {t_name}.\nAdmin Token: VAULTWARDEN_ADMIN_TOKEN"
            },
            {
                "title": f"[{t_name}] Mailbox.org SMTP & Webmail",
                "url": "https://login.mailbox.org/",
                "username": str(sec_data.get("SMTP_USER") or env_vars.get("SMTP_USER") or f"{t_id}@mailbox.org"),
                "password": str(sec_data.get("SMTP_PASSWORD", "")),
                "notes": f"Mailbox.org email account for {t_name} tenant platform notifications."
            },
            {
                "title": f"[{t_name}] Grafana Admin Console",
                "url": f"https://monitoring.{domain}/login",
                "username": "admin",
                "password": str(sec_data.get("GRAFANA_ADMIN_PASSWORD", "")),
                "notes": f"Grafana monitoring dashboard local admin login for {t_name}."
            },
            {
                "title": f"[{t_name}] Collabora Online Admin Console",
                "url": f"https://office.{domain}/browser/dist/admin/admin.html",
                "username": "admin",
                "password": str(sec_data.get("COLLABORA_ADMIN_PASSWORD", "")),
                "notes": f"Collabora Online administration console for {t_name}."
            }
        ]

        if sec_data.get("FILEN_PASSWORD"):
            admin_web_entries.append({
                "title": f"[{t_name}] Filen.io Cloud Storage",
                "url": "https://filen.io/login",
                "username": str(sec_data.get("FILEN_EMAIL") or env_vars.get("FILEN_EMAIL") or f"info@{domain}"),
                "password": str(sec_data.get("FILEN_PASSWORD", "")),
                "notes": f"Filen encrypted cloud storage account used for remote backup sync."
            })

        for web in admin_web_entries:
            item_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{t_id}.weblogin.{web['title']}"))
            export_data["items"].append({
                "id": item_id,
                "organizationId": None,
                "folderId": folder_id,
                "type": 1,  # Login
                "name": web["title"],
                "notes": web["notes"],
                "favorite": True,
                "login": {
                    "uris": [{"match": None, "uri": web["url"]}],
                    "username": web["username"],
                    "password": web["password"],
                    "totp": None
                },
                "fields": [
                    {"name": "LOGIN_TYPE", "value": "Administrative Web Portal", "type": 0},
                    {"name": "TENANT", "value": t_name, "type": 0}
                ]
            })

        # ── 3. Dedicated 3rd-Party Service Web Console Entries ────────
        third_party_consoles = [
            {
                "service": "Anthropic Console",
                "url": "https://console.anthropic.com/settings/keys",
                "var_name": "ANTHROPIC_API_KEY"
            },
            {
                "service": "OpenAI Platform",
                "url": "https://platform.openai.com/api-keys",
                "var_name": "OPENAI_API_KEY"
            },
            {
                "service": "DeepSeek Open Platform",
                "url": "https://platform.deepseek.com/api_keys",
                "var_name": "DEEPSEEK_API_KEY"
            },
            {
                "service": "Google AI Studio",
                "url": "https://aistudio.google.com/app/apikey",
                "var_name": "GEMINI_API_KEY"
            },
            {
                "service": "Hetzner Cloud Console",
                "url": "https://console.hetzner.cloud/projects",
                "var_name": "HETZNER_API_KEY"
            },
            {
                "service": "Cloudflare Dashboard",
                "url": "https://dash.cloudflare.com/profile/api-tokens",
                "var_name": "CLOUDFLARE_API_TOKEN"
            },
            {
                "service": "IPv64 DynDNS",
                "url": "https://ipv64.net/",
                "var_name": "IPV64_API_KEY"
            },
            {
                "service": "GitHub Developer Settings",
                "url": "https://github.com/settings/tokens",
                "var_name": "GHCR_PAT"
            }
        ]

        for tp in third_party_consoles:
            vname = tp["var_name"]
            key_val = str(sec_data.get(vname, ""))
            if not key_val:
                continue
            item_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{t_id}.3rdparty.{tp['service']}"))
            export_data["items"].append({
                "id": item_id,
                "organizationId": None,
                "folderId": folder_id,
                "type": 1,  # Login
                "name": f"[{t_name}] 3rd-Party Web: {tp['service']}",
                "notes": f"3rd-party provider console managing {vname} for {t_name}.\nCredential link: {tp['url']}",
                "favorite": False,
                "login": {
                    "uris": [{"match": None, "uri": tp["url"]}],
                    "username": f"account@{domain}",
                    "password": key_val,
                    "totp": None
                },
                "fields": [
                    {"name": "SERVICE", "value": tp["service"], "type": 0},
                    {"name": "VARIABLE_NAME", "value": vname, "type": 0},
                    {"name": "DASHBOARD_URL", "value": tp["url"], "type": 0},
                    {"name": "TENANT", "value": t_name, "type": 0}
                ]
            })

        # ── 4. Bundled Non-Secret Environment Values ──────────────────
        bundled_fields = []
        yaml_content = {
            "tenant": t_name,
            "domain": domain,
            "environment": env_data.get("environment"),
            "context": env_data.get("context"),
            "workspace_namespace": env_data.get("workspace_namespace"),
            "website_namespace": env_data.get("website_namespace"),
            "env_vars": env_vars,
            "setup_vars": setup_vars
        }

        # Build custom fields for all nonsecret env_vars
        for k in sorted(env_vars.keys()):
            bundled_fields.append({
                "name": k,
                "value": str(env_vars[k]),
                "type": 0  # Text
            })

        for k in sorted(setup_vars.keys()):
            bundled_fields.append({
                "name": f"setup:{k}",
                "value": str(setup_vars[k]),
                "type": 0  # Text
            })

        bundled_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{t_id}.bundled.nonsecret"))
        export_data["items"].append({
            "id": bundled_id,
            "organizationId": None,
            "folderId": folder_id,
            "type": 2,  # Secure Note
            "name": f"[{t_name}] Bundled Non-Secret Environment Configuration",
            "notes": (
                f"# Non-Secret Environment Variables for {t_name}\n\n"
                f"Contains all non-secret configuration variables (`env_vars` and `setup_vars`) from `environments/{os.path.basename(t['env_file'])}`.\n\n"
                f"```yaml\n"
                f"{yaml.dump(yaml_content, default_flow_style=False, sort_keys=False)}"
                f"```"
            ),
            "favorite": True,
            "secureNote": {
                "type": 0
            },
            "fields": bundled_fields
        })

    # Write output JSON
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2)

    return validation_reports, len(export_data["items"])


if __name__ == "__main__":
    reports, total_items = build_bitwarden_export()
    print(f"Successfully generated {OUTPUT_PATH} with {total_items} total items.")
    print()
    print("=== Validation Summary ===")
    for tenant, rep in reports.items():
        print(f"\n[{tenant}]")
        print(f"  Total Secrets in file: {rep['total_secrets_in_file']}")
        print(f"  Missing Required Secrets (must be 0): {len(rep['missing_required'])}")
        if rep['missing_required']:
            print(f"    Missing: {rep['missing_required']}")
        print(f"  Missing Optional Secrets: {len(rep['missing_optional'])}")
        print(f"  Extra Secrets in file (e.g. WireGuard/SSH/legacy): {len(rep['extra_keys'])}")
