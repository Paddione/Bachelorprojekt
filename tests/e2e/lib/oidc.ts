// OIDC / Pocket ID login via one-time access code (T003163).
//
// Pocket ID v2.11 has no password form and no admin-API endpoint for access
// codes. The supported path for E2E is the `one-time-access-token` CLI:
//
//   kubectl exec -n workspace deploy/pocket-id -- \
//     /app/pocket-id one-time-access-token <user>
//
// which prints `https://<auth>/lc/<token>` — a 1-hour login URL. The browser
// visits `/lc/<token>`, Pocket ID exchanges it for a session cookie and
// redirects to `/settings`. That session cookie then unlocks every
// oauth2-proxy-guarded service (brett, nextcloud, ...) via the normal OIDC
// authorization-code flow.
//
// Env overrides:
//   POCKET_ID_OTAC_URL  — pre-created login URL (CI without kubectl access)
//   OIDC_USER           — Pocket ID user (default: E2E_ADMIN_USER ?? paddione)
//   POCKET_ID_NAMESPACE — cluster namespace (default: workspace)
//   TEST_KC_URL         — Pocket ID frontend (default: https://auth.mentolder.de)
//
// The kubectl call is deliberately NOT required: when it is unavailable
// (e.g. GitHub Actions runners without cluster access) callers should treat
// the login as unsupported and fail closed (fixme), matching the T002199
// convention — never run a dependent project without a session.

import { execFileSync } from 'child_process';
import type { Page } from '@playwright/test';

const KC_URL = (process.env.TEST_KC_URL
  || (process.env.PROD_DOMAIN ? `https://auth.${process.env.PROD_DOMAIN}` : 'https://auth.mentolder.de'))
  .replace(/\/$/, '');
const OIDC_USER = process.env.OIDC_USER ?? process.env.E2E_ADMIN_USER ?? 'paddione';
const NS = process.env.POCKET_ID_NAMESPACE ?? 'workspace';

/** True when an OTAC login URL can be produced (env override or kubectl). */
export function oidcLoginAvailable(): boolean {
  if (process.env.POCKET_ID_OTAC_URL) return true;
  try {
    execFileSync('kubectl', ['config', 'current-context'], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function createOtacUrl(): string {
  if (process.env.POCKET_ID_OTAC_URL) return process.env.POCKET_ID_OTAC_URL;
  const pod = execFileSync(
    'kubectl',
    ['get', 'pod', '-n', NS, '-l', 'app=pocket-id', '-o', 'jsonpath={.items[0].metadata.name}'],
    { encoding: 'utf8', timeout: 30_000 },
  ).trim();
  if (!pod) throw new Error(`[oidc] no pocket-id pod found in namespace ${NS}`);
  const out = execFileSync(
    'kubectl',
    ['exec', '-n', NS, pod, '--', '/app/pocket-id', 'one-time-access-token', OIDC_USER],
    { encoding: 'utf8', timeout: 60_000 },
  );
  const m = out.match(/https:\/\/\S+\/lc\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`[oidc] no /lc/ token in CLI output: ${out}`);
  return `${KC_URL}/lc/${m[1]}`;
}

/**
 * Logs the browser into Pocket ID as OIDC_USER via a fresh one-time access
 * code. On success the page context holds a session cookie for KC_URL.
 */
export async function loginViaOIDC(page: Page, opts: { redirect?: string } = {}): Promise<void> {
  const base = createOtacUrl();
  const url = opts.redirect ? `${base}?redirect=${encodeURIComponent(opts.redirect)}` : base;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // Pocket ID lands on /settings (or /settings/account) once the code is
  // exchanged; a second nav if the SPA race dropped us on the login page.
  await page.waitForURL(/\/settings/, { timeout: 30_000 });
}
