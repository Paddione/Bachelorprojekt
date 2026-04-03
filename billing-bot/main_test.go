package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestHandleSlashHelp(t *testing.T) {
	req := httptest.NewRequest("POST", "/slash", strings.NewReader("command=/billing&text=help&user_id=test&user_name=test&channel_id=test"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	handleSlash(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}

	var resp SlashResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.ResponseType != "ephemeral" {
		t.Errorf("Expected response type ephemeral, got %s", resp.ResponseType)
	}
}

func TestHandleSlashUnknown(t *testing.T) {
	form := url.Values{}
	form.Add("command", "/billing")
	form.Add("text", "unknown")
	form.Add("user_id", "test")
	
	req := httptest.NewRequest("POST", "/slash", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	handleSlash(w, req)

	var resp SlashResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if !strings.Contains(resp.Text, "Unbekannter Befehl") {
		t.Errorf("Expected unknown command message, got %s", resp.Text)
	}
}

func TestEnv(t *testing.T) {
	if env("NON_EXISTENT_VAR", "fallback") != "fallback" {
		t.Error("Env fallback failed")
	}
}
