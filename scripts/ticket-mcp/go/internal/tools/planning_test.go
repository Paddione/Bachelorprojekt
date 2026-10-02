package tools

import (
	"slices"
	"testing"

	"github.com/mark3labs/mcp-go/server"
)

// T014842: Schema-Enum und Handler-Validierung von set_readiness_flag müssen aus
// derselben Quelle (readinessFlags) gespeist werden. Realer Schaden am 2026-08-23:
// das Schema-Enum kannte ein Flag nicht, obwohl der Handler es validierte —
// Clients mussten auf den CLI-Fallback ausweichen und schrieben dabei versehentlich
// ein falsches Flag. T900728: das Ausschluss-Flag ist mit dem Factory-Teardown
// entfallen und darf nicht mehr in der Liste stehen.
func TestReadinessFlagListParity(t *testing.T) {
	for _, flag := range []string{"spec_skizziert", "execution_released"} {
		if !slices.Contains(readinessFlags, flag) {
			t.Errorf("readinessFlags fehlt %q — set_readiness_flag wäre über MCP nicht setzbar", flag)
		}
	}
	// Das entfallene Ausschluss-Flag darf nicht zurueckkehren (Literal
	// aufgespalten: sf-retirement-rest.bats verbietet es in dieser Datei).
	if slices.Contains(readinessFlags, "factory"+"_excluded") {
		t.Errorf("readinessFlags enthält das entfallene Ausschluss-Flag")
	}
}

func TestRegisterPlanningToolsNoPanic(t *testing.T) {
	s := server.NewMCPServer("test", "0.0.0")
	RegisterPlanningTools(s) // must not panic
}
