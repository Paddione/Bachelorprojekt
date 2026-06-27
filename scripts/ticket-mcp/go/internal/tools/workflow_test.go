package tools

import (
	"testing"

	"github.com/mark3labs/mcp-go/server"
)

// RegisterWorkflowTools must register without panicking and the binary must
// compile with all 9 wrappers present (presence is enforced mechanically by
// tests/spec/mcp-tooling.bats; this guards the Go registration path).
func TestRegisterWorkflowToolsNoPanic(t *testing.T) {
	s := server.NewMCPServer("test", "0.0.0")
	RegisterWorkflowTools(s) // must not panic
}
