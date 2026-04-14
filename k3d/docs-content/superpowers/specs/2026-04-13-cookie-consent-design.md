# Cookie Consent Banner — Design Spec

**Date:** 2026-04-13  
**Sites:** web.mentolder.de, web.korczewski.de  
**Status:** Approved

---

## Summary

Add a DSGVO-compliant cookie consent banner to both brand sites. The sites use only technically necessary cookies (session/auth). There are no analytics or tracking cookies. Self-host Google Fonts to eliminate external font requests (which require consent under German DSGVO rulings).

---

## Architecture

A single `CookieConsent.svelte` component is added to `website/src/layouts/Layout.astro` so it renders on every page across both brands. The component manages its own visibility state — no shared store needed.

Consent is persisted to `localStorage`:
- Key: `cookie_consent_v1`
- Value: `"accepted"` on any button click
- Reset: footer "Cookie-Einstellungen" link removes the key and re-shows the banner

The version suffix `_v1` allows forcing re-consent in future by bumping the key.

**Google Fonts self-hosting:**
- Font files (Inter, Merriweather — woff2 format) downloaded to `website/public/fonts/`
- `@font-face` declarations written to `website/public/fonts.css`
- `Layout.astro` Google Fonts `<link>` tags replaced with `<link rel="stylesheet" href="/fonts.css">`

---

## UI/UX

Fixed bottom panel, full width, `z-50`, above page content.

**Main row:**
- Text: "Diese Website verwendet Cookies. Technisch notwendige Cookies sind für den Betrieb der Website erforderlich."
- Button: **"Alle akzeptieren"** — gold, filled
- Button: **"Nur notwendige"** — outlined
- Toggle: **"Details anzeigen / ausblenden"** — expands detail panel below

Both buttons store `"accepted"` and hide the banner. The distinction satisfies user expectation for the familiar two-button pattern without implying meaningful opt-out choice.

**Detail panel (expandable):**
Table listing the one cookie category — *Notwendige Cookies*:

| Name | Zweck | Dauer |
|------|-------|-------|
| `session` | Authentifizierung / Login-Sitzung | Sitzung |
| Keycloak-Token | SSO-Session (Keycloak OIDC) | Sitzung |

**Styling:** dark navy background (`bg-dark-light`), top border (`border-dark-lighter`), gold heading, consistent with existing palette.

**Footer:** "Cookie-Einstellungen" link added to the "Rechtliches" column alongside Impressum and Datenschutz. Clicking it removes `cookie_consent_v1` from localStorage and re-shows the banner.

---

## Files Changed

| File | Change |
|------|--------|
| `website/src/components/CookieConsent.svelte` | New component |
| `website/src/layouts/Layout.astro` | Mount component; replace Google Fonts link with `/fonts.css` |
| `website/public/fonts/` | Downloaded Inter + Merriweather woff2 files |
| `website/public/fonts.css` | `@font-face` declarations |
| `website/src/pages/datenschutz.astro` | Add cookie table section |

---

## Legal Notes

- Technically necessary cookies do not require opt-in consent under DSGVO Art. 6(1)(f) / ePrivacy Directive
- Self-hosting fonts eliminates the IP transmission to Google that German courts have ruled requires consent (BGH, 2022)
- The banner satisfies the transparency requirement by informing users and documenting cookies
- The `datenschutz.astro` page will document cookies in the privacy policy
