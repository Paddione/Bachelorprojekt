PREFIX ?= /usr/local/bin

build:
	go build -o ../ticket-mcp-go ./cmd/ticket-mcp

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
