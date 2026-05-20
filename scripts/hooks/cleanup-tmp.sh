#!/usr/bin/env bash
# scripts/hooks/cleanup-tmp.sh
find /tmp -name "brainstorm-*" -mmin +60 -delete
