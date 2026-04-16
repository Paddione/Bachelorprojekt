package main

import (
	"log"
	"net/http"
	"os"
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

func main() {
	log.Printf("sso-bridge: starting, upstream=%s", inURL)
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}
