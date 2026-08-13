# Proposal: portal-profile-bats

## Why

`tests/unit/portal-profile-update.bats` (T000614 — Validierung der Self-Service-Profil-API) ist
offline 4/4 rot. Die Tests laden `website/src/lib/customer-crm-db.ts` per `npx tsx -e`; diese
Datei importiert auf Top-Level `./website-db`, das transitiv `content-bundle.ts` zieht
(`website/src/lib/content-bundle.ts:52` nutzt `import.meta.glob`, eine Vite/Astro-only API) →
`TypeError: define_import_meta_default.glob is not a function` unter plain tsx/node — der Import
bricht ab, bevor irgendeine Assertion läuft.

Die Allowlist-Begründung „Requires a live DB (tests portal profile update API against real
postgres)" ist falsch: Der Test braucht keine DB, er scheitert an der Vite-API. Er wurde per
T002707-Prozedur (3) als roter Guard diagnostiziert und in ein eigenes Bug-Ticket (T003144)
überführt.

## What

- Die Validierungslogik (`ProfileInput`, `MAXLEN`, `validateProfileInput`, `CONTACT_CHANNELS`,
  `COMM_FREQUENCIES`, `CUSTOMER_STATUSES`, `CONTACT_TYPES` + Typen) in ein import-freies Modul
  `website/src/lib/profile-validation.ts` isolieren — kein DB-, kein Vite-Kontakt.
- `customer-crm-db.ts` importiert die Symbole aus dem neuen Modul und re-exportiert sie →
  öffentliche API identisch, alle bestehenden Importe (Portal-API-Routen, Astro-Komponenten,
  Vitest-Tests) bleiben unverändert.
- Der BATS-Test importiert künftig aus `./src/lib/profile-validation.ts`; der Negativtest
  „CONTACT_TYPES excludes profile_update" erhält einen Positiv-Anker (T002356-M1).
- Der Allowlist-Eintrag `portal-profile-update` wird aus `tests/unit/.coverage-allowlist`
  entfernt → der Test läuft wieder im Offline-Gate (`task test:unit`).

_Ticket: T003144_
