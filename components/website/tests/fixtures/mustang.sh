#!/usr/bin/env bash
# Validates an XML or PDF e-invoice via Mustangproject CLI in a Docker container.
# Uses public eclipse-temurin image + Mustang JAR cached at ~/.cache/mustang.
# Usage: mustang.sh <action> <file>   (action: validate | combine | extract | ...)
set -euo pipefail

MUSTANG_VERSION="2.23.0"
CACHE_DIR="${HOME}/.cache/mustang"
JAR_NAME="Mustang-CLI-${MUSTANG_VERSION}.jar"
JAR_URL="https://github.com/ZUGFeRD/mustangproject/releases/download/core-${MUSTANG_VERSION}/${JAR_NAME}"

mkdir -p "$CACHE_DIR"
if [[ ! -f "$CACHE_DIR/$JAR_NAME" ]]; then
  echo "Downloading $JAR_NAME …" >&2
  curl -fsSL "$JAR_URL" -o "$CACHE_DIR/$JAR_NAME"
fi

ACTION="${1:?usage: mustang.sh <action> <file>}"
FILE="${2:?usage: mustang.sh <action> <file>}"
DIR="$(cd "$(dirname "$FILE")" && pwd)"
NAME="$(basename "$FILE")"

docker run --rm \
  -v "$CACHE_DIR:/mustang:ro" \
  -v "$DIR:/work" \
  -w /work \
  eclipse-temurin:21-jre \
  java -jar "/mustang/$JAR_NAME" \
  --action "$ACTION" --source "/work/$NAME" --no-notices
