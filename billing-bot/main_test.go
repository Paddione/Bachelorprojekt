package main

import (
	"encoding/json"
	"fmt"
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

func TestCreateNextcloudRoomParsesToken(t *testing.T) {
	// Mock Nextcloud OCS API
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST, got %s", r.Method)
		}
		if r.Header.Get("OCS-APIRequest") != "true" {
			t.Error("Missing OCS-APIRequest header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"ocs":{"meta":{"status":"ok","statuscode":200},"data":{"token":"abc123xyz"}}}`)
	}))
	defer srv.Close()

	// Temporarily override the NC URL
	orig := nextcloudURL
	nextcloudURL = srv.URL
	origPass := nextcloudAdminPass
	nextcloudAdminPass = "testpass"
	defer func() { nextcloudURL = orig; nextcloudAdminPass = origPass }()

	token, err := createNextcloudRoom("general")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "abc123xyz" {
		t.Errorf("expected token abc123xyz, got %s", token)
	}
}

func TestCreateNextcloudRoomNoPassword(t *testing.T) {
	orig := nextcloudAdminPass
	nextcloudAdminPass = ""
	defer func() { nextcloudAdminPass = orig }()

	_, err := createNextcloudRoom("general")
	if err == nil {
		t.Error("expected error when password is empty")
	}
}

func TestHandleSlashCallNoPassword(t *testing.T) {
	orig := nextcloudAdminPass
	nextcloudAdminPass = ""
	defer func() { nextcloudAdminPass = orig }()

	form := url.Values{}
	form.Add("command", "/call")
	form.Add("channel_name", "general")
	form.Add("channel_id", "ch1")
	form.Add("user_id", "u1")
	form.Add("user_name", "testuser")

	req := httptest.NewRequest("POST", "/slash", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	handleSlash(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
	var resp SlashResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.ResponseType != "ephemeral" {
		t.Errorf("expected ephemeral on error, got %s", resp.ResponseType)
	}
	if !strings.Contains(resp.Text, "Fehler") {
		t.Errorf("expected Fehler in error text, got: %s", resp.Text)
	}
}

func TestHandleSlashCallSuccess(t *testing.T) {
	// Mock Nextcloud Talk API
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"ocs":{"meta":{"status":"ok","statuscode":200},"data":{"token":"testtoken99"}}}`)
	}))
	defer srv.Close()

	origURL := nextcloudURL
	nextcloudURL = srv.URL
	origPass := nextcloudAdminPass
	nextcloudAdminPass = "pass"
	origDomain := ncDomain
	ncDomain = "files.example.com"
	origScheme := scheme
	scheme = "https"
	defer func() {
		nextcloudURL = origURL
		nextcloudAdminPass = origPass
		ncDomain = origDomain
		scheme = origScheme
	}()

	form := url.Values{}
	form.Add("command", "/call")
	form.Add("channel_name", "general")
	form.Add("channel_id", "ch1")
	form.Add("user_id", "u1")
	form.Add("user_name", "testuser")

	req := httptest.NewRequest("POST", "/slash", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	handleSlash(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
	var resp SlashResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.ResponseType != "in_channel" {
		t.Errorf("expected in_channel, got %s", resp.ResponseType)
	}
	if len(resp.Attachments) == 0 {
		t.Fatal("expected at least one attachment")
	}
	att := resp.Attachments[0]
	if !strings.Contains(att.TitleLink, "testtoken99") {
		t.Errorf("expected call URL with token in TitleLink, got: %s", att.TitleLink)
	}
	if !strings.Contains(att.Text, "general") {
		t.Errorf("expected channel name in text, got: %s", att.Text)
	}
}
