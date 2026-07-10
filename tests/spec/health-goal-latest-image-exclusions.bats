# health-goal-latest-image-exclusions — Implementation Plan
# Ticket: T001775

# Failing-Test-Step (RED)
# This test reproduces the bug where :latest images are not excluded in CLAUDE.md.
# It checks if the CLAUDE.md contains any unpinned :latest images.

@test "CLAUDE.md should not contain unpinned :latest images" {
  # We check for the presence of :latest in the CLAUDE.md file.
  # The goal is to ensure that we don't use :latest in our infrastructure.
  
  # Example of what we want to exclude:
  # - "use image: my-image:latest"
  
  # For now, we just check for the string ":latest"
  # In a real scenario, we would have a more sophisticated regex.
  
  if grep -q ":latest" CLAUDE.md; then
    echo "Found :latest in CLAUDE.md"
    exit 1
  fi
}
