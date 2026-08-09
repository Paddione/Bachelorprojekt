## ADDED Requirements

### Requirement: Planning Office Covers Epics

The planning office SHALL list and patch tickets of type `project` alongside `feat` and `feature`,
so that an epic can carry a requirements list (Lastenheft) like any other planning item.

#### Scenario: An epic appears in the planning list

- **GIVEN** a ticket of type `project` in status `planning`
- **WHEN** the planning list is requested
- **THEN** the epic is included in the result

#### Scenario: An epic's requirements can be recorded

- **GIVEN** an epic in status `planning`
- **WHEN** a requirements list is patched onto it
- **THEN** the stored requirements list matches what was submitted

#### Scenario: Feature items remain listed

- **GIVEN** a ticket of type `feat` in status `planning`
- **WHEN** the planning list is requested
- **THEN** the feature is still included, unchanged from before this capability

### Requirement: Epics Start In The Editable State

An epic created through the planning office SHALL be created in status `planning`, so that its
Lastenheft is editable from the moment the epic exists.

#### Scenario: A newly created epic is editable

- **GIVEN** a request to create an epic
- **WHEN** the epic is created
- **THEN** its type is `project` and its status is `planning`
- **AND** a requirements list can be patched onto it without any further status change

### Requirement: Locking An Epic Freezes Its Lastenheft

Locking an epic's Lastenheft SHALL follow the same contract as for features: it requires at least
one requirement, sets the lock flag, and forwards the status out of the editable state. A locked
epic SHALL NOT accept further requirements edits.

#### Scenario: Locking with at least one requirement succeeds

- **GIVEN** an epic in status `planning` with at least one requirement
- **WHEN** its Lastenheft is locked
- **THEN** the lock flag is set
- **AND** the status is no longer the editable planning state

#### Scenario: Locking an empty Lastenheft is refused

- **GIVEN** an epic in status `planning` with no requirements
- **WHEN** its Lastenheft is locked
- **THEN** the operation fails with an error naming the empty Lastenheft
- **AND** the lock flag remains unset

#### Scenario: A locked epic rejects requirements edits

- **GIVEN** an epic whose Lastenheft is locked
- **WHEN** a requirements patch is attempted
- **THEN** the stored requirements list is unchanged

### Requirement: Epics Are Distinguishable From Features In The Planning List

The planning list SHALL expose the item type, so that the interface can present epics differently
from features.

#### Scenario: The listed item carries its type

- **GIVEN** a planning list containing both an epic and a feature
- **WHEN** the list is rendered
- **THEN** each item exposes which of the two it is
