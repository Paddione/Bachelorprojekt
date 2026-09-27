#!/usr/bin/env bash
# Schreibt einen Datensatz. Ziel: $STORE_DIR (Default /tmp/f1-store).
set -u
dir="${STORE_DIR:-/tmp/f1-store}"
mkdir -p "$dir"
echo "${1:-record}" >> "$dir/records.txt"
