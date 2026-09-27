#!/usr/bin/env bash
# Raeumt Datensaetze weg — aber aus dem FALSCHEN Verzeichnis: $CLEANUP_DIR
# (Default /tmp/f1-cleanup) statt dem Schreibziel von store.sh.
set -u
dir="${CLEANUP_DIR:-/tmp/f1-cleanup}"
mkdir -p "$dir"
rm -f "$dir/records.txt"
