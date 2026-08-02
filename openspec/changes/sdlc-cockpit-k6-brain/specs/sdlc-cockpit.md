# Delta Spec: Brain-Anbindung des Cockpits (K6)

> Parent SSOT: `sdlc-cockpit`
> Änderungstyp: ADDED (Umsetzung der Brain-Zusagen aus `cockpit-auth-schnitt`)

Die beiden Zusagen „Brain is read through the cluster-internal service" und
„The website reaches Brain through an explicit ingress policy" sind bereits im
offenen Change `cockpit-auth-schnitt` als ADDED formuliert und werden hier
**nicht wiederholt** — ein zweites ADDED mit demselben Requirement-Namen ließe
das spätere `openspec archive` beider Changes kollidieren. Dieser Delta ergänzt
nur, was K6 zusätzlich zusagt: wie ein Wiki-Verweis zustande kommt und wie er
im Panel erscheint.

## ADDED Requirements

### Requirement: Brain references are derived deterministically from source paths

The system SHALL derive the Brain wiki page for a given repository source path
by the same rule the ingest pipeline uses to write that page, and by no other
means. The rule is textual and reproducible: strip the file extension, strip a
leading dot, replace `/`, `_` and space with `-`, lowercase the result — the
slug produced by `scripts/brain-ingest-worklist.sh`, under which
`scripts/brain-ingest.sh` stores the page.

The system SHALL NOT use full-text search or semantic retrieval for this
mapping. A derived reference SHALL be emitted only for source paths that the
ingest manifest (`scripts/brain/ingest-sources.yaml`) actually accepts as a
source; for every other path the system SHALL emit no reference rather than a
guessed one.

#### Scenario: A manifest-covered source path yields its wiki page

- **GIVEN** a source path that the ingest manifest assigns to a group
- **WHEN** the Brain reference for it is requested
- **THEN** the returned link points at the page slug the ingest pipeline writes
  for that same path

#### Scenario: A path outside the manifest yields no reference

- **GIVEN** a source path the ingest manifest does not cover, such as a file
  under `website/` or `k3d/`
- **WHEN** the Brain reference for it is requested
- **THEN** no link is returned for that path
- **AND** the response states that the path has no wiki page, so the gap is
  visible rather than silent

#### Scenario: A derived page that does not exist is not offered as a link

- **GIVEN** a derived slug for which the Brain site serves no page
- **WHEN** the references are assembled
- **THEN** the link is omitted from the result
- **AND** the omission is reported alongside the successful links

### Requirement: Panels present their Brain references in the context slot

The system SHALL fill the panel context slot with the derived Brain references,
using the existing `setContext` contract of `{href, label}` entries. Panels
SHALL NOT fetch Brain content themselves; the access SHALL go through the
adapter, so that no panel carries its own `fetch()` (E1).

The adapter SHALL retrieve Brain references as a one-shot request, not as a
poll: the references change only when an ingest run publishes new pages, never
between two seconds of panel life.

#### Scenario: A panel with a known source shows its references

- **GIVEN** a panel whose subject maps to at least one covered source path
- **WHEN** the panel renders
- **THEN** the context slot holds a link per existing wiki page

#### Scenario: An unreachable Brain service leaves the panel honest

- **GIVEN** the Brain service does not answer
- **WHEN** a panel requests its references
- **THEN** the context slot does not silently stay empty
- **AND** the error is carried through to the panel, keeping an empty result
  distinguishable from a failure (D13)
