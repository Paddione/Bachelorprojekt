#!/usr/bin/env bash
# tests/spec/test_helper.bash — Weiterleitung auf tests/local/test_helper.bash
# Notwendig weil BATS `load` relativ zur Testdatei sucht.
#
# [T002503] Anker ist BASH_SOURCE[0] (der Pfad DIESER Datei), nicht BATS_TEST_DIRNAME
# (das Verzeichnis der ladenden Testdatei). Mit BATS_TEST_DIRNAME trug die Weiterleitung
# genau eine Ebene: aus tests/spec/ traf sie tests/local/, aus tests/spec/<spec-slug>/
# aber tests/spec/local/ — also ins Leere. Damit war sie unvereinbar mit der
# Verzeichniskonvention T002416, und jeder Test in einem Unterverzeichnis, der sie
# laedt, waere an einem Sourcing-Fehler im setup() gescheitert.
# shellcheck source=../local/test_helper.bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../local" && pwd)/test_helper.bash"
