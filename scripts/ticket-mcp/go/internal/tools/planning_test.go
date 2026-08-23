package tools

import (
	"slices"
	"testing"

	"github.com/mark3labs/mcp-go/server"
)

// T014842: Schema-Enum und Handler-Validierung von set_readiness_flag müssen aus
// derselben Quelle (readinessFlags) gespeist werden. Realer Schaden am 2026-08-23:
// das Schema-Enum kannte factory_excluded nicht, obwohl der Handler es validierte —
// Clients mussten auf den CLI-Fallback ausweichen und schrieben dabei versehentlich
// ein falsches Flag.
func TestReadinessFlagListContainsFactoryExcludedAndExecutionReleased(t *testing.T) {
	for _, flag := range []string{"factory_excluded", "execution_released"} {
		if !slices.Contains(readinessFlags, flag) {
			t.Errorf("readinessFlags fehlt %q — Dispatch-Gate (scripts/factory/queue.sh) wäre über MCP nicht setzbar", flag)
		}
	}
}

func TestRegisterPlanningToolsNoPanic(t *testing.T) {
	s := server.NewMCPServer("test", "0.0.0")
	RegisterPlanningTools(s) // must not panic
}
