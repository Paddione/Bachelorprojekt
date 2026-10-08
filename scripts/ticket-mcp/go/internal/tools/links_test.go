package tools

import (
	"testing"

	"github.com/mark3labs/mcp-go/server"
)

// RegisterLinkTools must register without panicking. Functional correctness
// of the bash adapters is covered by tests/py/spec/remaining_root_specs/test_ticket_mcp.py.
func TestRegisterLinkToolsNoPanic(t *testing.T) {
	s := server.NewMCPServer("test", "0.0.0")
	RegisterLinkTools(s) // must not panic
}
