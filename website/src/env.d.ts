/// <reference types="astro/client" />

interface ImportMetaEnv {
  // Mattermost
  readonly MATTERMOST_WEBHOOK_URL: string;
  readonly MATTERMOST_CHANNEL: string;
  readonly MATTERMOST_URL: string;
  readonly MATTERMOST_BOT_TOKEN: string;
  // Keycloak
  readonly KEYCLOAK_URL: string;
  readonly KEYCLOAK_REALM: string;
  readonly KEYCLOAK_ADMIN_USER: string;
  readonly PORTAL_ADMIN_USERNAME: string;
  readonly KEYCLOAK_ADMIN_PASSWORD: string;
  // OIDC client
  readonly WEBSITE_OIDC_SECRET: string;
  // SMTP
  readonly SMTP_HOST: string;
  readonly SMTP_PORT: string;
  readonly SMTP_SECURE: string;
  readonly SMTP_USER: string;
  readonly SMTP_PASS: string;
  readonly FROM_EMAIL: string;
  readonly FROM_NAME: string;
  // Nextcloud
  readonly NEXTCLOUD_ADMIN_USER?: string;
  readonly NEXTCLOUD_ADMIN_PASS?: string;
  readonly NEXTCLOUD_EXTERNAL_URL?: string;
  // Mattermost signing
  readonly MATTERMOST_SIGNING_CHANNEL?: string;
  // Nextcloud CalDAV
  readonly NEXTCLOUD_URL: string;
  readonly NEXTCLOUD_CALDAV_USER: string;
  readonly NEXTCLOUD_CALDAV_PASSWORD: string;
  readonly CALENDAR_NAME: string;
  readonly WORK_START_HOUR: string;
  readonly WORK_END_HOUR: string;
  readonly SLOT_DURATION_MIN: string;
  readonly WORK_DAYS: string;
  readonly BOOKING_HORIZON_DAYS: string;
  readonly MIN_ADVANCE_HOURS: string;
  // Site
  readonly SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
