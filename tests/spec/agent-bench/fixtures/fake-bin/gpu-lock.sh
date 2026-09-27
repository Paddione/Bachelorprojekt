#!/usr/bin/env bash
# fixtures/fake-bin/gpu-lock.sh — protokolliert acquire/release.
echo "gpu-lock $*" >> "${FAKE_BIN_LOG:?FAKE_BIN_LOG not set}"
exit "${FAKE_GPU_LOCK_EXIT:-0}"
