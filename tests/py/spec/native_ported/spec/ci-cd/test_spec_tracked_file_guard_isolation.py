"""Native migration of tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats."""

import pytest


def test_t003001_guard_t002779_assertion_stays_green_under_concurrent_real_file_touches():
    # Der Test startet bats gegen spec-tracked-file-guard.bats (--filter) und
    # beruehrt dabei eine getrackte Datei. Der bats-Aufruf ist im Python-Port nicht
    # zulaessig (Regel 5), das Beruehren einer getrackten Datei verboten (Regel 7).
    pytest.skip("nicht portierbar: erfordert den bats-Runner und Mutation einer getrackten Datei (Regeln 5, 7)")
