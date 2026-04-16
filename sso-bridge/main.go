package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"
)

var (
	listenAddr  = env("LISTEN_ADDR", ":8180")
	inURL       = env("INVOICENINJA_URL", "http://invoiceninja:80")
	sessionName = env("SESSION_COOKIE", "laravel_session")
	ssoPath     = env("SSO_PATH", "/sso-auth.php")
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type ssoResp struct {
	SessionID string `json:"session_id"`
}

// buildHandler constructs the HTTP handler for a given upstream URL.
// Extracted for testability.
func buildHandler(upstream string) http.Handler {
	target, err := url.Parse(upstream)
	if err != nil {
		log.Fatalf("invalid upstream URL %q: %v", upstream, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		handle(w, r, proxy, upstream)
	})
	return mux
}

func handle(w http.ResponseWriter, r *http.Request, proxy *httputil.ReverseProxy, upstream string) {
	email := r.Header.Get("X-Auth-Request-Email")

	// No email → skip-auth path (static assets, webhooks). Proxy directly.
	if email == "" {
		proxy.ServeHTTP(w, r)
		return
	}

	// Already has a Laravel session cookie. Proxy directly.
	if _, err := r.Cookie(sessionName); err == nil {
		proxy.ServeHTTP(w, r)
		return
	}

	// Need to create a session for this Keycloak-authenticated user.
	sessionID, err := createSession(upstream, email)
	if err != nil {
		log.Printf("sso-bridge: session creation failed for %q: %v (proxying anyway)", email, err)
		proxy.ServeHTTP(w, r)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, r.RequestURI, http.StatusFound)
}

func createSession(upstream, email string) (string, error) {
	target, _ := url.Parse(upstream)
	target.Path = ssoPath
	q := target.Query()
	q.Set("email", email)
	target.RawQuery = q.Encode()

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(target.String())
	if err != nil {
		return "", fmt.Errorf("GET %s: %w", target.String(), err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("sso-auth.php returned %d: %s", resp.StatusCode, body)
	}

	var result ssoResp
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode sso response: %w", err)
	}
	if result.SessionID == "" {
		return "", fmt.Errorf("sso-auth.php returned empty session_id")
	}
	return result.SessionID, nil
}

func main() {
	log.Printf("sso-bridge: listening %s → %s", listenAddr, inURL)
	log.Fatal(http.ListenAndServe(listenAddr, buildHandler(inURL)))
}
