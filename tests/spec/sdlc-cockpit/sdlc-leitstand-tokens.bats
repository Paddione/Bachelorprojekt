#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/sdlc-leitstand-tokens.bats

setup() {
    # Get the project root. BATS_TEST_DIRNAME is the absolute dir of THIS test file
    # (tests/spec/sdlc-cockpit), so three ".."s up is the repo root — independent of CWD.
    # NOTE: BATS_SOURCEDIR is NOT set for the main test file (only for `load`/library
    # files), and wrapping the path in dirname() strips one ".." too many — either
    # resolves to the wrong directory (main checkout / .../tests instead of the repo root).
    PROJECT_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
    DESIGN_TOKENS_FILE="$PROJECT_ROOT/design/leitstand-ds/_tokens.css"
    SOURCE_CSS_FILE="$PROJECT_ROOT/components/website/src/styles/sdlc-leitstand.css"
}

@test "design/leitstand-ds/_tokens.css is a verbatim copy of components/website/src/styles/sdlc-leitstand.css (ignoring generation comment)" {
    # Ensure files exist
    [ -f "$DESIGN_TOKENS_FILE" ] || { echo "Missing $DESIGN_TOKENS_FILE"; return 1; }
    [ -f "$SOURCE_CSS_FILE" ] || { echo "Missing $SOURCE_CSS_FILE"; return 1; }

    # Create a temporary file with the content of DESIGN_TOKENS_FILE excluding the first 2 lines
    TEMP_FILE=$(mktemp)
    sed '1,2d' "$DESIGN_TOKENS_FILE" > "$TEMP_FILE"

    # Compare the temp file with the source file
    diff "$TEMP_FILE" "$SOURCE_CSS_FILE"
    RESULT=$?

    rm "$TEMP_FILE"

    if [ $RESULT -ne 0 ]; then
        echo "DIFF OUTPUT:"
        diff -u "$TEMP_FILE" "$SOURCE_CSS_FILE" >&2
        return 1
    fi
}

