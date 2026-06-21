build:
	go build -o ../ticket-mcp-go ./cmd/ticket-mcp

tidy:
	go mod tidy

test:
	go test ./...

vet:
	go vet ./...

all: tidy vet build test

.PHONY: build tidy test vet all
