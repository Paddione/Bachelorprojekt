# Architektur — Living Docs

90 Services · 1911 Abhängigkeitskanten · 414 API-Endpoints

## Service-Map

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"background": "#0d0d0d", "primaryColor": "#f59e0b", "edgeLabelBackground": "#1a1a1a"}}}%%
flowchart LR
  classDef default fill:#1a1a1a,stroke:#2a2a2a,color:#e5e7eb
  classDef db fill:#1a1a1a,stroke:#f59e0b,color:#f59e0b
  classDef ingress fill:#1a1a1a,stroke:#10b981,color:#10b981
  classDef auth fill:#1a1a1a,stroke:#8b5cf6,color:#8b5cf6
  admin_actions_cleanup["admin-actions-cleanup"]:::default
  admin_actions_prune["admin-actions-prune"]:::default
  sessions_purge["sessions-purge"]:::default
  db_backup["db-backup"]:::default
  brain["brain"]:::default
  brett["brett"]:::default
  coturn["coturn"]:::default
  janus["janus"]:::default
  billing_dunning_detection["billing-dunning-detection"]:::default
  monthly_billing["monthly-billing"]:::default
  scheduled_publish["scheduled-publish"]:::default
  systemtest_cleanup["systemtest-cleanup"]:::default
  systemtest_purge_all["systemtest-purge-all"]:::default
  systemtest_outbox["systemtest-outbox"]:::default
  claude_code_mcp_monolith["claude-code-mcp-monolith"]:::default
  oauth2_proxy_brainstorm["oauth2-proxy-brainstorm"]:::default
  oauth2_proxy_dev["oauth2-proxy-dev"]:::default
  oauth2_proxy_session_hub["oauth2-proxy-session-hub"]:::default
  shared_db_dev["shared-db-dev"]:::default
  sish["sish"]:::default
  website["website"]:::default
  docs["docs"]:::default
  downloads["downloads"]:::default
  einvoice_sidecar["einvoice-sidecar"]:::default
  error_log_retention["error-log-retention"]:::default
  knowledge_ingest_prs["knowledge-ingest-prs"]:::default
  knowledge_ingest_markdown["knowledge-ingest-markdown"]:::default
  knowledge_ingest_bugs["knowledge-ingest-bugs"]:::default
  knowledge_reindex_all["knowledge-reindex-all"]:::default
  livekit_egress["livekit-egress"]:::default
  mailpit["mailpit"]:::default
  mediaviewer_widget["mediaviewer-widget"]:::default
  mentolder_web["mentolder-web"]:::default
  monitoring_grafana["monitoring-grafana"]:::default
  monitoring_kube_state_metrics["monitoring-kube-state-metrics"]:::default
  monitoring_operator["monitoring-operator"]:::default
  loki["loki"]:::default
  otel_collector["otel-collector"]:::default
  nextcloud_redis["nextcloud-redis"]:::default
  nextcloud["nextcloud"]:::default
  notify_unread["notify-unread"]:::default
  ntfy["ntfy"]:::default
  oauth2_proxy_brain["oauth2-proxy-brain"]:::default
  oauth2_proxy_brett["oauth2-proxy-brett"]:::default
  oauth2_proxy_comfy["oauth2-proxy-comfy"]:::default
  oauth2_proxy_docs["oauth2-proxy-docs"]:::default
  oauth2_proxy_downloads["oauth2-proxy-downloads"]:::default
  oauth2_proxy_mailpit["oauth2-proxy-mailpit"]:::default
  oauth2_proxy_mediaviewer["oauth2-proxy-mediaviewer"]:::default
  oauth2_proxy_rustdesk_web["oauth2-proxy-rustdesk-web"]:::default
  oauth2_proxy_studio["oauth2-proxy-studio"]:::default
  oauth2_proxy_terminal["oauth2-proxy-terminal"]:::default
  oauth2_proxy_traefik["oauth2-proxy-traefik"]:::default
  oauth2_proxy_videovault["oauth2-proxy-videovault"]:::default
  collabora["collabora"]:::default
  pocket_id["pocket-id"]:::default
  pvc_backup["pvc-backup"]:::default
  recovery_browser["recovery-browser"]:::default
  oauth2_proxy_recovery["oauth2-proxy-recovery"]:::default
  hbbr["hbbr"]:::default
  hbbs["hbbs"]:::default
  sealed_secrets_controller["sealed-secrets-controller"]:::default
  sessions_server["sessions-server"]:::default
  shared_db["shared-db"]:::db
  shared_db_staging["shared-db-staging"]:::default
  studio_server["studio-server"]:::default
  nats["nats"]:::default
  spreed_signaling["spreed-signaling"]:::default
  talk_recording["talk-recording"]:::default
  tests_results_retention["tests-results-retention"]:::default
  vaultwarden["vaultwarden"]:::default
  videovault["videovault"]:::default
  whiteboard["whiteboard"]:::default
  coredns["coredns"]:::default
  tls_sync["tls-sync"]:::default
  dev_db_refresh["dev-db-refresh"]:::default
  talk_transcriber["talk-transcriber"]:::default
  whisper["whisper"]:::default
  ddns_updater["ddns-updater"]:::default
  traefik["traefik"]:::ingress
  apiinternal["api@internal"]:::default
  WEBSITE_PRIMARY_SERVICE["${WEBSITE_PRIMARY_SERVICE}"]:::default
  old_webspace["old-webspace"]:::default
  bachelorprojekt["bachelorprojekt"]:::default
  shared_db_dev_lb["shared-db-dev-lb"]:::default
  keycloak["keycloak"]:::auth
  tracking["tracking"]:::default
  docuseal["docuseal"]:::default
  livekit["livekit"]:::default
  livekit_server["livekit-server"]:::default
  admin_actions_cleanup -->|"PGHOST"| shared_db
  admin_actions_cleanup -->|"PGUSER"| website
  admin_actions_prune -->|"PGHOST"| shared_db
  admin_actions_prune -->|"PGUSER"| website
  sessions_purge -->|"command"| website
  db_backup -->|"command"| shared_db
  db_backup -->|"command"| nextcloud
  db_backup -->|"command"| vaultwarden
  db_backup -->|"command"| website
  brett -->|"DATABASE_URL"| shared_db
  brett -->|"DATABASE_URL"| website
  billing_dunning_detection -->|"command"| website
  monthly_billing -->|"command"| website
  scheduled_publish -->|"command"| website
  systemtest_cleanup -->|"command"| website
  systemtest_purge_all -->|"command"| website
  systemtest_outbox -->|"command"| website
  claude_code_mcp_monolith -->|"DATABASE_URL"| shared_db
  claude_code_mcp_monolith -->|"DATABASE_URL"| website
  claude_code_mcp_monolith -->|"KC_URL"| keycloak
  oauth2_proxy_dev -->|"command"| traefik
  error_log_retention -->|"command"| website
  knowledge_ingest_prs -->|"PGHOST"| shared_db
  knowledge_ingest_prs -->|"PGDATABASE"| website
  knowledge_ingest_markdown -->|"configmap:knowledg…"| shared_db
  knowledge_ingest_markdown -->|"configmap:knowledg…"| website
  knowledge_ingest_bugs -->|"PGHOST"| shared_db
  knowledge_ingest_bugs -->|"PGDATABASE"| website
  knowledge_reindex_all -->|"PGHOST"| shared_db
  knowledge_reindex_all -->|"PGDATABASE"| website
  livekit_egress -->|"EGRESS_CONFIG_BODY"| livekit_server
  nextcloud -->|"SMTP_HOST"| mailpit
  nextcloud -->|"configmap:domain-c…"| brett
  nextcloud -->|"configmap:domain-c…"| traefik
  nextcloud -->|"configmap:nextclou…"| spreed_signaling
  notify_unread -->|"command"| website
  oauth2_proxy_brett -->|"command"| brett
  oauth2_proxy_traefik -->|"command"| traefik
  pocket_id -->|"DB_CONNECTION_STRING"| shared_db
  pocket_id -->|"configmap:domain-c…"| brett
  pocket_id -->|"configmap:domain-c…"| traefik
  pvc_backup -->|"command"| nextcloud
  pvc_backup -->|"command"| vaultwarden
  oauth2_proxy_recovery -->|"command"| recovery_browser
  shared_db -->|"configmap:shared-d…"| nextcloud
  shared_db -->|"configmap:shared-d…"| vaultwarden
  shared_db -->|"configmap:shared-d…"| website
  shared_db -->|"configmap:website-…"| brett
  shared_db -->|"configmap:website-…"| tracking
  shared_db -->|"configmap:website-…"| docuseal
  shared_db -->|"configmap:website-…"| whiteboard
  studio_server -->|"KEYCLOAK_ISSUER_ME…"| keycloak
  spreed_signaling -->|"configmap:signalin…"| coturn
  spreed_signaling -->|"configmap:signalin…"| nats
  spreed_signaling -->|"configmap:signalin…"| janus
  talk_recording -->|"NC_DOMAIN"| nextcloud
  talk_recording -->|"HPB_DOMAIN"| spreed_signaling
  tests_results_retention -->|"command"| website
  vaultwarden -->|"DATABASE_URL"| shared_db
  vaultwarden -->|"SMTP_HOST"| mailpit
  vaultwarden -->|"configmap:domain-c…"| brett
  vaultwarden -->|"configmap:domain-c…"| traefik
  videovault -->|"DATABASE_URL"| shared_db
  website -->|"SESSIONS_DATABASE_…"| shared_db
  website -->|"configmap:website-…"| nextcloud
  website -->|"configmap:website-…"| brett
  website -->|"configmap:domain-c…"| traefik
  whiteboard -->|"NEXTCLOUD_URL"| nextcloud
  tls_sync -->|"command"| coturn
  dev_db_refresh -->|"SOURCE_PGHOST"| shared_db
  talk_transcriber -->|"NC_DB_HOST"| shared_db
  talk_transcriber -->|"NC_DB_NAME"| nextcloud
  ddns_updater -->|"command"| livekit
  ddns_updater -->|"command"| coturn
  ddns_updater -->|"command"| janus
  traefik -->|"ingress"| brett
  traefik -->|"ingress"| oauth2_proxy_dev
  traefik -->|"ingress"| oauth2_proxy_brainstorm
  traefik -->|"ingress"| sish
  traefik -->|"ingress"| oauth2_proxy_session_hub
  traefik -->|"ingress"| website
  traefik -->|"ingress"| pocket_id
  traefik -->|"ingress"| nextcloud
  traefik -->|"ingress"| whiteboard
  traefik -->|"ingress"| spreed_signaling
  traefik -->|"ingress"| vaultwarden
  traefik -->|"ingress"| mentolder_web
  traefik -->|"ingress"| oauth2_proxy_docs
  traefik -->|"ingress"| oauth2_proxy_brain
  traefik -->|"ingress"| oauth2_proxy_downloads
  traefik -->|"ingress"| oauth2_proxy_brett
  traefik -->|"ingress"| oauth2_proxy_comfy
  traefik -->|"ingress"| oauth2_proxy_mediaviewer
  traefik -->|"ingress"| oauth2_proxy_videovault
  traefik -->|"ingress"| oauth2_proxy_studio
  traefik -->|"ingress"| oauth2_proxy_rustdesk_web
  traefik -->|"ingress"| oauth2_proxy_terminal
  traefik -->|"ingress"| oauth2_proxy_mailpit
  traefik -->|"ingress"| mailpit
  traefik -->|"ingress"| monitoring_grafana
  traefik -->|"ingress"| otel_collector
  traefik -->|"ingress"| ntfy
  traefik -->|"ingress"| collabora
  traefik -->|"ingress"| oauth2_proxy_recovery
  traefik -->|"ingress"| oauth2_proxy_traefik
  traefik -->|"ingress"| apiinternal
  traefik -->|"ingress"| WEBSITE_PRIMARY_SERVICE
  traefik -->|"ingress"| old_webspace
  traefik -->|"ingress"| bachelorprojekt
  traefik -->|"ingress"| sessions_server
  brain -->|"selector"| brain
  coturn -->|"selector"| coturn
  janus -->|"selector"| janus
  claude_code_mcp_monolith -->|"selector"| claude_code_mcp_monolith
  oauth2_proxy_brainstorm -->|"selector"| oauth2_proxy_brainstorm
  oauth2_proxy_dev -->|"selector"| oauth2_proxy_dev
  oauth2_proxy_session_hub -->|"selector"| oauth2_proxy_session_hub
  shared_db_dev_lb -->|"selector"| shared_db_dev
  shared_db_dev -->|"selector"| shared_db_dev
  sish -->|"selector"| sish
  website -->|"selector"| website
  docs -->|"selector"| docs
  downloads -->|"selector"| downloads
  einvoice_sidecar -->|"selector"| einvoice_sidecar
  mailpit -->|"selector"| mailpit
  mediaviewer_widget -->|"selector"| mediaviewer_widget
  mentolder_web -->|"selector"| mentolder_web
  monitoring_kube_state_metrics -->|"selector"| monitoring_kube_state_metrics
  monitoring_operator -->|"selector"| monitoring_operator
  otel_collector -->|"selector"| otel_collector
  nextcloud_redis -->|"selector"| nextcloud_redis
  ntfy -->|"selector"| ntfy
  collabora -->|"selector"| collabora
  recovery_browser -->|"selector"| recovery_browser
  oauth2_proxy_recovery -->|"selector"| oauth2_proxy_recovery
  sealed_secrets_controller -->|"selector"| sealed_secrets_controller
  sessions_server -->|"selector"| sessions_server
  shared_db_staging -->|"selector"| shared_db_staging
  nats -->|"selector"| nats
  spreed_signaling -->|"selector"| spreed_signaling
  talk_recording -->|"selector"| talk_recording
  videovault -->|"selector"| videovault
  whiteboard -->|"selector"| whiteboard
  talk_transcriber -->|"selector"| talk_transcriber
  whisper -->|"selector"| whisper
  admin_actions_cleanup -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| admin_actions_cleanup
  shared_db -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_cleanup -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| admin_actions_cleanup
  admin_actions_prune -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| admin_actions_prune
  shared_db -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| admin_actions_prune
  admin_actions_prune -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| admin_actions_prune
  sessions_purge -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| sessions_purge
  sessions_purge -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| sessions_purge
  db_backup -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| db_backup
  nextcloud -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| db_backup
  shared_db -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| db_backup
  vaultwarden -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| db_backup
  db_backup -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| db_backup
  brett -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| nextcloud
  brett -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| pocket_id
  brett -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| vaultwarden
  brett -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| brett
  brett -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| brett
  billing_dunning_detection -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| billing_dunning_detection
  billing_dunning_detection -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| billing_dunning_detection
  monthly_billing -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| monthly_billing
  monthly_billing -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| monthly_billing
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| scheduled_publish
  scheduled_publish -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| scheduled_publish
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_brainstorm -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_brainstorm
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_dev -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_dev
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  oauth2_proxy_session_hub -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_session_hub
  error_log_retention -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| error_log_retention
  error_log_retention -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| error_log_retention
  knowledge_ingest_prs -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| knowledge_ingest_prs
  shared_db -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_prs -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| knowledge_ingest_prs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| knowledge_ingest_bugs
  shared_db -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_ingest_bugs -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| knowledge_ingest_bugs
  knowledge_reindex_all -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| knowledge_reindex_all
  shared_db -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| knowledge_reindex_all
  knowledge_reindex_all -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| knowledge_reindex_all
  livekit_egress -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| livekit_egress
  livekit_egress -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| livekit_egress
  nextcloud -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| shared_db
  nextcloud -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| nextcloud
  spreed_signaling -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| talk_recording
  nextcloud -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| whiteboard
  nextcloud -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| nextcloud
  nextcloud -->|"secret:workspace-s…"| talk_transcriber
  nextcloud -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| nextcloud
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| notify_unread
  notify_unread -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| notify_unread
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brain -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_brain
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_brett -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_brett
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_comfy -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_comfy
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_docs -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_docs
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_downloads -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_downloads
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mailpit -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_mailpit
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_mediaviewer -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_mediaviewer
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_rustdesk_web -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_rustdesk_web
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_studio -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_studio
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_terminal -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_terminal
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_traefik -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_traefik
  oauth2_proxy_videovault -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_videovault
  oauth2_proxy_videovault -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_videovault
  pocket_id -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| pocket_id
  shared_db -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| pocket_id
  pocket_id -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| pocket_id
  oauth2_proxy_recovery -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| oauth2_proxy_recovery
  oauth2_proxy_recovery -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| oauth2_proxy_recovery
  shared_db -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| videovault
  whiteboard -->|"secret:workspace-s…"| shared_db
  shared_db -->|"secret:workspace-s…"| dev_db_refresh
  shared_db -->|"secret:workspace-s…"| talk_transcriber
  shared_db -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| shared_db
  studio_server -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| studio_server
  studio_server -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| studio_server
  spreed_signaling -->|"secret:workspace-s…"| talk_recording
  spreed_signaling -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| spreed_signaling
  spreed_signaling -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| spreed_signaling
  talk_recording -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| talk_recording
  talk_recording -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| talk_recording
  vaultwarden -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| vaultwarden
  vaultwarden -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| vaultwarden
  videovault -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| videovault
  videovault -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| videovault
  whiteboard -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| whiteboard
  whiteboard -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| whiteboard
  dev_db_refresh -->|"secret:workspace-s…"| talk_transcriber
  talk_transcriber -->|"secret:workspace-s…"| dev_db_refresh
  dev_db_refresh -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| dev_db_refresh
  talk_transcriber -->|"secret:workspace-s…"| ddns_updater
  ddns_updater -->|"secret:workspace-s…"| talk_transcriber
  systemtest_cleanup -->|"secret:website-sec…"| systemtest_purge_all
  systemtest_purge_all -->|"secret:website-sec…"| systemtest_cleanup
  systemtest_cleanup -->|"secret:website-sec…"| systemtest_outbox
  systemtest_outbox -->|"secret:website-sec…"| systemtest_cleanup
  website -->|"secret:website-sec…"| systemtest_cleanup
  systemtest_purge_all -->|"secret:website-sec…"| systemtest_outbox
  systemtest_outbox -->|"secret:website-sec…"| systemtest_purge_all
  website -->|"secret:website-sec…"| systemtest_purge_all
  website -->|"secret:website-sec…"| systemtest_outbox
  brett -->|"secret:shared-db-d…"| shared_db_dev
  shared_db_dev -->|"secret:shared-db-d…"| brett
  shared_db_dev -->|"secret:shared-db-d…"| website
  website -->|"secret:shared-db-d…"| shared_db_dev
  shared_db_staging -->|"secret:staging-db-…"| website
  website -->|"secret:staging-db-…"| shared_db_staging
```

## K8s-Topology

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"background": "#0d0d0d", "primaryColor": "#f59e0b"}}}%%
flowchart TB
  subgraph mentolder["workspace (mentolder)"]
    admin_actions_cleanup(["admin-actions-cleanup"])
    admin_actions_prune(["admin-actions-prune"])
    sessions_purge(["sessions-purge"])
    db_backup(["db-backup"])
    brain["brain"]
    brett["brett"]
    billing_dunning_detection(["billing-dunning-detection"])
    monthly_billing(["monthly-billing"])
    scheduled_publish(["scheduled-publish"])
    oauth2_proxy_brainstorm["oauth2-proxy-brainstorm"]
    oauth2_proxy_session_hub["oauth2-proxy-session-hub"]
    shared_db_dev["shared-db-dev"]
    sish["sish"]
    website["website"]
    docs["docs"]
    downloads["downloads"]
    einvoice_sidecar["einvoice-sidecar"]
    error_log_retention(["error-log-retention"])
    knowledge_ingest_prs(["knowledge-ingest-prs"])
    knowledge_ingest_markdown(["knowledge-ingest-markdown"])
    knowledge_ingest_bugs(["knowledge-ingest-bugs"])
    knowledge_reindex_all(["knowledge-reindex-all"])
    livekit_egress["livekit-egress"]
    mailpit["mailpit"]
    mediaviewer_widget["mediaviewer-widget"]
    mentolder_web["mentolder-web"]
    nextcloud_redis["nextcloud-redis"]
    nextcloud["nextcloud"]
    notify_unread(["notify-unread"])
    ntfy["ntfy"]
    oauth2_proxy_brain["oauth2-proxy-brain"]
    oauth2_proxy_brett["oauth2-proxy-brett"]
    oauth2_proxy_comfy["oauth2-proxy-comfy"]
    oauth2_proxy_docs["oauth2-proxy-docs"]
    oauth2_proxy_downloads["oauth2-proxy-downloads"]
    oauth2_proxy_mailpit["oauth2-proxy-mailpit"]
    oauth2_proxy_mediaviewer["oauth2-proxy-mediaviewer"]
    oauth2_proxy_rustdesk_web["oauth2-proxy-rustdesk-web"]
    oauth2_proxy_studio["oauth2-proxy-studio"]
    oauth2_proxy_terminal["oauth2-proxy-terminal"]
    oauth2_proxy_traefik["oauth2-proxy-traefik"]
    oauth2_proxy_videovault["oauth2-proxy-videovault"]
    pocket_id["pocket-id"]
    pvc_backup(["pvc-backup"])
    recovery_browser["recovery-browser"]
    oauth2_proxy_recovery["oauth2-proxy-recovery"]
    sessions_server["sessions-server"]
    shared_db["shared-db"]
    studio_server["studio-server"]
    nats["nats"]
    spreed_signaling["spreed-signaling"]
    talk_recording["talk-recording"]
    vaultwarden["vaultwarden"]
    videovault["videovault"]
    whiteboard["whiteboard"]
    talk_transcriber["talk-transcriber"]
    whisper["whisper"]
    ddns_updater(["ddns-updater"])
    traefik["traefik"]
    apiinternal["api@internal"]
    WEBSITE_PRIMARY_SERVICE["${WEBSITE_PRIMARY_SERVICE}"]
    old_webspace["old-webspace"]
    bachelorprojekt["bachelorprojekt"]
    shared_db_dev_lb["shared-db-dev-lb"]
    keycloak["keycloak"]
    tracking["tracking"]
    docuseal["docuseal"]
    livekit["livekit"]
    livekit_server["livekit-server"]
  end
  subgraph coturn["coturn"]
    coturn["coturn"]
    janus["janus"]
  end
  subgraph WEBSITE_NAMESPACE["${WEBSITE_NAMESPACE}"]
    systemtest_cleanup(["systemtest-cleanup"])
    systemtest_purge_all(["systemtest-purge-all"])
    systemtest_outbox(["systemtest-outbox"])
  end
  subgraph default["default"]
    claude_code_mcp_monolith["claude-code-mcp-monolith"]
  end
  subgraph workspace_dev["workspace-dev"]
    oauth2_proxy_dev["oauth2-proxy-dev"]
  end
  subgraph monitoring["monitoring"]
    monitoring_grafana["monitoring-grafana"]
    monitoring_kube_state_metrics["monitoring-kube-state-metrics"]
    monitoring_operator["monitoring-operator"]
    loki["loki"]
    otel_collector["otel-collector"]
  end
  subgraph workspace_office["workspace-office"]
    collabora["collabora"]
  end
  subgraph rustdesk["rustdesk"]
    hbbr["hbbr"]
    hbbs["hbbs"]
  end
  subgraph sealed_secrets["sealed-secrets"]
    sealed_secrets_controller["sealed-secrets-controller"]
  end
  subgraph STAGING_NS["$STAGING_NS"]
    shared_db_staging["shared-db-staging"]
  end
  subgraph WORKSPACE_NAMESPACE["${WORKSPACE_NAMESPACE}"]
    tests_results_retention(["tests-results-retention"])
    tls_sync(["tls-sync"])
    dev_db_refresh(["dev-db-refresh"])
  end
  subgraph kube_system["kube-system"]
    coredns["coredns"]
  end
```

## API-Surface

| Path | Methods | Auth |
|------|---------|------|
| `/api/admin/agent-push/settings` | GET, POST | 🔐 admin |
| `/api/admin/ai-quality` | GET | 🔐 admin |
| `/api/admin/angebote/save` | POST | 🔐 admin |
| `/api/admin/art-library` | GET | 🔐 admin |
| `/api/admin/assets` | GET | 🔐 admin |
| `/api/admin/assets/upload` | POST | 🔐 admin |
| `/api/admin/backup-status` | GET | 🔐 admin |
| `/api/admin/billing/{id}` | GET | 🔐 admin |
| `/api/admin/billing/{id}/discard` | POST | 🔐 admin |
| `/api/admin/billing/{id}/finalize-from-prepayment` | POST | 🔐 admin |
| `/api/admin/billing/{id}/item` | POST, PATCH, DELETE | 🔐 admin |
| `/api/admin/billing/{id}/payments` | GET, POST | 🔐 admin |
| `/api/admin/billing/{id}/send` | POST | 🔐 admin |
| `/api/admin/billing/{id}/storno` | POST | 🔐 admin |
| `/api/admin/billing/{id}/validate` | POST | 🔐 admin |
| `/api/admin/billing/create-invoice` | POST | 🔐 admin |
| `/api/admin/billing/create-monthly-invoices` | POST | 🔐 admin |
| `/api/admin/billing/customers/{id}/leitweg` | PATCH | 🔐 admin |
| `/api/admin/billing/datev-email` | POST | 🔐 admin |
| `/api/admin/billing/datev-export` | GET | 🔐 admin |
| `/api/admin/billing/draft-count` | GET | 🔐 admin |
| `/api/admin/billing/drafts` | GET | 🔐 admin |
| `/api/admin/billing/dunning/{id}/send` | POST | 🔐 admin |
| `/api/admin/billing/dunning/run` | POST, GET | 🔐 admin |
| `/api/admin/billing/integrity-check` | GET | 🔐 admin |
| `/api/admin/billing/sepa-export` | GET | 🔐 admin |
| `/api/admin/bookings/{uid}/delete` | DELETE | 🔐 admin |
| `/api/admin/bookings/{uid}/remind` | POST | 🔐 admin |
| `/api/admin/bookings/{uid}/status` | PATCH | 🔐 admin |
| `/api/admin/bookings/create` | POST | 🔐 admin |
| `/api/admin/bookkeeping/summary` | GET | 🔐 admin |
| `/api/admin/brand-starter` | GET | 🔐 admin |
| `/api/admin/brett/broadcast` | GET, POST | 🔐 admin |
| `/api/admin/bugs/{id}` | GET | 🔐 admin |
| `/api/admin/bugs/{id}/comments` | POST | 🔐 admin |
| `/api/admin/bugs/archive` | POST | 🔐 admin |
| `/api/admin/bugs/create` | POST | 🔐 admin |
| `/api/admin/bugs/list` | GET | 🔐 admin |
| `/api/admin/bugs/reopen` | POST | 🔐 admin |
| `/api/admin/bugs/resolve` | POST | 🔐 admin |
| `/api/admin/clientnotes/create` | POST | 🔐 admin |
| `/api/admin/clientnotes/delete` | POST | 🔐 admin |
| `/api/admin/clients-list` | GET | 🔐 admin |
| `/api/admin/clients/contact-history/create` | POST | 🔐 admin |
| `/api/admin/clients/create` | POST | 🔐 admin |
| `/api/admin/clients/decline-enrollment` | POST | 🔐 admin |
| `/api/admin/clients/delete` | POST | 🔐 admin |
| `/api/admin/clients/enroll` | POST | 🔐 admin |
| `/api/admin/clients/flag-user` | POST | 🔐 admin |
| `/api/admin/clients/newsletter-toggle` | POST | 🔐 admin |
| `/api/admin/clients/reset-password` | POST | 🔐 admin |
| `/api/admin/clients/roles-assign` | POST | 🔐 admin |
| `/api/admin/clients/roles-remove` | POST | 🔐 admin |
| `/api/admin/clients/set-admin-number` | POST | 🔐 admin |
| `/api/admin/clients/set-customer-number` | POST | 🔐 admin |
| `/api/admin/clients/set-is-admin` | POST | 🔐 admin |
| `/api/admin/clients/update` | POST | 🔐 admin |
| `/api/admin/clients/update-crm` | POST | 🔐 admin |
| `/api/admin/cluster/graph` | GET | 🔐 admin |
| `/api/admin/cluster/logs` | GET | 🔐 admin |
| `/api/admin/cluster/pods-list` | GET | 🔐 admin |
| `/api/admin/cluster/warnings` | GET | 🔐 admin |
| `/api/admin/coaching/books` | GET | 🔐 admin |
| `/api/admin/coaching/books/{id}` | GET, DELETE | 🔐 admin |
| `/api/admin/coaching/books/{id}/acceptance-rate` | GET | 🔐 admin |
| `/api/admin/coaching/books/{id}/chunks` | GET | 🔐 admin |
| `/api/admin/coaching/books/upload` | POST | 🔐 admin |
| `/api/admin/coaching/clusters` | GET, POST | 🔐 admin |
| `/api/admin/coaching/drafts` | GET | 🔐 admin |
| `/api/admin/coaching/drafts/{id}` | GET | 🔐 admin |
| `/api/admin/coaching/drafts/{id}/accept` | POST | 🔐 admin |
| `/api/admin/coaching/drafts/{id}/reject` | POST | 🔐 admin |
| `/api/admin/coaching/ki-config` | GET, POST | 🔐 admin |
| `/api/admin/coaching/ki-config/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/ki-config/active` | PATCH | 🔐 admin |
| `/api/admin/coaching/ki-config/models` | GET | 🔐 admin |
| `/api/admin/coaching/projects` | GET | 🔐 admin |
| `/api/admin/coaching/projects/{id}` | GET, PATCH | 🔐 admin |
| `/api/admin/coaching/save` | POST | 🔐 admin |
| `/api/admin/coaching/sessions` | GET, POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}` | GET, PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/archive` | POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/audit` | GET | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/complete` | POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/status` | PATCH | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/steps/{n}` | PATCH | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/steps/{n}/generate` | POST | 🔐 admin |
| `/api/admin/coaching/sessions/{id}/unarchive` | POST | 🔐 admin |
| `/api/admin/coaching/snippets` | GET, POST | 🔐 admin |
| `/api/admin/coaching/snippets/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/snippets/{id}/draft-template` | POST | 🔐 admin |
| `/api/admin/coaching/step-templates` | GET, POST | 🔐 admin |
| `/api/admin/coaching/step-templates/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/coaching/templates` | GET | 🔐 admin |
| `/api/admin/coaching/templates/{id}` | GET, PATCH | 🔐 admin |
| `/api/admin/coaching/templates/{id}/publish` | POST | 🔐 admin |
| `/api/admin/coaching/templates/{id}/versions` | GET | 🔐 admin |
| `/api/admin/cockpit/batch` | POST | 🔐 admin |
| `/api/admin/cockpit/container-count` | GET | 🔐 admin |
| `/api/admin/cockpit/feature` | GET | 🔐 admin |
| `/api/admin/cockpit/feature-action` | POST | 🔐 admin |
| `/api/admin/cockpit/feature-actions` | POST | 🔐 admin |
| `/api/admin/cockpit/portfolio` | GET | 🔐 admin |
| `/api/admin/cockpit/reorder` | POST | 🔐 admin |
| `/api/admin/cockpit/reparent` | POST | 🔐 admin |
| `/api/admin/cockpit/suggest` | POST | 🔐 admin |
| `/api/admin/components` | GET, POST | 🔐 admin |
| `/api/admin/components/{id}` | PATCH, DELETE | 🔐 admin |
| `/api/admin/content/restore` | POST | 🔐 admin |
| `/api/admin/content/save` | POST | 🔐 admin |
| `/api/admin/content/versions` | GET | 🔐 admin |
| `/api/admin/customers` | GET | 🔐 admin |
| `/api/admin/customers-list` | GET | 🔐 admin |
| `/api/admin/delivery-metrics` | GET | 🔐 admin |
| `/api/admin/deployments` | GET | 🔐 admin |
| `/api/admin/deployments/{name}/restart` | POST | 🔐 admin |
| `/api/admin/deployments/{name}/scale` | POST | 🔐 admin |
| `/api/admin/documents/assign` | POST | 🔐 admin |
| `/api/admin/documents/assignments` | GET | 🔐 admin |
| `/api/admin/documents/assignments/{id}` | DELETE, PATCH | 🔐 admin |
| `/api/admin/documents/assignments/{id}/pdf` | GET | 🔐 admin |
| `/api/admin/documents/notify/{id}` | POST | 🔐 admin |
| `/api/admin/documents/templates` | GET, POST | 🔐 admin |
| `/api/admin/documents/templates/{id}` | GET, PUT, DELETE | 🔐 admin |
| `/api/admin/documents/templates/{id}/pdf` | GET | 🔐 admin |
| `/api/admin/einstellungen/backup` | POST | 🔐 admin |
| `/api/admin/einstellungen/benachrichtigungen` | POST | 🔐 admin |
| `/api/admin/einstellungen/branding` | POST | 🔐 admin |
| `/api/admin/einstellungen/email` | POST | 🔐 admin |
| `/api/admin/einstellungen/rechnungen` | POST | 🔐 admin |
| `/api/admin/einstellungen/upload-logo` | POST | 🔐 admin |
| `/api/admin/evidence/{id}/replay` | GET | 🔐 admin |
| `/api/admin/evidence/upload` | POST | 🔐 admin |
| `/api/admin/factory-control` | GET, PATCH | 🔐 admin |
| `/api/admin/faq/save` | POST | 🔐 admin |
| `/api/admin/folder-templates/create` | POST | 🔐 admin |
| `/api/admin/folder-templates/delete` | POST | 🔐 admin |
| `/api/admin/folder-templates/update` | POST | 🔐 admin |
| `/api/admin/footer/save` | POST | 🔐 admin |
| `/api/admin/fuehrung/save` | POST | 🔐 admin |
| `/api/admin/generate-3d` | POST | 🔐 admin |
| `/api/admin/generate-3d/status` | GET | 🔐 admin |
| `/api/admin/homepage/save` | OPTIONS, POST | 🔐 admin |
| `/api/admin/inbox` | GET | 🔐 admin |
| `/api/admin/inbox/{id}/action` | POST | 🔐 admin |
| `/api/admin/inbox/count` | GET | 🔐 admin |
| `/api/admin/inhalte/custom` | GET, POST | 🔐 admin |
| `/api/admin/inhalte/custom/{slug}` | PUT, DELETE | 🔐 admin |
| `/api/admin/inhalte/rechnungsvorlagen/preview` | GET | 🔐 admin |
| `/api/admin/inhalte/rechnungsvorlagen/save` | POST | 🔐 admin |
| `/api/admin/ki/catalog` | GET | 🔐 admin |
| `/api/admin/ki/embeddings` | GET, PUT | 🔐 admin |
| `/api/admin/ki/env-status` | GET | 🔐 admin |
| `/api/admin/ki/providers` | GET, POST | 🔐 admin |
| `/api/admin/ki/providers/{id}` | PUT, DELETE | 🔐 admin |
| `/api/admin/knowledge/collections` | GET, POST | 🔐 admin |
| `/api/admin/knowledge/collections/{id}` | GET, DELETE | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/context7` | POST, GET | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/context7-config` | PATCH | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/crawl` | POST, GET | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/crawl-config` | PATCH | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/documents` | POST | 🔐 admin |
| `/api/admin/knowledge/collections/{id}/reindex` | POST | 🔐 admin |
| `/api/admin/knowledge/collections/merge` | POST | 🔐 admin |
| `/api/admin/knowledge/collections/suggest` | GET | 🔐 admin |
| `/api/admin/knowledge/import/json` | POST | 🔐 admin |
| `/api/admin/kontakt/save` | POST | 🔐 admin |
| `/api/admin/kore-flags/save` | POST | 🔐 admin |
| `/api/admin/legal/{key}/save` | POST | 🔐 admin |
| `/api/admin/legal/retokenize` | POST | 🔐 admin |
| `/api/admin/llm-proxy/backends` | GET, POST | 🔐 admin |
| `/api/admin/llm-proxy/backends/{id}` | PUT, DELETE | 🔐 admin |
| `/api/admin/llm-proxy/reload` | POST | 🔐 admin |
| `/api/admin/llm-proxy/status` | GET | 🔐 admin |
| `/api/admin/meetings` | GET | 🔐 admin |
| `/api/admin/meetings/{id}` | GET, PATCH | 🔐 admin |
| `/api/admin/meetings/create` | POST | 🔐 admin |
| `/api/admin/members/{userId}` | GET | 🔐 admin |
| `/api/admin/members/list` | GET | 🔐 admin |
| `/api/admin/messages` | GET, POST | 🔐 admin |
| `/api/admin/messages/{threadId}` | GET, POST | 🔐 admin |
| `/api/admin/monitoring` | GET | 🔐 admin |
| `/api/admin/navigation/save` | POST | 🔐 admin |
| `/api/admin/newsletter/blocks` | GET, POST | 🔐 admin |
| `/api/admin/newsletter/blocks/{id}` | PUT, DELETE | 🔐 admin |
| `/api/admin/newsletter/campaigns` | GET, POST | 🔐 admin |
| `/api/admin/newsletter/campaigns/{id}` | PUT | 🔐 admin |
| `/api/admin/newsletter/campaigns/{id}/send` | POST | 🔐 admin |
| `/api/admin/newsletter/preview` | POST | 🔐 admin |
| `/api/admin/newsletter/subscribers` | GET, POST | 🔐 admin |
| `/api/admin/newsletter/subscribers/{id}` | DELETE | 🔐 admin |
| `/api/admin/onboarding/reset` | POST | 🔐 admin |
| `/api/admin/onboarding/update` | POST | 🔐 admin |
| `/api/admin/openspec/save-proposal` | POST | 🔐 admin |
| `/api/admin/ops/ai/reindex` | POST | 🔐 admin |
| `/api/admin/ops/audit/log` | GET | 🔐 admin |
| `/api/admin/ops/backup/list` | GET | 🔐 admin |
| `/api/admin/ops/backup/trigger` | POST | 🔐 admin |
| `/api/admin/ops/certs` | GET | 🔐 admin |
| `/api/admin/ops/deployments/{ns}/{name}/restart` | POST | 🔐 admin |
| `/api/admin/ops/deployments/{ns}/{name}/scale` | POST | 🔐 admin |
| `/api/admin/ops/deployments/list` | GET | 🔐 admin |
| `/api/admin/ops/dns/pin` | POST | 🔐 admin |
| `/api/admin/ops/error-log` | POST, GET | 🔐 admin |
| `/api/admin/ops/health` | GET | 🔐 admin |
| `/api/admin/ops/log-stream/stream` | GET | 🔐 admin |
| `/api/admin/ops/redeploy/brett` | POST | 🔐 admin |
| `/api/admin/ops/redeploy/docs` | POST | 🔐 admin |
| `/api/admin/ops/redeploy/website` | POST | 🔐 admin |
| `/api/admin/ops/restore` | POST | 🔐 admin |
| `/api/admin/ops/server-logs/stream` | GET | 🔐 admin |
| `/api/admin/ops/users/create` | POST | 🔐 admin |
| `/api/admin/ops/users/groups` | GET | 🔐 admin |
| `/api/admin/ops/users/list` | GET | 🔐 admin |
| `/api/admin/planungsbuero` | GET | 🔐 admin |
| `/api/admin/planungsbuero/{extId}` | PATCH | 🔐 admin |
| `/api/admin/platform/assets/{slug}/tickets` | GET | 🔐 admin |
| `/api/admin/platform/hardware` | GET | 🔐 admin |
| `/api/admin/platform/software` | GET, POST | 🔐 admin |
| `/api/admin/platform/software/{id}` | PUT, DELETE | 🔐 admin |
| `/api/admin/poll` | POST | 🔐 admin |
| `/api/admin/poll/{id}` | GET | 🔐 admin |
| `/api/admin/poll/{id}/share` | POST | 🔐 admin |
| `/api/admin/poll/active` | GET | 🔐 admin |
| `/api/admin/poll/templates` | GET | 🔐 admin |
| `/api/admin/projekte/attachments/delete` | POST | 🔐 admin |
| `/api/admin/projekte/attachments/download` | GET | 🔐 admin |
| `/api/admin/projekte/attachments/upload` | POST | 🔐 admin |
| `/api/admin/projekte/create` | POST | 🔐 admin |
| `/api/admin/projekte/delete` | POST | 🔐 admin |
| `/api/admin/projekte/export` | GET | 🔐 admin |
| `/api/admin/projekte/update` | POST | 🔐 admin |
| `/api/admin/projekttasks/create` | POST | 🔐 admin |
| `/api/admin/projekttasks/delete` | POST | 🔐 admin |
| `/api/admin/projekttasks/update` | POST | 🔐 admin |
| `/api/admin/prompt-library` | GET, POST | 🔐 admin |
| `/api/admin/prompt-library/{id}` | PUT, DELETE | 🔐 admin |
| `/api/admin/prompt-library/{id}/use` | POST | 🔐 admin |
| `/api/admin/qa-criteria` | GET | 🔐 admin |
| `/api/admin/qa-queue` | GET | 🔐 admin |
| `/api/admin/qa-reviews` | POST | 🔐 admin |
| `/api/admin/questionnaires/assign` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments` | GET | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}` | GET, PUT | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/archive` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/create-task` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/reassign` | POST | 🔐 admin |
| `/api/admin/questionnaires/assignments/{id}/reopen` | POST | 🔐 admin |
| `/api/admin/questionnaires/templates` | GET, POST | 🔐 admin |
| `/api/admin/questionnaires/templates/{id}` | GET, PUT, DELETE | 🔐 admin |
| `/api/admin/rechtliches/save` | POST | 🔐 admin |
| `/api/admin/referenzen/save` | POST | 🔐 admin |
| `/api/admin/seo` | GET | 🔐 admin |
| `/api/admin/seo/pages` | GET | 🔐 admin |
| `/api/admin/seo/save` | POST | 🔐 admin |
| `/api/admin/seo/upload-og-image` | POST | 🔐 admin |
| `/api/admin/service-page/save` | POST | 🔐 admin |
| `/api/admin/sessions` | GET, POST, DELETE | 🔐 admin |
| `/api/admin/sessions/history` | GET | 🔐 admin |
| `/api/admin/sessions/history/{id}` | GET | 🔐 admin |
| `/api/admin/sessions/purge` | POST | 🔐 admin |
| `/api/admin/sessions/templates` | GET, POST | 🔐 admin |
| `/api/admin/sessions/templates/{id}` | DELETE | 🔐 admin |
| `/api/admin/shortcuts/create` | POST | 🔐 admin |
| `/api/admin/shortcuts/delete` | DELETE | 🔐 admin |
| `/api/admin/shortcuts/fetch-title` | GET | 🔐 admin |
| `/api/admin/shortcuts/update` | PATCH | 🔐 admin |
| `/api/admin/slots/add` | POST | 🔐 admin |
| `/api/admin/slots/remove` | DELETE | 🔐 admin |
| `/api/admin/stammdaten/save` | POST | 🔐 admin |
| `/api/admin/startseite/save` | POST | 🔐 admin |
| `/api/admin/startseite/upload-portrait` | POST | 🔐 admin |
| `/api/admin/subprojekte/create` | POST | 🔐 admin |
| `/api/admin/subprojekte/delete` | POST | 🔐 admin |
| `/api/admin/subprojekte/update` | POST | 🔐 admin |
| `/api/admin/systemtest/board` | GET | 🔐 admin |
| `/api/admin/systemtest/cleanup-fixtures` | POST | 🔐 admin |
| `/api/admin/systemtest/drain-outbox` | POST | 🔐 admin |
| `/api/admin/systemtest/purge-all-test-data` | POST | 🔐 admin |
| `/api/admin/systemtest/seed` | POST | 🔐 admin |
| `/api/admin/tax-monitor/status` | GET | 🔐 admin |
| `/api/admin/tax-monitor/ustvaexport` | GET | 🔐 admin |
| `/api/admin/test-results` | GET | 🔐 admin |
| `/api/admin/test-runs` | GET | 🔐 admin |
| `/api/admin/testdata/purge` | DELETE | 🔐 admin |
| `/api/admin/testdata/seed` | POST | 🔐 admin |
| `/api/admin/tests/flake` | GET | 🔐 admin |
| `/api/admin/tests/ingest-e2e` | POST | 🔐 admin |
| `/api/admin/tests/playwright-report` | GET, POST | 🔐 admin |
| `/api/admin/tests/report` | POST | 🔐 admin |
| `/api/admin/tests/results/{jobId}` | GET | 🔐 admin |
| `/api/admin/tests/run` | POST | 🔐 admin |
| `/api/admin/tests/stream/{jobId}` | GET | 🔐 admin |
| `/api/admin/tests/traceability` | GET | 🔐 admin |
| `/api/admin/tests/trend` | GET | 🔐 admin |
| `/api/admin/tickets` | GET, POST | 🔐 admin |
| `/api/admin/tickets/{id}` | GET, PATCH | 🔐 admin |
| `/api/admin/tickets/{id}/attachments` | POST | 🔐 admin |
| `/api/admin/tickets/{id}/attachments/{aid}` | GET | 🔐 admin |
| `/api/admin/tickets/{id}/classify` | POST | 🔐 admin |
| `/api/admin/tickets/{id}/comments` | POST | 🔐 admin |
| `/api/admin/tickets/{id}/links` | POST, DELETE | 🔐 admin |
| `/api/admin/tickets/{id}/transition` | POST | 🔐 admin |
| `/api/admin/tickets/{id}/triage` | POST | 🔐 admin |
| `/api/admin/tickets/bulk-status` | POST | 🔐 admin |
| `/api/admin/tickets/bulk-status/undo` | POST | 🔐 admin |
| `/api/admin/time-windows/add` | POST | 🔐 admin |
| `/api/admin/time-windows/remove` | DELETE | 🔐 admin |
| `/api/admin/transcription` | GET, POST | 🔐 admin |
| `/api/admin/uebermich/save` | POST | 🔐 admin |
| `/api/admin/urlaub/save` | POST | 🔐 admin |
| `/api/admin/zeiterfassung/create` | POST | 🔐 admin |
| `/api/admin/zeiterfassung/delete` | POST | 🔐 admin |
| `/api/admin/zeiterfassung/export` | GET | 🔐 admin |
| `/api/assets/{...path}` | GET | ❓ unclassified |
| `/api/assistant/chat` | POST | 🔐 admin |
| `/api/assistant/dismiss` | POST | ❓ session |
| `/api/assistant/execute` | POST | 🔐 admin |
| `/api/assistant/nudges` | GET | 🔐 admin |
| `/api/assistant/transcribe` | POST | ❓ session |
| `/api/auth/callback` | GET | 🔐 admin |
| `/api/auth/delete-account` | POST | ❓ session |
| `/api/auth/e2e-login` | GET | 🔐 admin |
| `/api/auth/login` | GET | ❓ unclassified |
| `/api/auth/logout` | GET | ❓ unclassified |
| `/api/auth/magic` | GET | ❓ unclassified |
| `/api/auth/me` | OPTIONS, GET | 🔐 admin |
| `/api/billing/create-invoice` | POST | ❓ unclassified |
| `/api/billing/invoice/{id}/pdf` | GET | 🔐 admin |
| `/api/billing/invoice/{id}/xrechnung.xml` | GET | 🔐 admin |
| `/api/billing/invoice/{id}/zugferd` | GET | 🔐 admin |
| `/api/booking` | POST | ❓ unclassified |
| `/api/bookings/{uid}/project` | PATCH | 🔐 admin |
| `/api/brett/bot` | POST | ❓ unclassified |
| `/api/bug-report` | POST | ❓ unclassified |
| `/api/calendar/slots` | GET | ❓ unclassified |
| `/api/cluster/status` | GET | ❓ unclassified |
| `/api/codesearch` | GET | 🔐 admin |
| `/api/contact` | POST | ❓ unclassified |
| `/api/cron/error-log-retention` | POST | ❓ cron |
| `/api/cron/notify-unread` | POST | 🔐 admin |
| `/api/cron/scheduled-publish` | GET | ❓ cron |
| `/api/demo/coaching-sim` | POST | ❓ unclassified |
| `/api/dsgvo-request` | POST | ❓ unclassified |
| `/api/factory-budget` | GET, POST | 🔐 admin |
| `/api/factory-floor` | GET | 🔐 admin |
| `/api/factory-floor/{extId}` | GET | 🔐 admin |
| `/api/factory-floor/{extId}/ci` | GET | 🔐 admin |
| `/api/factory-floor/{extId}/deploy` | POST | 🔐 admin |
| `/api/factory-floor/{extId}/inject` | POST | 🔐 admin |
| `/api/factory-floor/{extId}/release` | POST | 🔐 admin |
| `/api/factory-floor/stream` | GET | 🔐 admin |
| `/api/factory-metrics` | GET | 🔐 admin |
| `/api/factory-model-slots` | GET, PUT | 🔐 admin |
| `/api/factory-observability` | GET | 🔐 admin |
| `/api/factory/force-tick` | POST | 🔐 admin |
| `/api/factory/parallel-status` | GET | 🔐 admin |
| `/api/health` | GET | ❓ unclassified |
| `/api/homepage` | OPTIONS, GET | ❓ unclassified |
| `/api/internal/tickets/notify-close` | POST | ❓ internal |
| `/api/leistungen` | GET | ❓ unclassified |
| `/api/live/state` | GET | 🔐 admin |
| `/api/meeting/finalize` | POST | ❓ unclassified |
| `/api/meeting/release` | POST | 🔐 admin |
| `/api/meeting/save-transcript` | POST | ❓ unclassified |
| `/api/meeting/transcribe` | POST | ❓ unclassified |
| `/api/meetings/{id}/project` | PATCH | 🔐 admin |
| `/api/newsletter/confirm` | GET | ❓ unclassified |
| `/api/newsletter/subscribe` | POST | ❓ unclassified |
| `/api/newsletter/unsubscribe` | GET | ❓ unclassified |
| `/api/openspec/search` | GET | ❓ unclassified |
| `/api/planning-office` | GET, POST, DELETE | 🔐 admin |
| `/api/planning-office/{extId}` | PATCH | 🔐 admin |
| `/api/planning-office/{extId}/clarify` | POST | 🔐 admin |
| `/api/planning-office/{extId}/promote` | POST | 🔐 admin |
| `/api/poll/{id}` | GET | ❓ unclassified |
| `/api/poll/{id}/answer` | POST | ❓ unclassified |
| `/api/poll/{id}/results` | GET | ❓ unclassified |
| `/api/portal/documents/{assignmentId}/pdf` | GET | ❓ session |
| `/api/portal/learning/summary` | GET | ❓ session |
| `/api/portal/learning/track` | POST | ❓ session |
| `/api/portal/messages` | GET, POST | ❓ session |
| `/api/portal/messages/{threadId}` | GET, POST | ❓ session |
| `/api/portal/nachrichten` | GET | ❓ session |
| `/api/portal/onboarding/mark-step` | POST | ❓ session |
| `/api/portal/onboarding/reset` | POST | ❓ session |
| `/api/portal/onboarding/update` | POST | ❓ session |
| `/api/portal/profile/export` | GET | ❓ session |
| `/api/portal/profile/update` | POST | ❓ session |
| `/api/portal/projekte` | GET | ❓ session |
| `/api/portal/projekttasks/{id}/done` | POST | ❓ session |
| `/api/portal/questionnaires` | GET | ❓ session |
| `/api/portal/questionnaires/{id}` | GET | ❓ session |
| `/api/portal/questionnaires/{id}/answer` | PUT | ❓ session |
| `/api/portal/questionnaires/{id}/dismiss` | POST | ❓ session |
| `/api/portal/questionnaires/{id}/submit` | POST | ❓ session |
| `/api/portal/rooms` | GET | ❓ session |
| `/api/portal/rooms/{id}/messages` | GET, POST | ❓ session |
| `/api/portal/rooms/{id}/share` | POST | ❓ session |
| `/api/portal/rooms/ensure-direct` | POST | ❓ session |
| `/api/portal/sign/{assignmentId}` | POST | ❓ session |
| `/api/register` | POST | ❓ unclassified |
| `/api/signing/confirm` | POST | ❓ session |
| `/api/status` | GET | ❓ unclassified |
| `/api/stream/end` | POST | 🔐 admin |
| `/api/stream/recording` | POST | 🔐 admin |
| `/api/stream/status` | GET | ❓ unclassified |
| `/api/stripe/checkout` | POST | ❓ unclassified |
| `/api/stripe/invoice-payment-intent` | POST | ❓ unclassified |
| `/api/stripe/webhook` | POST | ❓ unclassified |
| `/api/tickets/{id}/readiness` | POST | 🔐 admin |
| `/api/tickets/comment` | OPTIONS, POST | ❓ unclassified |
| `/api/tickets/graph` | GET | 🔐 admin |
| `/api/timeline` | GET | ❓ unclassified |
