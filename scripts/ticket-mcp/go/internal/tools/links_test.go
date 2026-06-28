package tools

import (
	"testing"

	"github.com/mark3labs/mcp-go/server"
)

// RegisterLinkTools must register without panicking. Functional correctness
// of the bash adapters is covered by tests/spec/ticket-mcp.bats.
func TestRegisterLinkToolsNoPanic(t *testing.T) {
	s := server.NewMCPServer("test", "0.0.0")
	RegisterLinkTools(s) // must not panic
}
