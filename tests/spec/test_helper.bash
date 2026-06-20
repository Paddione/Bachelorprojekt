#!/usr/bin/env bash
# tests/spec/test_helper.bash — Weiterleitung auf tests/local/test_helper.bash
# Notwendig weil BATS `load` relativ zur Testdatei sucht.
# shellcheck source=../local/test_helper.bash
source "${BATS_TEST_DIRNAME}/../local/test_helper.bash"
