package tools

import (
	"reflect"
	"testing"
)

func TestBuildTriageArgsMinimal(t *testing.T) {
	got := buildTriageArgs("T001953", "triage", "", "", "", "", "")
	want := []string{"triage", "--id", "T001953", "--apply", "--no-comment", "--status", "triage"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("buildTriageArgs minimal = %v, want %v", got, want)
	}
}

func TestBuildTriageArgsAllFields(t *testing.T) {
	got := buildTriageArgs("T001953", "backlog", "hoch", "major", "bug", "ai_ready", "scripts")
	want := []string{
		"triage", "--id", "T001953", "--apply", "--no-comment",
		"--status", "backlog",
		"--priority", "hoch",
		"--severity", "major",
		"--type", "bug",
		"--attention-mode", "ai_ready",
		"--component", "scripts",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("buildTriageArgs all fields = %v, want %v", got, want)
	}
}

// TestBuildTriageArgsComponentOnly guards the T001953 regression: the
// triage_ticket MCP tool used to accept a `component` argument in its
// schema but never forwarded it to the underlying `vda.sh ticket triage`
// CLI call, so component could never be set via MCP even though the CLI
// itself supported --component.
func TestBuildTriageArgsComponentOnly(t *testing.T) {
	got := buildTriageArgs("T001953", "triage", "", "", "", "", "infra")
	found := false
	for i, a := range got {
		if a == "--component" && i+1 < len(got) && got[i+1] == "infra" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("buildTriageArgs did not forward --component infra, got %v", got)
	}
}

// TestBuildTriageArgsEmptyStatus guards the T002183 regression: the
// triage_ticket MCP tool used to default status to "triage" when empty,
// which clobbered the existing status. Now empty status should be omitted
// from the args so the CLI preserves the existing status.
func TestBuildTriageArgsEmptyStatus(t *testing.T) {
	got := buildTriageArgs("T002183", "", "", "", "", "", "")
	// Should NOT contain --status flag when status is empty
	for i, a := range got {
		if a == "--status" {
			t.Errorf("buildTriageArgs with empty status should not include --status flag, got %v", got)
			_ = i // avoid unused variable
			break
		}
	}
	// Verify the args structure is correct
	want := []string{"triage", "--id", "T002183", "--apply", "--no-comment"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("buildTriageArgs empty status = %v, want %v", got, want)
	}
}
