#!/usr/bin/env bats

# Validates Taskfile.openclaw.yml parses and declares the expected task names.

setup() {
  cd "${BATS_TEST_DIRNAME}/../.."
}

@test "Taskfile.openclaw.yml parses as YAML" {
  run python3 -c "import yaml,sys; yaml.safe_load(open('Taskfile.openclaw.yml'))"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares all required tasks" {
  for t in backup install configure start status logs restore wipe; do
    run grep -E "^  ${t}:" Taskfile.openclaw.yml
    [ "$status" -eq 0 ] || { echo "missing task: ${t}"; return 1; }
  done
}

@test ".env.example points at the local Ollama URL" {
  grep -qE '^OPENAI_BASE_URL=http://10\.10\.0\.3:11434/v1$' openclaw/.env.example
}

@test ".env.example sets a chat model" {
  grep -qE '^OPENAI_MODEL=qwen2\.5:' openclaw/.env.example
}

@test "Root Taskfile.yml includes openclaw" {
  grep -qE 'Taskfile\.openclaw\.yml' Taskfile.yml
}

@test ".gitignore excludes openclaw/.env" {
  grep -qE '^openclaw/\.env$' .gitignore
}
