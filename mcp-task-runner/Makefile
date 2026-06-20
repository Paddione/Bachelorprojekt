BIN := mcp-task-runner
BUILD_DIR := bin

.PHONY: build test install clean

build:
	go build -o $(BUILD_DIR)/$(BIN) .

test:
	go test ./... -v

install: build
	cp $(BUILD_DIR)/$(BIN) /usr/local/bin/$(BIN)

clean:
	rm -rf $(BUILD_DIR)
