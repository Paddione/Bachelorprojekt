# Manual Production Test — wbhprojekt.ipv64.de

**Cluster:** k3s-production  
**Domains:** `*.wbhprojekt.ipv64.de` → `217.195.149.75`  
**Date created:** 2026-04-01

---

## Prerequisites

- Browser (Chrome/Firefox recommended)
- Accept the self-signed TLS warning on first visit (until Let's Encrypt certs propagate)

---

## 1. Keycloak (SSO)

| # | Step | Expected |
|---|------|----------|
| 1.1 | Open https://auth-wbhprojekt.ipv64.de | Keycloak welcome/login page loads |
| 1.2 | Click **Administration Console** | Login form appears |
| 1.3 | Log in with admin credentials | Admin dashboard loads |
| 1.4 | Navigate to **Realm: homeoffice** → **Clients** | `mattermost` and `nextcloud` clients visible |
| 1.5 | Click **mattermost** client → **Settings** | Redirect URIs contain `chat-wbhprojekt.ipv64.de` |
| 1.6 | Click **nextcloud** client → **Settings** | Redirect URIs contain `files-wbhprojekt.ipv64.de` and `meet-wbhprojekt.ipv64.de` |
| 1.7 | Navigate to **Users** → create a test user | User `testuser` with password and email created |

---

## 2. Mattermost (Chat)

| # | Step | Expected |
|---|------|----------|
| 2.1 | Open https://chat-wbhprojekt.ipv64.de | Mattermost login page loads |
| 2.2 | Click **Mit Keycloak anmelden** (GitLab SSO button) | Redirects to `auth-wbhprojekt.ipv64.de` Keycloak login |
| 2.3 | Log in with the test user from step 1.7 | Redirects back to Mattermost, logged in |
| 2.4 | Check the URL bar | Shows `https://chat-wbhprojekt.ipv64.de` |
| 2.5 | Create a new channel, post a message | Message appears, channel is created |
| 2.6 | Upload a file in chat | File uploads and preview works |
| 2.7 | Log out | Returns to login page |

---

## 3. Nextcloud (Files)

| # | Step | Expected |
|---|------|----------|
| 3.1 | Open https://files-wbhprojekt.ipv64.de | Nextcloud login page loads |
| 3.2 | Click **Log in with Keycloak** (OIDC button) | Redirects to `auth-wbhprojekt.ipv64.de` |
| 3.3 | Log in with the same test user | Redirects back to Nextcloud, logged in |
| 3.4 | Check the URL bar | Shows `https://files-wbhprojekt.ipv64.de` |
| 3.5 | Upload a file via the **+** button | File appears in file list |
| 3.6 | Create a new folder | Folder is created |
| 3.7 | Share a file (click share icon) | Share dialog opens, link can be copied |

---

## 4. Collabora (Document Editing)

| # | Step | Expected |
|---|------|----------|
| 4.1 | In Nextcloud, click **+** → **New document** (.odt) | Collabora editor opens inline |
| 4.2 | Type some text in the document | Text appears in real-time |
| 4.3 | Check the browser console (F12) for errors | No WOPI or CORS errors |
| 4.4 | Open https://office-wbhprojekt.ipv64.de | Collabora "OK" page or blank page (this is normal — Collabora has no UI of its own) |
| 4.5 | Open a `.xlsx` or `.docx` file in Nextcloud | Collabora spreadsheet/document editor opens |

---

## 5. Nextcloud Talk (Video Calls)

| # | Step | Expected |
|---|------|----------|
| 5.1 | In Nextcloud, click the **Talk** icon (speech bubble, top bar) | Talk interface loads |
| 5.2 | Create a new conversation | Conversation is created |
| 5.3 | Open https://meet-wbhprojekt.ipv64.de | Nextcloud loads (Talk accessible after login) |
| 5.4 | Start a call in the conversation (camera icon) | Camera/microphone permission prompt appears |
| 5.5 | Allow camera/mic, verify video preview | Your video feed appears |
| 5.6 | **Two-user test:** Open a second browser/incognito with a different user, join the same conversation | Both users see each other's video |
| 5.7 | In a call, click the **screen share** button | Screen share works |
| 5.8 | Check browser console for WebRTC/ICE errors | No ICE failures (coturn/TURN is working) |

> **Tip:** If video doesn't connect, check the browser console for `ICE failed` errors.
> This usually means the coturn TURN server isn't reachable on UDP/TCP 3478 from the internet.

---

## 6. SSO Session Consistency

| # | Step | Expected |
|---|------|----------|
| 6.1 | Log in to Mattermost via Keycloak (step 2.2–2.3) | Logged in to Mattermost |
| 6.2 | In a new tab, open https://files-wbhprojekt.ipv64.de | Nextcloud loads **without** asking for password again (SSO session) |
| 6.3 | In another tab, open https://meet-wbhprojekt.ipv64.de | Talk loads without login prompt |
| 6.4 | Log out of Keycloak: https://auth-wbhprojekt.ipv64.de/realms/homeoffice/protocol/openid-connect/logout | Keycloak confirms logout |
| 6.5 | Refresh Mattermost and Nextcloud tabs | Both should require re-authentication |

---

## 7. Security Checks

| # | Step | Expected |
|---|------|----------|
| 7.1 | Open http://chat-wbhprojekt.ipv64.de (HTTP, not HTTPS) | Redirects to HTTPS automatically (301/308) |
| 7.2 | Click the lock icon in the browser address bar | Shows TLS certificate info (Let's Encrypt or self-signed) |
| 7.3 | Try logging in with a wrong password 5+ times | Keycloak shows brute-force protection / temporary lockout |
| 7.4 | Try accessing https://files-wbhprojekt.ipv64.de/remote.php/dav without auth | Returns 401 Unauthorized (not 200) |

---

## 8. Cross-Service Integration Checks

| # | Step | Expected |
|---|------|----------|
| 8.1 | In Mattermost, paste a link to a Nextcloud file | Link preview renders (if link previews enabled) |
| 8.2 | In Nextcloud Talk, share a file in a conversation | File appears as attachment in chat |
| 8.3 | In Nextcloud, open a document → invite another user to edit | Both users can see each other's cursors (Collabora collab) |

---

## Result Summary

| Area | Tests | Pass/Fail |
|------|-------|-----------|
| 1. Keycloak | 1.1–1.7 | __ / 7 |
| 2. Mattermost | 2.1–2.7 | __ / 7 |
| 3. Nextcloud | 3.1–3.7 | __ / 7 |
| 4. Collabora | 4.1–4.5 | __ / 5 |
| 5. Talk | 5.1–5.8 | __ / 8 |
| 6. SSO Session | 6.1–6.5 | __ / 5 |
| 7. Security | 7.1–7.4 | __ / 4 |
| 8. Integration | 8.1–8.3 | __ / 3 |
| **Total** | | **__ / 46** |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| TLS certificate warning | Let's Encrypt hasn't issued certs yet | Wait for DNS propagation + ACME challenge, or accept the warning |
| "Invalid redirect_uri" on SSO login | Keycloak client redirect URIs don't match | Check client settings in Keycloak admin console |
| Collabora editor won't load | WOPI URL mismatch or `aliasgroup1` wrong | Verify `office-wbhprojekt.ipv64.de` in Nextcloud admin → Collabora settings |
| Video call won't connect | coturn not reachable from internet | Ensure UDP/TCP 3478 is open on the firewall for `217.195.149.75` |
| "Access through untrusted domain" in Nextcloud | Domain not in `trusted_domains` | Run: `kubectl exec -n homeoffice deploy/nextcloud -- gosu 999 php occ config:system:set trusted_domains N --value="DOMAIN"` |
