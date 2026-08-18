# repo-structure — Delta-Spec

## Purpose

Der Spec sichert die Reorg-Struktur des Repos (T006999): Build-Komponenten leben unter
`components/`, das Repo-Root trägt nur Harness-/GitHub-Konventionen und die deklarierten
Top-Level-Verzeichnisse. Ergänzt mit diesem Delta die Absicherung gegen Laufzeit-Leaks
der eigenen Test-Suite: ein von der Spec-Suite transient erzeugtes leeres
Top-Level-Verzeichnis `website/` darf den Drift-Guard nicht ordnungsabhängig rot färben —
der Guard toleriert und entfernt leere Streuner, echte (nicht-leere) Regressionen bleiben rot.

## ADDED Requirements

### Requirement: The drift guard is order-independent against stray empty directories

The spec suite can leave a stray EMPTY top-level `website/` directory behind depending on
test execution order (T011792; the leak origin is not a shell `mkdir` and is out of scope
here). The drift guard `tests/spec/repo-structure/website-moved.bats` SHALL tolerate and
remove a stray EMPTY `website/` directory in its setup (`rmdir` — empty directories only),
so the guard's result is independent of test execution order. A NON-EMPTY `website/`
directory (a real reorg regression) SHALL still fail the guard and MUST NOT be removed.

#### Scenario: Empty stray website/ directory is cleaned up before the guard asserts

- **GIVEN** a stray empty `website/` directory exists at the repository root, e.g.
  created by a preceding spec-suite test
- **WHEN** `tests/spec/repo-structure/website-moved.bats` runs
- **THEN** the guard removes the empty directory and passes

#### Scenario: Non-empty website/ directory still fails the guard

- **GIVEN** a non-empty `website/` directory exists at the repository root
- **WHEN** `tests/spec/repo-structure/website-moved.bats` runs
- **THEN** the guard fails with the assertion „kein Top-Level-Verzeichnis website/ mehr"
- **AND** the directory is left in place

#### Scenario: Guard leaves the repository root clean after a failed run

- **GIVEN** the guard failed because a stray empty `website/` directory appeared
  between setup and assertion
- **WHEN** the guard's teardown runs
- **THEN** the stray directory is removed so subsequent runs start from a clean root
