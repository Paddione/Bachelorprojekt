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
	"time"

	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/tools"
)

func main() {
	httpFlag := flag.Bool("http", false, "Starte im HTTP-Modus (StreamableHTTP)")
	flushStale := flag.Bool("flush-stale-mishaps", false,
		"Einmaliger periodischer Buffer-Schnitt: bündelt den Mishap-Buffer, wenn sein ältester Eintrag überfällig ist, und beendet sich dann.")
	flushBrand := flag.String("brand", "mentolder", "Brand für --flush-stale-mishaps")
	flushMaxAgeDays := flag.Float64("flush-max-age-days", float64(tools.MISHAP_MAX_AGE)/float64(24*time.Hour),
		"Alter in Tagen, ab dem --flush-stale-mishaps schneidet")
	flag.Parse()

	// Periodischer Schnitt (Factory-Tick, scripts/factory/wakeup.sh) — läuft
	// bewusst als kurzlebiger Prozess und NICHT als MCP-Server, damit der Tick
	// ihn ohne Session aufrufen kann (T002383).
	if *flushStale {
		maxAge := time.Duration(*flushMaxAgeDays * float64(24*time.Hour))
		ext, err := tools.FlushStaleBuffer(*flushBrand, maxAge)
		if err != nil {
			log.Fatalf("flush-stale-mishaps fehlgeschlagen: %s", err.Error())
		}
		if ext == "" {
			fmt.Println("Mishap-Buffer nicht überfällig — kein Bundle-Ticket angelegt.")
		} else {
			fmt.Printf("Bundle-Ticket angelegt: %s\n", ext)
		}
		return
	}

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
	tools.RegisterLinkTools(mcpServer)

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
