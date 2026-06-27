package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/tools"
)

func main() {
	httpFlag := flag.Bool("http", false, "Starte im HTTP-Modus (StreamableHTTP)")
	flag.Parse()

	httpMode := *httpFlag || os.Getenv("TICKET_MCP_HTTP") == "1"

	mcpServer := server.NewMCPServer(
		"ticket-mcp",
		"1.0.0",
	)

	tools.RegisterListTools(mcpServer)
	tools.RegisterTriageTools(mcpServer)
	tools.RegisterPlanningTools(mcpServer)
	tools.RegisterLifecycleTools(mcpServer)
	tools.RegisterMishapTools(mcpServer)
	tools.RegisterWorkflowTools(mcpServer)

	if httpMode {
		portStr := os.Getenv("TICKET_MCP_PORT")
		if portStr == "" {
			portStr = "13004"
		}
		port, err := strconv.Atoi(portStr)
		if err != nil {
			log.Fatalf("Ungültiger TICKET_MCP_PORT: %s", portStr)
		}

		httpServer := server.NewStreamableHTTPServer(mcpServer,
			server.WithEndpointPath("/mcp"),
		)

		srv := &http.Server{
			Addr:    fmt.Sprintf(":%d", port),
			Handler: httpServer,
		}

		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()

		go func() {
			<-ctx.Done()
			srv.Shutdown(context.Background())
		}()

		fmt.Fprintf(os.Stderr, "ticket-mcp listening on :%d/mcp\n", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP-Server-Fehler: %s", err.Error())
		}
	} else {
		if err := server.ServeStdio(mcpServer); err != nil {
			log.Fatalf("stdio-Server-Fehler: %s", err.Error())
		}
	}
}
