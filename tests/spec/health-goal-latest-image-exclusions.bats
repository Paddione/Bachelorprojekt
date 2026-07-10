# health-goal-latest-image-exclusions — Implementation Plan
# Ticket: T001775

# Failing-Test-Step (RED)
# This test reproduces the bug where :latest images are not excluded in CLAUDE.md.
# It checks if the CLAUDE.md contains the required exclusion list.

@test "CLAUDE.md contains the correct :latest image exclusions" {
  # Check if the exclusion list is present in CLAUDE.md
  if ! grep -q "Website" CLAUDE.md || ! grep -q "Brett" CLAUDE.md || \
     ! grep -q "Docs" CLAUDE.md || ! grep -q "Videovault" CLAUDE.md || \
     ! grep -q "Mediaviewer-Widget" CLAUDE.md || \
     ! grep -q "Mentolder-Web" CLAUDE.md || \
     ! grep -q "Downloads" CLAUDE.md; then
    echo "Exclusion list is missing components in CLAUDE.md"
    exit 1
  fi
}
