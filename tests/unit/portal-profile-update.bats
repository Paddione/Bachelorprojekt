#!/usr/bin/env bats
# T000614 — Validierung der Self-Service-Profil-API (Feldlängen + Enums).

setup() {
  cd "${BATS_TEST_DIRNAME}/../../website" || exit 1
}

@test "validateProfileInput rejects an over-long phone" {
  run npx tsx -e "import {validateProfileInput} from './src/lib/customer-crm-db.ts'; const r=validateProfileInput({phone:'x'.repeat(31)}); process.exit(r.ok?1:0)"
  [ "$status" -eq 0 ]
}

@test "validateProfileInput rejects an invalid contact channel" {
  run npx tsx -e "import {validateProfileInput} from './src/lib/customer-crm-db.ts'; const r=validateProfileInput({preferred_contact_channel:'fax'}); process.exit(r.ok?1:0)"
  [ "$status" -eq 0 ]
}

@test "validateProfileInput accepts a valid payload" {
  run npx tsx -e "import {validateProfileInput} from './src/lib/customer-crm-db.ts'; const r=validateProfileInput({phone:'+49 30 1',communication_frequency:'monatlich'}); process.exit(r.ok?0:1)"
  [ "$status" -eq 0 ]
}

@test "CONTACT_TYPES enum excludes profile_update" {
  run npx tsx -e "import {CONTACT_TYPES} from './src/lib/customer-crm-db.ts'; process.exit(CONTACT_TYPES.includes('profile_update')?1:0)"
  [ "$status" -eq 0 ]
}
