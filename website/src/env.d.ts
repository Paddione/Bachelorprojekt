/// <reference types="astro/client" />
/// <reference types="node" />

interface ImportMetaEnv {
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
  readonly DOCS_URL?: string;
  readonly BRAND_NAME?: string;
  readonly CONTACT_NAME?: string;
  readonly CONTACT_EMAIL?: string;
  readonly CONTACT_PHONE?: string;
  readonly CONTACT_CITY?: string;
  readonly LEGAL_STREET?: string;
  readonly LEGAL_ZIP?: string;
  readonly LEGAL_JOBTITLE?: string;
  readonly LEGAL_UST_ID?: string;
  readonly LEGAL_WEBSITE?: string;
  readonly AUTH_EXTERNAL_URL?: string;
  readonly VAULT_EXTERNAL_URL?: string;
  readonly WHITEBOARD_EXTERNAL_URL?: string;
  readonly TRACKING_EXTERNAL_URL?: string;
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
  // Stripe
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_PUBLISHABLE_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// pdf-parse ships no types; we only use the inner module (its index.js triggers a
// debug-mode fixture read under ESM where module.parent is undefined).
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
