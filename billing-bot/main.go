// billing-bot bridges Mattermost interactive messages with the Invoice Ninja v5 API.
//
// Endpoints:
//   POST /slash    — Mattermost slash command (/billing)
//   POST /actions  — Mattermost interactive message actions (button clicks)
//   GET  /healthz  — Liveness/readiness probe
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// ── Configuration ────────────────────────────────────────────────

var (
	listenAddr      = env("LISTEN_ADDR", ":8090")
	invoiceNinjaURL = env("INVOICENINJA_URL", "http://invoiceninja:80")
	invoiceNinjaKey = env("INVOICENINJA_API_TOKEN", "")
	mattermostURL   = env("MATTERMOST_URL", "http://mattermost:8065")
	mattermostToken = env("MATTERMOST_BOT_TOKEN", "")
	billingDomain   = env("BILLING_DOMAIN", "billing.localhost")

	// Nextcloud Talk config (for /call command)
	nextcloudURL       = env("NEXTCLOUD_URL", "http://nextcloud.workspace.svc.cluster.local:80")
	nextcloudAdminUser = env("NEXTCLOUD_ADMIN_USER", "admin")
	nextcloudAdminPass = env("NEXTCLOUD_ADMIN_PASSWORD", "")
	ncDomain           = env("NC_DOMAIN", "files.localhost")
	scheme             = env("SCHEME", "https")
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Mattermost Types ─────────────────────────────────────────────

type SlashRequest struct {
	Token       string `json:"token"`
	TeamID      string `json:"team_id"`
	ChannelID   string `json:"channel_id"`
	ChannelName string `json:"channel_name"`
	UserID      string `json:"user_id"`
	UserName    string `json:"user_name"`
	Command     string `json:"command"`
	Text        string `json:"text"`
	ResponseURL string `json:"response_url"`
}

type ActionRequest struct {
	UserID    string            `json:"user_id"`
	UserName  string            `json:"user_name"`
	ChannelID string            `json:"channel_id"`
	PostID    string            `json:"post_id"`
	TriggerID string            `json:"trigger_id"`
	Context   map[string]string `json:"context"`
}

type SlashResponse struct {
	ResponseType string       `json:"response_type"`
	Text         string       `json:"text,omitempty"`
	Attachments  []Attachment `json:"attachments,omitempty"`
}

type Attachment struct {
	Text      string   `json:"text,omitempty"`
	Color     string   `json:"color,omitempty"`
	Title     string   `json:"title,omitempty"`
	TitleLink string   `json:"title_link,omitempty"`
	Actions   []Action `json:"actions,omitempty"`
}

type Action struct {
	ID          string      `json:"id"`
	Type        string      `json:"type"`
	Name        string      `json:"name"`
	Style       string      `json:"style,omitempty"`
	Integration Integration `json:"integration"`
}

type Integration struct {
	URL     string            `json:"url"`
	Context map[string]string `json:"context"`
}

type ActionResponse struct {
	Update        *UpdatePost `json:"update,omitempty"`
	EphemeralText string      `json:"ephemeral_text,omitempty"`
}

type UpdatePost struct {
	Message     string       `json:"message"`
	Attachments []Attachment `json:"attachments,omitempty"`
}

// ── Invoice Ninja Types ──────────────────────────────────────────

type INClient struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Contacts []INContact `json:"contacts"`
}

type INContact struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
}

type INLineItem struct {
	ProductKey string  `json:"product_key"`
	Notes      string  `json:"notes"`
	Cost       float64 `json:"cost"`
	Quantity   float64 `json:"quantity"`
}

type INInvoice struct {
	ID        string       `json:"id"`
	Number    string       `json:"number"`
	ClientID  string       `json:"client_id"`
	Date      string       `json:"date"`
	DueDate   string       `json:"due_date"`
	Amount    float64      `json:"amount"`
	LineItems []INLineItem `json:"line_items"`
}

type INQuote struct {
	ID        string       `json:"id"`
	Number    string       `json:"number"`
	ClientID  string       `json:"client_id"`
	Date      string       `json:"date"`
	Amount    float64      `json:"amount"`
	LineItems []INLineItem `json:"line_items"`
}

type INExpense struct {
	ID       string  `json:"id"`
	Number   string  `json:"number"`
	ClientID string  `json:"client_id,omitempty"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
}

type INResponse[T any] struct {
	Data T `json:"data"`
}

// ── Nextcloud Talk Types ─────────────────────────────────────────

type NCRoomResponse struct {
	OCS struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	} `json:"ocs"`
}

// ── Nextcloud Talk ───────────────────────────────────────────────

// createNextcloudRoom creates a fresh public Nextcloud Talk room named
// "#<channelName> Call" and returns its token.
func createNextcloudRoom(channelName string) (string, error) {
	if nextcloudAdminPass == "" {
		return "", fmt.Errorf("NEXTCLOUD_ADMIN_PASSWORD not configured")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"roomType": 3,
		"roomName": "#" + channelName + " Call",
	})

	req, err := http.NewRequest("POST",
		nextcloudURL+"/ocs/v2.php/apps/spreed/api/v4/room",
		bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.SetBasicAuth(nextcloudAdminUser, nextcloudAdminPass)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("OCS-APIRequest", "true")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("call NC API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("NC API returned %d: %s", resp.StatusCode, b)
	}

	var ncResp NCRoomResponse
	if err := json.NewDecoder(resp.Body).Decode(&ncResp); err != nil {
		return "", fmt.Errorf("decode NC response: %w", err)
	}

	if ncResp.OCS.Data.Token == "" {
		return "", fmt.Errorf("NC API returned empty token")
	}

	return ncResp.OCS.Data.Token, nil
}

// ── Main ─────────────────────────────────────────────────────────

func main() {
	http.HandleFunc("/slash", handleSlash)
	http.HandleFunc("/actions", handleAction)
	http.HandleFunc("/dialog/client", handleClientDialog)
	http.HandleFunc("/dialog/company", handleCompanyDialog)
	http.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})

	log.Printf("billing-bot listening on %s", listenAddr)
	if nextcloudAdminPass == "" {
		log.Printf("WARNING: NEXTCLOUD_ADMIN_PASSWORD not set — /call command will return errors")
	}
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}

// ── Slash Command Handler ────────────────────────────────────────

func handleSlash(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	req := SlashRequest{
		ChannelID:   r.FormValue("channel_id"),
		ChannelName: r.FormValue("channel_name"),
		UserID:      r.FormValue("user_id"),
		UserName:    r.FormValue("user_name"),
		Text:        strings.TrimSpace(r.FormValue("text")),
		ResponseURL: r.FormValue("response_url"),
	}

	var resp SlashResponse

	switch {
	case req.Text == "" || req.Text == "help":
		// Post interactive menu via Mattermost API so buttons are stored in DB.
		// Ephemeral slash responses don't persist, which breaks button callbacks.
		go postMenuViaMM(req)
		resp = SlashResponse{ResponseType: "ephemeral"}
	case req.Text == "setup":
		go postSetupMenuViaMM(req)
		resp = SlashResponse{ResponseType: "ephemeral"}
	case strings.HasPrefix(req.Text, "client "):
		resp = handleQuickClient(req)
	case strings.HasPrefix(req.Text, "invoice "):
		resp = handleQuickInvoice(req)
	default:
		resp = SlashResponse{
			ResponseType: "ephemeral",
			Text:         fmt.Sprintf("Unbekannter Befehl: `%s`. Nutze `/billing` oder `/billing help` fuer die Aktionen.", req.Text),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// postMenuViaMM creates the interactive button menu as an ephemeral post
// through the Mattermost REST API, which persists it in the DB so that
// button click callbacks (DoPostAction) can find the post.
func postMenuViaMM(req SlashRequest) {
	actionURL := "http://billing-bot:8090/actions"

	post := map[string]interface{}{
		"channel_id": req.ChannelID,
		"message":    "",
		"props": map[string]interface{}{
			"attachments": []map[string]interface{}{
				{
					"text":  fmt.Sprintf("**Buchhaltung** — @%s\nWas moechtest du erstellen?", req.UserName),
					"color": "#1E88E5",
					"actions": []map[string]interface{}{
						{"id": "createinvoice", "type": "button", "name": "Rechnung erstellen", "style": "primary", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_invoice"}}},
						{"id": "createquote", "type": "button", "name": "Angebot erstellen", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_quote"}}},
						{"id": "createexpense", "type": "button", "name": "Ausgabe erfassen", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_expense"}}},
						{"id": "createclient", "type": "button", "name": "Kunde anlegen", "style": "success", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_client"}}},
						{"id": "listclients", "type": "button", "name": "Kunden verwalten", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "list_clients"}}},
						{"id": "listinvoices", "type": "button", "name": "Rechnungen anzeigen", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "list_invoices"}}},
						{"id": "opendashboard", "type": "button", "name": "Dashboard oeffnen", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "open_dashboard"}}},
					},
				},
			},
		},
	}

	body, err := json.Marshal(post)
	if err != nil {
		log.Printf("postMenuViaMM: marshal error: %v", err)
		return
	}

	mmReq, err := http.NewRequest("POST", mattermostURL+"/api/v4/posts", bytes.NewReader(body))
	if err != nil {
		log.Printf("postMenuViaMM: request error: %v", err)
		return
	}
	mmReq.Header.Set("Authorization", "Bearer "+mattermostToken)
	mmReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(mmReq)
	if err != nil {
		log.Printf("postMenuViaMM: MM unreachable: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("postMenuViaMM: MM API %d: %s", resp.StatusCode, string(b))
	}
}

// postSetupMenuViaMM posts the setup/admin menu
func postSetupMenuViaMM(req SlashRequest) {
	actionURL := "http://billing-bot:8090/actions"

	post := map[string]interface{}{
		"channel_id": req.ChannelID,
		"message":    "",
		"props": map[string]interface{}{
			"attachments": []map[string]interface{}{
				{
					"text":  fmt.Sprintf("**Einstellungen** — @%s\nWas moechtest du konfigurieren?", req.UserName),
					"color": "#43A047",
					"actions": []map[string]interface{}{
						{"id": "setupcompany", "type": "button", "name": "Firmendaten bearbeiten", "style": "primary", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "setup_company"}}},
						{"id": "createclient", "type": "button", "name": "Kunde anlegen", "style": "success", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_client"}}},
						{"id": "listclients", "type": "button", "name": "Kunden verwalten", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "list_clients"}}},
						{"id": "opendashboard", "type": "button", "name": "Dashboard oeffnen", "integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "open_dashboard"}}},
					},
				},
			},
		},
	}

	body, _ := json.Marshal(post)
	mmReq, _ := http.NewRequest("POST", mattermostURL+"/api/v4/posts", bytes.NewReader(body))
	mmReq.Header.Set("Authorization", "Bearer "+mattermostToken)
	mmReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(mmReq)
	if err != nil {
		log.Printf("postSetupMenuViaMM: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("postSetupMenuViaMM: MM %d: %s", resp.StatusCode, string(b))
	}
}

// openCompanyDialog opens a dialog pre-filled with current company settings
func openCompanyDialog(req ActionRequest) {
	triggerID := req.TriggerID
	if triggerID == "" {
		log.Printf("openCompanyDialog: no trigger_id")
		return
	}

	// Fetch current company settings
	var compResp struct {
		Data struct {
			Settings map[string]interface{} `json:"settings"`
		} `json:"data"`
	}
	_ = inAPI("GET", "/api/v1/companies/1", nil, &compResp)
	s := compResp.Data.Settings

	getString := func(key string) string {
		if v, ok := s[key]; ok && v != nil {
			return fmt.Sprintf("%v", v)
		}
		return ""
	}

	dialog := map[string]interface{}{
		"trigger_id": triggerID,
		"url":        "http://billing-bot:8090/dialog/company",
		"dialog": map[string]interface{}{
			"callback_id":      "setup_company",
			"title":            "Firmendaten",
			"submit_label":     "Speichern",
			"notify_on_cancel": false,
			"elements": []map[string]interface{}{
				{"display_name": "Firmenname", "name": "name", "type": "text", "default": getString("name"), "optional": false},
				{"display_name": "E-Mail", "name": "email", "type": "text", "subtype": "email", "default": getString("email"), "optional": true},
				{"display_name": "Telefon", "name": "phone", "type": "text", "default": getString("phone"), "optional": true},
				{"display_name": "Website", "name": "website", "type": "text", "default": getString("website"), "optional": true},
				{"display_name": "Strasse + Hausnr.", "name": "address1", "type": "text", "default": getString("address1"), "optional": true},
				{"display_name": "Adresszusatz", "name": "address2", "type": "text", "default": getString("address2"), "optional": true},
				{"display_name": "PLZ", "name": "postal_code", "type": "text", "default": getString("postal_code"), "optional": true},
				{"display_name": "Ort", "name": "city", "type": "text", "default": getString("city"), "optional": true},
				{"display_name": "USt-IdNr.", "name": "vat_number", "type": "text", "default": getString("vat_number"), "placeholder": "DE123456789", "optional": true},
				{"display_name": "Steuernummer", "name": "id_number", "type": "text", "default": getString("id_number"), "optional": true},
			},
		},
	}

	body, _ := json.Marshal(dialog)
	r, _ := http.NewRequest("POST", mattermostURL+"/api/v4/actions/dialogs/open", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+mattermostToken)
	r.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		log.Printf("openCompanyDialog: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("openCompanyDialog: MM %d: %s", resp.StatusCode, string(b))
	}
}

// handleCompanyDialog saves company settings to Invoice Ninja
func handleCompanyDialog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     string            `json:"user_id"`
		ChannelID  string            `json:"channel_id"`
		Submission map[string]string `json:"submission"`
		Cancelled  bool              `json:"cancelled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Cancelled {
		w.WriteHeader(http.StatusOK)
		return
	}

	s := req.Submission
	log.Printf("dialog/company: name=%s", s["name"])

	settings := map[string]interface{}{
		"name":        s["name"],
		"email":       s["email"],
		"phone":       s["phone"],
		"website":     s["website"],
		"address1":    s["address1"],
		"address2":    s["address2"],
		"postal_code": s["postal_code"],
		"city":        s["city"],
		"state":       "",
		"country_id":  "276",
		"vat_number":  s["vat_number"],
		"id_number":   s["id_number"],
		"currency_id": "3",
		"language_id": "5",
		"timezone_id": "18",
	}

	update := map[string]interface{}{"settings": settings}
	var result map[string]interface{}
	if err := inAPI("PUT", "/api/v1/companies/1", update, &result); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"errors": map[string]string{"name": fmt.Sprintf("Fehler: %v", err)},
		})
		return
	}

	postToMM(req.ChannelID, fmt.Sprintf("Firmendaten aktualisiert: **%s**\n"+
		"%s, %s %s\n"+
		"USt-IdNr: %s | Steuernr: %s\n\n"+
		"Weitere Details (Logo, Bankdaten, Zahlungsbedingungen): [Invoice Ninja Einstellungen](https://%s/#/settings/company_details)",
		s["name"], s["address1"], s["postal_code"], s["city"],
		s["vat_number"], s["id_number"], billingDomain))

	w.WriteHeader(http.StatusOK)
}

// ── Interactive Action Handler ───────────────────────────────────

func handleAction(w http.ResponseWriter, r *http.Request) {
	var req ActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	action := req.Context["action"]
	log.Printf("action=%s user=%s channel=%s", action, req.UserName, req.ChannelID)

	var resp ActionResponse

	switch action {
	case "create_invoice":
		resp = actionCreateInvoice(req)
	case "create_quote":
		resp = actionCreateQuote(req)
	case "create_expense":
		resp = actionCreateExpense(req)
	case "create_client":
		openClientDialog(req)
		resp = ActionResponse{}
	case "setup_company":
		openCompanyDialog(req)
		resp = ActionResponse{}
	case "list_clients":
		resp = actionListClients(req)
	case "list_invoices":
		resp = actionListInvoices(req)
	case "open_dashboard":
		resp = ActionResponse{
			EphemeralText: fmt.Sprintf("Dashboard oeffnen: [Invoice Ninja](https://%s)", billingDomain),
		}
	default:
		resp = ActionResponse{
			EphemeralText: fmt.Sprintf("Unbekannte Aktion: `%s`", action),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ── Action Implementations ───────────────────────────────────────

// openClientDialog triggers a Mattermost interactive dialog for client creation
func openClientDialog(req ActionRequest) {
	triggerID := req.TriggerID
	if triggerID == "" {
		log.Printf("openClientDialog: no trigger_id")
		return
	}

	dialog := map[string]interface{}{
		"trigger_id": triggerID,
		"url":        "http://billing-bot:8090/dialog/client",
		"dialog": map[string]interface{}{
			"callback_id":       "create_client",
			"title":             "Kunde anlegen",
			"submit_label":      "Anlegen",
			"notify_on_cancel":  false,
			"elements": []map[string]interface{}{
				{"display_name": "Firmenname / Name", "name": "name", "type": "text", "placeholder": "Musterfirma GmbH", "optional": false},
				{"display_name": "Ansprechpartner Vorname", "name": "first_name", "type": "text", "placeholder": "Max", "optional": true},
				{"display_name": "Ansprechpartner Nachname", "name": "last_name", "type": "text", "placeholder": "Mustermann", "optional": true},
				{"display_name": "E-Mail", "name": "email", "type": "text", "subtype": "email", "placeholder": "kontakt@firma.de", "optional": true},
				{"display_name": "Telefon", "name": "phone", "type": "text", "placeholder": "+49 123 456789", "optional": true},
				{"display_name": "Strasse + Hausnr.", "name": "address1", "type": "text", "placeholder": "Musterstr. 1", "optional": true},
				{"display_name": "PLZ", "name": "postal_code", "type": "text", "placeholder": "12345", "optional": true},
				{"display_name": "Ort", "name": "city", "type": "text", "placeholder": "Berlin", "optional": true},
				{"display_name": "USt-IdNr.", "name": "vat_number", "type": "text", "placeholder": "DE123456789", "optional": true},
				{"display_name": "Notizen", "name": "notes", "type": "textarea", "placeholder": "Interne Notizen zum Kunden", "optional": true},
			},
		},
	}

	body, _ := json.Marshal(dialog)
	req2, _ := http.NewRequest("POST", mattermostURL+"/api/v4/actions/dialogs/open", bytes.NewReader(body))
	req2.Header.Set("Authorization", "Bearer "+mattermostToken)
	req2.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req2)
	if err != nil {
		log.Printf("openClientDialog: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("openClientDialog: MM %d: %s", resp.StatusCode, string(b))
	}
}

// handleClientDialog processes the submitted client creation dialog
func handleClientDialog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     string            `json:"user_id"`
		ChannelID  string            `json:"channel_id"`
		Submission map[string]string `json:"submission"`
		Cancelled  bool              `json:"cancelled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Cancelled {
		w.WriteHeader(http.StatusOK)
		return
	}

	s := req.Submission
	log.Printf("dialog/client: name=%s user=%s", s["name"], req.UserID)

	if s["name"] == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"errors": map[string]string{"name": "Firmenname ist erforderlich"},
		})
		return
	}

	client := map[string]interface{}{
		"name":        s["name"],
		"address1":    s["address1"],
		"city":        s["city"],
		"postal_code": s["postal_code"],
		"country_id":  "276", // Germany
		"vat_number":  s["vat_number"],
		"phone":       s["phone"],
		"public_notes": s["notes"],
		"contacts": []map[string]string{
			{
				"first_name": s["first_name"],
				"last_name":  s["last_name"],
				"email":      s["email"],
				"phone":      s["phone"],
			},
		},
	}

	var result INResponse[INClient]
	if err := inAPI("POST", "/api/v1/clients", client, &result); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"errors": map[string]string{"name": fmt.Sprintf("Fehler: %v", err)},
		})
		return
	}

	// Post confirmation to channel
	msg := fmt.Sprintf("Kunde **%s** angelegt von @%s\n"+
		"Bearbeiten: [Invoice Ninja](https://%s/#/clients/%s/edit)",
		result.Data.Name, req.UserID, billingDomain, result.Data.ID)

	postToMM(req.ChannelID, msg)

	w.WriteHeader(http.StatusOK)
}

// actionListClients returns a table of existing clients with edit links
func actionListClients(req ActionRequest) ActionResponse {
	clients, err := inListClients()
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}
	if len(clients) == 0 {
		return ActionResponse{EphemeralText: "Noch keine Kunden vorhanden."}
	}

	var lines []string
	lines = append(lines, "**Kunden:**\n")
	lines = append(lines, "| Name | Kontakt | E-Mail | Bearbeiten |")
	lines = append(lines, "|------|---------|--------|------------|")
	for _, c := range clients {
		contact := ""
		email := ""
		if len(c.Contacts) > 0 {
			contact = strings.TrimSpace(c.Contacts[0].FirstName + " " + c.Contacts[0].LastName)
			email = c.Contacts[0].Email
		}
		lines = append(lines, fmt.Sprintf("| %s | %s | %s | [Bearbeiten](https://%s/#/clients/%s/edit) |",
			c.Name, contact, email, billingDomain, c.ID))
	}

	return ActionResponse{EphemeralText: strings.Join(lines, "\n")}
}

// postToMM sends a message to a channel via the Mattermost API
func postToMM(channelID, message string) {
	post := map[string]string{"channel_id": channelID, "message": message}
	body, _ := json.Marshal(post)
	req, _ := http.NewRequest("POST", mattermostURL+"/api/v4/posts", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+mattermostToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("postToMM: %v", err)
		return
	}
	resp.Body.Close()
}

func actionCreateInvoice(req ActionRequest) ActionResponse {
	// Get first available client, or prompt to create one
	clients, err := inListClients()
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler beim Laden der Kunden: %v", err)}
	}
	if len(clients) == 0 {
		return ActionResponse{
			EphemeralText: "Noch keine Kunden vorhanden. Bitte zuerst einen **Kunden anlegen**.",
		}
	}

	today := time.Now().Format("2006-01-02")
	due := time.Now().AddDate(0, 0, 30).Format("2006-01-02")

	invoice := map[string]interface{}{
		"client_id": clients[0].ID,
		"date":      today,
		"due_date":  due,
		"line_items": []map[string]interface{}{
			{
				"product_key": "SERVICE",
				"notes":       "Dienstleistung (bitte in Invoice Ninja anpassen)",
				"cost":        0,
				"quantity":    1,
			},
		},
	}

	var result INResponse[INInvoice]
	if err := inAPI("POST", "/api/v1/invoices", invoice, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Rechnung **%s** erstellt fuer Kunde **%s**.\n"+
				"Faellig am: %s\n\n"+
				"Bearbeiten: [Invoice Ninja](http://%s/#/invoices/%s/edit)\n\n"+
				"_Passe Positionen und Betraege direkt in Invoice Ninja an._",
			result.Data.Number, clients[0].Name, due, billingDomain, result.Data.ID,
		),
	}
}

func actionCreateQuote(req ActionRequest) ActionResponse {
	clients, err := inListClients()
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}
	if len(clients) == 0 {
		return ActionResponse{
			EphemeralText: "Noch keine Kunden vorhanden. Bitte zuerst einen **Kunden anlegen**.",
		}
	}

	today := time.Now().Format("2006-01-02")

	quote := map[string]interface{}{
		"client_id": clients[0].ID,
		"date":      today,
		"line_items": []map[string]interface{}{
			{
				"product_key": "SERVICE",
				"notes":       "Angebot (bitte in Invoice Ninja anpassen)",
				"cost":        0,
				"quantity":    1,
			},
		},
	}

	var result INResponse[INQuote]
	if err := inAPI("POST", "/api/v1/quotes", quote, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Angebot **%s** erstellt fuer Kunde **%s**.\n\n"+
				"Bearbeiten: [Invoice Ninja](http://%s/#/quotes/%s/edit)",
			result.Data.Number, clients[0].Name, billingDomain, result.Data.ID,
		),
	}
}

func actionCreateExpense(req ActionRequest) ActionResponse {
	expense := map[string]interface{}{
		"amount":        0,
		"public_notes":  fmt.Sprintf("Ausgabe erfasst von @%s", req.UserName),
		"private_notes": "Bitte Betrag und Kategorie in Invoice Ninja anpassen",
		"date":          time.Now().Format("2006-01-02"),
	}

	var result INResponse[INExpense]
	if err := inAPI("POST", "/api/v1/expenses", expense, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Ausgabe erfasst (ID: `%s`).\n\n"+
				"Bearbeiten: [Invoice Ninja](http://%s/#/expenses/%s/edit)\n\n"+
				"_Bitte Betrag und Kategorie anpassen._",
			result.Data.ID, billingDomain, result.Data.ID,
		),
	}
}

func actionListInvoices(req ActionRequest) ActionResponse {
	var result INResponse[[]INInvoice]
	if err := inAPI("GET", "/api/v1/invoices?per_page=5&sort=created_at|desc", nil, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	if len(result.Data) == 0 {
		return ActionResponse{EphemeralText: "Noch keine Rechnungen vorhanden."}
	}

	var lines []string
	lines = append(lines, "**Letzte Rechnungen:**\n")
	lines = append(lines, "| Nr. | Betrag | Datum | Link |")
	lines = append(lines, "|-----|--------|-------|------|")
	for _, inv := range result.Data {
		lines = append(lines, fmt.Sprintf("| %s | %.2f EUR | %s | [Bearbeiten](http://%s/#/invoices/%s/edit) |",
			inv.Number, inv.Amount, inv.Date, billingDomain, inv.ID))
	}

	return ActionResponse{
		EphemeralText: strings.Join(lines, "\n"),
	}
}

// ── Quick Commands (slash text) ──────────────────────────────────

func handleQuickClient(req SlashRequest) SlashResponse {
	name := strings.TrimPrefix(req.Text, "client ")
	if name == "" {
		return SlashResponse{ResponseType: "ephemeral", Text: "Nutzung: `/billing client <Kundenname>`"}
	}

	client := map[string]interface{}{
		"name":     name,
		"contacts": []map[string]string{{"first_name": name}},
	}

	var result INResponse[INClient]
	if err := inAPI("POST", "/api/v1/clients", client, &result); err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Fehler: %v", err)}
	}

	return SlashResponse{
		ResponseType: "in_channel",
		Text: fmt.Sprintf(
			"Kunde **%s** angelegt von @%s. [Bearbeiten](http://%s/#/clients/%s)",
			name, req.UserName, billingDomain, result.Data.ID,
		),
	}
}

func handleQuickInvoice(req SlashRequest) SlashResponse {
	// /billing invoice <client-name>
	clientName := strings.TrimPrefix(req.Text, "invoice ")
	if clientName == "" {
		return SlashResponse{ResponseType: "ephemeral", Text: "Nutzung: `/billing invoice <Kundenname>`"}
	}

	// Search for client by name
	var result INResponse[[]INClient]
	if err := inAPI("GET", fmt.Sprintf("/api/v1/clients?filter=%s&per_page=1", clientName), nil, &result); err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Fehler: %v", err)}
	}
	if len(result.Data) == 0 {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Kein Kunde mit Name `%s` gefunden.", clientName)}
	}

	today := time.Now().Format("2006-01-02")
	due := time.Now().AddDate(0, 0, 30).Format("2006-01-02")

	invoice := map[string]interface{}{
		"client_id": result.Data[0].ID,
		"date":      today,
		"due_date":  due,
		"line_items": []map[string]interface{}{
			{"product_key": "SERVICE", "notes": "Dienstleistung", "cost": 0, "quantity": 1},
		},
	}

	var invResult INResponse[INInvoice]
	if err := inAPI("POST", "/api/v1/invoices", invoice, &invResult); err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Fehler: %v", err)}
	}

	return SlashResponse{
		ResponseType: "in_channel",
		Text: fmt.Sprintf(
			"Rechnung **%s** erstellt fuer **%s** von @%s (faellig: %s)\n[Bearbeiten](http://%s/#/invoices/%s/edit)",
			invResult.Data.Number, clientName, req.UserName, due, billingDomain, invResult.Data.ID,
		),
	}
}

// ── Invoice Ninja API Client ─────────────────────────────────────

func inAPI(method, path string, body interface{}, target interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("JSON encode: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, invoiceNinjaURL+path, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-TOKEN", invoiceNinjaKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("Invoice Ninja unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Invoice Ninja API %d: %s", resp.StatusCode, string(b))
	}

	if target != nil {
		return json.NewDecoder(resp.Body).Decode(target)
	}
	return nil
}

func inListClients() ([]INClient, error) {
	var result INResponse[[]INClient]
	if err := inAPI("GET", "/api/v1/clients?per_page=20&sort=name|asc", nil, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}
