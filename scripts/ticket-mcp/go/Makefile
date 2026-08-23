PREFIX ?= /usr/local/bin

# [T014940] Build-Info einbrennen, damit --version und die Stale-Warnung
# sagen können, welcher Stand läuft. Fallback 'dev' außerhalb eines Git-Repos.
BUILD_INFO ?= $(shell git describe --always --dirty 2>/dev/null || echo dev)

build:
	go build -ldflags "-X main.buildInfo=$(BUILD_INFO)" -o ../ticket-mcp-go ./cmd/ticket-mcp

# Installiert das Binary unter seinem PATH-Namen. Die Registry referenziert
# 'ticket-mcp-go' ohne Pfad (T002301) — ohne diesen Schritt greift sie ins Leere.
install: build
	install -m 0755 ../ticket-mcp-go $(PREFIX)/ticket-mcp-go

tidy:
	go mod tidy

test:
	go test ./...

vet:
	go vet ./...

all: tidy vet build test

.PHONY: build install tidy test vet all
