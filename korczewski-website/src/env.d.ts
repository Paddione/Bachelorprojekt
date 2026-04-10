/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly BRAND_NAME: string;
  readonly CONTACT_NAME: string;
  readonly CONTACT_EMAIL: string;
  readonly CONTACT_PHONE: string;
  readonly CONTACT_CITY: string;
  readonly PROD_DOMAIN: string;
  readonly LEGAL_STREET: string;
  readonly LEGAL_ZIP: string;
  readonly LEGAL_JOBTITLE: string;
  readonly LEGAL_CHAMBER: string;
  readonly LEGAL_UST_ID: string;
  readonly LEGAL_WEBSITE: string;
  readonly SITE_URL: string;
  readonly MATTERMOST_WEBHOOK_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
