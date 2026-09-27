#!/usr/bin/env bash
# Laeuft mit cwd = Workdir des Laufs.
set -u
[ "$(./greet.sh)" = "moin" ]
