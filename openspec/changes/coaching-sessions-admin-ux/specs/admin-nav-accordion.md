## ADDED Requirements

### Requirement: Sessions-Eintrag in Sidebar-Sektion Geschäft

The admin sidebar SHALL expose a dedicated "Sessions" nav item in the
"Geschäft" section that links to `/admin/coaching/sessions` and is highlighted
active on that path. The existing "Studio" nav item MUST NOT claim
`/admin/coaching/sessions` in its `matches` array, so only one item is marked
active on the session list path.

#### Scenario: Sessions item highlights on the session list

- **GIVEN** an admin viewing `/admin/coaching/sessions`
- **WHEN** the sidebar renders
- **THEN** the "Sessions" item in the "Geschäft" section is marked active
- **AND** the "Studio" item is not marked active

#### Scenario: Studio item highlights on its own paths

- **GIVEN** an admin viewing `/admin/coaching/studio`
- **WHEN** the sidebar renders
- **THEN** the "Studio" item is marked active
- **AND** the "Sessions" item is not marked active
