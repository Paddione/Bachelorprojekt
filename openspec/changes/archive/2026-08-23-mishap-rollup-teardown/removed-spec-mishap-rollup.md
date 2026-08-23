<!-- Kein Delta mehr, sondern Beleg [T014104].

Diese Datei lag als `specs/mishap-rollup.md` im Change und listete die 18
Requirements, die mit dem Abbau entfallen. Der Abbau hat `openspec/specs/mishap-rollup.md`
im selben PR geloescht — damit ist das REMOVED bereits vollzogen und der
Archiv-Merger kann es nicht mehr anwenden (`Target … does not exist`). Die Liste
bleibt hier als Nachweis, welche Requirements weggefallen sind. -->

## REMOVED Requirements

### Requirement: Mishap rollup generates compliant change per run

**Reason:** Der Rollup-Automat wird abgebaut (T014104). Er hat über vier Zyklen keinen einzigen
Eintrag disponiert und erzeugte seinen eigenen Container bei jedem Tick neu.

### Requirement: rollup-container self-heals on an empty search result

**Reason:** Genau dieses "Self-Healing" ist der Defekt — ein entfernter Container ist die
Auslösebedingung für den nächsten.

### Requirement: Rollup container SHALL be ephemeral

**Reason:** Kein Container mehr.

### Requirement: Rollup change SHALL merge to main per cycle

**Reason:** Kein Zyklus mehr. Sechs unvollständige Zyklen hinterliessen verwaiste
Change-Verzeichnisse auf `main`.

### Requirement: Container description SHALL not claim permanence

**Reason:** Kein Container mehr.

### Requirement: Container resolution SHALL be verifiable against the live database

**Reason:** Keine Container-Auflösung mehr.

### Requirement: Rollup plan SHALL carry one checkable task per mishap entry

**Reason:** Kein Rollup-Plan mehr. Der Eintrags-Parser leitete Plan-Checkboxen als Befunde aus.

### Requirement: Rollup plan SHALL state how the container is worked off

**Reason:** Kein Rollup-Plan mehr.

### Requirement: Only real mishap batches SHALL count as container batches

**Reason:** Kein Container mehr.

### Requirement: Unresolved entries SHALL carry over into the next container

**Reason:** Der Carry-over ist der Mechanismus, über den derselbe Eintrag vier Zyklen überlebte,
ohne bearbeitet zu werden.

### Requirement: Rollup container resolution is brand-agnostic

**Reason:** Keine Container-Auflösung mehr.

### Requirement: Mishap-rollup generator runs once per tick

**Reason:** Der Generator läuft gar nicht mehr; der Aufruf in `wakeup.sh` entfällt.

### Requirement: Rollup tickets carry consistent brand across read paths

**Reason:** Keine Rollup-Tickets mehr.

### Requirement: Generator tags recurring entries across cycles

**Reason:** Keine Zyklen mehr.

### Requirement: Watchlist disposition keeps entries alive until expiry

**Reason:** Keine Watchlist mehr.

### Requirement: Stalled entries escalate out of the rollup loop

**Reason:** Es gibt keine Rollup-Loop mehr, aus der eskaliert werden müsste.

### Requirement: Completed rollup cycles are archived by the machine

**Reason:** Keine Zyklen mehr. Die sechs bereits verwaisten Verzeichnisse werden in diesem Change
regulär archiviert.

### Requirement: Rollup generator SHALL coalesce batches before staging

**Reason:** Kein Generator mehr.
