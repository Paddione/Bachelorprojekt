#!/usr/bin/env bats
# T014540 / T014566: GitLab-CI-Job-Images dürfen nie zu einer Referenz mit
# leerem Registry-Prefix expandieren (InspectFailed "/ci-node22:latest").
# Hintergrund: Projekt-Variablen haben in GitLab Vorrang vor Datei-Variablen;
# eine leere Projektvariable CI_REGISTRY_IMAGE hat am 2026-08-23 20 Job-Pods
# mit dem invaliden Image "/ci-node22:latest" geblockt.

CI_YML=".gitlab-ci.yml"

setup() {
	[[ -f "$CI_YML" ]] || skip ".gitlab-ci.yml nicht gefunden"
}

@test "T014540: keine image:-Zeile nutzt \${CI_REGISTRY_IMAGE}-Indirektion" {
	! grep -q 'CI_REGISTRY_IMAGE' "$CI_YML"
}

@test "T014540: kein image:-Ref mit leerem Registry-Prefix (leading slash)" {
	! grep -E '^[[:space:]]*image:[[:space:]]*"?/' "$CI_YML"
}

@test "T014540: alle ci-node*-Image-Refs tragen vollen registry.gitlab.com-Host" {
	local count
	count=$(grep -cE '^[[:space:]]*image:.*ci-node[0-9]+' "$CI_YML")
	[[ "$count" -ge 1 ]]
	grep -E '^[[:space:]]*image:.*ci-node[0-9]+' "$CI_YML" | while IFS= read -r line; do
		[[ "$line" == *"registry.gitlab.com/"* ]]
	done
}
