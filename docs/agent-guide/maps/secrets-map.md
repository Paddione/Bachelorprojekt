# Secrets-Seal-Kette

<!-- GENERIERT aus docs/agent-guide/registry/secrets.yaml — nicht von Hand editieren.
     Neu erzeugen: task secrets:map · Prüfen: task secrets:check -->

Jeder Schlüssel-Name mit Sealed-Quelle und Consumer. Nur Namen — Werte liegen
nie im Repo (git-crypt `environments/.secrets/`, versiegelt `sealed-secrets/`).
Bestehender Env-Check: `task env:validate` (Taskfile.platform.yml:253).

| Key | Scope | Schema | Versiegelt in | Consumer |
|---|---|---|---|---|
| `AGENT_PUSH_API` | env | ja | — | runtime-generated (nicht versiegelt) |
| `AGENT_PUSH_LINK_BASE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `AGENT_PUSH_TOKEN` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `ANTHROPIC_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `ARENA_WS_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `AUTH_EXTERNAL_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BACKUP_ALERT_EMAIL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BACKUP_PASSPHRASE` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `BGE_EMBED_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BGE_MCP_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `BGE_RERANK_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BRAIN_EXTERNAL_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BRAINSTORM_OIDC_SECRET` | external | extern | `staging.yaml` | workspace-staging/workspace-secrets |
| `BRAND_ID` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BRAND_NAME` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BRETT_BOT_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `BRETT_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BRETT_IMAGE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BRETT_IMAGE_DIGEST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `BRETT_OIDC_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `CLAUDE_CODE_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `CLAUDE_CODE_WEBUI_SECRET_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `CLUSTER_ENV` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COACHING_SESSION_MODEL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COACHING_SIM_ENABLED` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_ADMIN_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-office/collabora-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `COLLABORA_ALIASGROUP1` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_ALIASGROUP2` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_HOST_2` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_INGRESS_MIDDLEWARES` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_INGRESS_MIDDLEWARES_2` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_INGRESS_MIDDLEWARES_KORCZEWSKI` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_SERVER_NAME` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_SSL_TERMINATION` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_TLS_SECRET` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COLLABORA_TLS_SECRET_2` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COMFY_HOST_IP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `COMFY_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `COMFY_PORT` | env | ja | — | runtime-generated (nicht versiegelt) |
| `CONTACT_CITY` | env | ja | — | runtime-generated (nicht versiegelt) |
| `CONTACT_EMAIL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `CONTACT_NAME` | env | ja | — | runtime-generated (nicht versiegelt) |
| `CONTACT_PHONE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `CRON_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `DEEPSEEK_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, website-korczewski/website-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `DEEPSEEK_API_KEY_PK` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `DEV_BGE_EMBED_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_BGE_RERANK_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_BRETT_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_MCP_TOKEN` | external | extern | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `DEV_NODE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_OAUTH2_PROXY_COOKIE_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `DEV_SHARED_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `DEV_SISH_AUTHORIZED_KEYS` | secret | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_SSH_ALLOWLIST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_SSH_USER` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_WEBSITE_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `DEV_WEBSITE_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEV_WORKSPACE_OIDC_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `DEVC_NODE_IPS` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `DEVC_VIP` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `DEVMESH_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DEVMESH_PROFILE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `DOCS_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `EINVOICE_SIDECAR_ENABLED` | env | ja | — | runtime-generated (nicht versiegelt) |
| `EINVOICE_SIDECAR_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `EMAIL_NOTIFICATIONS_ENABLED` | env | ja | — | runtime-generated (nicht versiegelt) |
| `FILEN_EMAIL` | secret | ja | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `FILEN_PASSWORD` | secret | ja | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `FLUX_WEBHOOK_TOKEN` | secret | ja | `korczewski-prod.yaml` | workspace-korczewski/workspace-secrets |
| `FRITZ_BOX_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `FRITZ_BOX_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `GEKKO_SSH_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `GEKKO_SSH_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `GEMINI_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `GHCR_PAT` | secret | ja | `dev.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `GHCR_USERNAME` | secret | ja | — | runtime-generated (nicht versiegelt) |
| `GITHUB_CONTENT_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-content-token, workspace-korczewski/workspace-secrets, website-korczewski/website-content-token, workspace-staging/workspace-secrets, website-staging/website-content-token |
| `GITHUB_MODELS_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `GITHUB_PAT` | secret | ja | `dev.yaml`, `prodmesh-korczewski.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `GRAFANA_ADMIN_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, monitoring/grafana-oidc, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `GRAFANA_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `HETZNER_API_KEY` | secret | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `HUGGINGFACE_TOKEN` | secret | ja | `dev.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/knowledge-secrets, workspace-korczewski/workspace-secrets, workspace-korczewski/knowledge-secrets, workspace-staging/workspace-secrets, workspace-staging/knowledge-secrets |
| `INFRA_NAMESPACE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `INTERNAL_API_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `IPV64_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, cert-manager/ipv64-api-key, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `IPV64_UPDATE_HASH` | secret | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `KC_USER1_EMAIL` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `KC_USER1_PASSWORD` | setup | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `KC_USER1_USERNAME` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `KC_USER2_EMAIL` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `KC_USER2_PASSWORD` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `KC_USER2_USERNAME` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `KORCZEWSKI_PROD_APEX_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `KORCZEWSKI_PROD_AUTH_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `KORCZEWSKI_PROD_WEB_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LANGFUSE_CLICKHOUSE_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `LANGFUSE_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `LANGFUSE_ENCRYPTION_KEY` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `LANGFUSE_INIT_PROJECT_SECRET_KEY` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `LANGFUSE_INIT_USER_EMAIL` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `LANGFUSE_INIT_USER_NAME` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `LANGFUSE_INIT_USER_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `LANGFUSE_NEXTAUTH_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `LANGFUSE_PUBLIC_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LANGFUSE_REDIS_AUTH` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `LANGFUSE_S3_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `LANGFUSE_SALT` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `LEGAL_JOBTITLE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LEGAL_STREET` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LEGAL_UST_ID` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LEGAL_WEBSITE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LEGAL_ZIP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_EMBED_MODEL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_EMBED_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_ENABLED` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_GATEWAY_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_HOST_IP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_PROXY_ADMIN_TOKEN` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `LLM_RERANK_ENABLED` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_RERANKER_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `LLM_ROUTER_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `LLM_ROUTER_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `MAIL_EXTERNAL_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `MAIL_FROM_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `MAIL_FROM_LOCAL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `MAIL_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `MAILBOX_EMAIL` | secret | ja | — | runtime-generated (nicht versiegelt) |
| `MAILBOX_PASSWORD` | secret | ja | — | runtime-generated (nicht versiegelt) |
| `MCP_POSTGRES_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `MCP_READONLY_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets |
| `MEDIAVIEWER_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `MEDIAVIEWER_OIDC_CLIENT_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `MEETING_INTERNAL_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `MEETINGS_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `MONITORING_WEBHOOK_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `NEXTCLOUD_ADMIN_PASS` | external | extern | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `NEXTCLOUD_ADMIN_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `NEXTCLOUD_CALDAV_PASSWORD` | external | extern | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `NEXTCLOUD_DB_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `NEXTCLOUD_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `NEXTCLOUD_EXTERNAL_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `NEXTCLOUD_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `NTFY_BASE_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `NTFY_TOKEN_AGY` | secret | ja | `dev.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-staging/workspace-secrets |
| `NTFY_TOKEN_OPEncode` | external | extern | `dev.yaml` | workspace/workspace-secrets |
| `NTFY_TOKEN_OPENCODE` | secret | ja | `staging.yaml` | workspace-staging/workspace-secrets |
| `OAUTH2_PROXY_COOKIE_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `OPENCODE_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `OPENCODE_PUBLIC_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `OPENCODE_SERVER_PASSWORD` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `OPENROUTER_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `OTEL_AUTH_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, monitoring/otel-collector-auth, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `OTEL_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `PATRICK_SSH_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `PATRICK_SSH_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `PINO_LOG_LEVEL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POCKET_ID_API_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `POCKET_ID_BRAIN_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_BRAINSTORM_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_BRETT_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `POCKET_ID_CBM_LENS_SECRET` | external | extern | `dev.yaml` | workspace/workspace-secrets |
| `POCKET_ID_CLAUDE_CODE_SECRET` | secret | ja | `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_COMFY_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_DOCS_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POCKET_ID_DOWNLOADS_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_ENCRYPTION_KEY` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_FALLBACK_FRONTEND_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POCKET_ID_FALLBACK_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POCKET_ID_FRITZBOX_SECRET` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `POCKET_ID_FRONTEND_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POCKET_ID_GRAFANA_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, monitoring/grafana-oidc, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_KORCZEWSKI_DB_PASSWORD` | secret | ja | `korczewski-prod.yaml`, `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `POCKET_ID_MAIL_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_MASSAGE_KORCZEWSKI_SECRET` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `POCKET_ID_MEDIAVIEWER_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_NEXTCLOUD_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_OPENCODE_SECRET` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `POCKET_ID_RECOVERY_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_RUSTDESK_WEB_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_SESSION_HUB_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_SMTP_TLS` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POCKET_ID_STUDIO_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_TERMINAL_SECRET` | secret | ja | `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_TRAEFIK_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POCKET_ID_VAULTWARDEN_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_VIDEOVAULT_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `POCKET_ID_WEB_KORCZEWSKI_SECRET` | secret | ja | `dev.yaml` | workspace/workspace-secrets |
| `POCKET_ID_WEBSITE_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `POD_CIDR` | env | ja | — | runtime-generated (nicht versiegelt) |
| `POD_VTEP_IP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `PRIMARY_FRONTEND` | env | ja | — | runtime-generated (nicht versiegelt) |
| `PROD_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `PVE_HOSTS` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `PVE_SSH_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `PVE_SSH_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `PVE2_SSH_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `PVE2_SSH_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `PVE3_SSH_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `PVE3_SSH_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `REACT_APP_ORIGIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `RECORDING_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `RECOVER_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `RECOVERY_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `RIGGER_HOST_IP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `RIGGER_PORT` | env | ja | — | runtime-generated (nicht versiegelt) |
| `RUSTDESK_ID_ED25519` | secret | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `RUSTDESK_ID_ED25519_PUB` | secret | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `SDLC_CONSOLE_POCKET_ID_CLIENT_ID` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SDLC_CONSOLE_POCKET_ID_FRONTEND_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SDLC_CONSOLE_POCKET_ID_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SDLC_CONSOLE_SITE_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SEPA_CREDITOR_BIC` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `SEPA_CREDITOR_IBAN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `SEPA_CREDITOR_ID` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `SERVICE_CIDR` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SESSION_HUB_OIDC_SECRET` | external | extern | `staging.yaml` | workspace-staging/workspace-secrets |
| `SESSION_HUB_REGISTRY` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SESSION_HUB_REGISTRY_WRITABLE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SESSIONS_ARCHIVE_DIR` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SESSIONS_CRON_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `SESSIONS_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SHARED_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `SIGNALING_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `SMTP_FROM` | env | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `SMTP_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SMTP_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `SMTP_PORT` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SMTP_SECURE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `SMTP_USER` | env | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `STUDIO_DB_URL` | secret | ja | `dev.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `STUDIO_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `STUDIO_IMAGE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `STUDIO_IMAGE_DIGEST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `STUDIO_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `SYSTEMTEST_LOOP_ENABLED` | env | ja | — | runtime-generated (nicht versiegelt) |
| `TERMINAL_OVERLAY_IP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `TLS_SECRET_NAME` | env | ja | — | runtime-generated (nicht versiegelt) |
| `TRACKING_DB_URL` | secret | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `TRAEFIK_EXTERNAL_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `TRAEFIK_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `TRANSCRIBER_BOT_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `TRANSCRIBER_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `TURN_NODE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `TURN_OVERLAY_IP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `TURN_PUBLIC_IP` | env | ja | — | runtime-generated (nicht versiegelt) |
| `TURN_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `VAULT_EXTERNAL_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `VAULTWARDEN_ADMIN_TOKEN` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `VAULTWARDEN_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `VAULTWARDEN_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `VECTOR_DB_ENABLED` | env | ja | — | runtime-generated (nicht versiegelt) |
| `VIDEOVAULT_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `VIDEOVAULT_DOMAIN` | env | ja | — | runtime-generated (nicht versiegelt) |
| `VIDEOVAULT_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `VOYAGE_API_KEY` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `WEBSITE_CONFIG_SHA` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_DB_NAME` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_DB_NAMESPACE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, workspace-staging/workspace-secrets, website-staging/website-secrets |
| `WEBSITE_DB_USER` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_HOST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_IMAGE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_IMAGE_DIGEST` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_IMAGE_TAG` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_MASSAGE_DB_PASSWORD` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/website-secrets, workspace-korczewski/workspace-secrets, website-korczewski/website-secrets, website-staging/website-secrets |
| `WEBSITE_NAMESPACE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_NODE_AFFINITY` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_OIDC_SECRET` | external | extern | `prodmesh-korczewski.yaml`, `staging.yaml` | workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `WEBSITE_PRIMARY_SERVICE` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WEBSITE_SITE_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WG_INTERNAL_CIDR` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_GEKKO2_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_GEKKO2_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_GEKKO3_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_GEKKO3_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_GEKKO4_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_GEKKO4_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_K3S1_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_K3S1_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_K3S2_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_K3S2_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_K3S3_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_K3S3_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_PK_L1_WORKER_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PK_L1_WORKER_PUBLIC_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PK4_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PK4_PUBLIC_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PK6_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PK6_PUBLIC_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PK8_PRIVATE_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PK8_PUBLIC_KEY` | setup | ja | `prodmesh-korczewski.yaml` | workspace-korczewski/workspace-secrets |
| `WG_MESH_PKL1_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_PKL1_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_PKT_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_PKT_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_TERMINAL_PRIVATE_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WG_MESH_TERMINAL_PUBLIC_KEY` | setup | ja | — | runtime-generated (nicht versiegelt) |
| `WHISPER_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WHITEBOARD_EXTERNAL_URL` | env | ja | — | runtime-generated (nicht versiegelt) |
| `WHITEBOARD_JWT_SECRET` | secret | ja | `dev.yaml`, `korczewski-prod.yaml`, `prodmesh-korczewski.yaml`, `staging.yaml` | workspace/workspace-secrets, workspace-korczewski/workspace-secrets, workspace-staging/workspace-secrets |
| `WORKSPACE_NAMESPACE` | env | ja | — | runtime-generated (nicht versiegelt) |

## Externe Keys (nicht in schema.yaml)

- `BRAINSTORM_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `CLAUDE_CODE_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `COMFY_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `DEV_MCP_TOKEN` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `DOCS_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `GRAFANA_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `MAIL_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `MEDIAVIEWER_OIDC_CLIENT_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `NEXTCLOUD_ADMIN_PASS` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `NEXTCLOUD_CALDAV_PASSWORD` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `NEXTCLOUD_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `NTFY_TOKEN_OPEncode` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `POCKET_ID_CBM_LENS_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `RECOVERY_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `SESSION_HUB_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `STUDIO_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `TRAEFIK_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `VAULTWARDEN_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `VIDEOVAULT_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `VOYAGE_API_KEY` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
- `WEBSITE_OIDC_SECRET` — In sealed-Manifesten vorhanden, aber nicht in schema.yaml kuratiert (Drift-Kandidat).
