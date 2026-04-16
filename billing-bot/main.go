// billing-bot bridges Mattermost interactive messages with the Stripe API.
//
// Endpoints:
//   POST /slash    — Mattermost slash command (/billing, /call)
//   POST /actions  — Mattermost interactive message actions (button clicks)
//   GET  /healthz  — Liveness/readiness probe
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	stripe "github.com/stripe/stripe-go/v85"
)

// ── Configuration ────────────────────────────────────────────────

var (
	listenAddr      = env("LISTEN_ADDR", ":8090")
	stripeSecretKey = env("STRIPE_SECRET_KEY", "")
	mattermostURL   = env("MATTERMOST_URL", "http://mattermost:8065")
	mattermostToken = env("MATTERMOST_BOT_TOKEN", "")

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

// stripeDashboard returns the Stripe dashboard base URL (test vs. live)
func stripeDashboard() string {
	if strings.HasPrefix(stripeSecretKey, "sk_live_") {
		return "https://dashboard.stripe.com"
	}
	return "https://dashboard.stripe.com/test"
}

// newSC creates a new Stripe client
func newSC() *stripe.Client {
	return stripe.NewClient(stripeSecretKey)
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

// Context returns a background context for use in Stripe API calls.
func (r SlashRequest) Context() context.Context {
	return context.Background()
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

// ── Nextcloud Talk Types ─────────────────────────────────────────

type NCRoomResponse struct {
	OCS struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	} `json:"ocs"`
}

// ── Nextcloud Talk ───────────────────────────────────────────────

func createNextcloudRoom(channelName string) (string, error) {
	if nextcloudAdminPass == "" {
		return "", fmt.Errorf("NEXTCLOUD_ADMIN_PASSWORD not configured")
	}
	body, _ := json.Marshal(map[string]interface{}{
		"roomType": 3,
		"roomName": "#" + channelName + " Call",
	})
	req, err := http.NewRequest("POST",
		nextcloudURL+"/ocs/v2.php/apps/spreed/api/v4/room?format=json",
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
	http.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})

	log.Printf("billing-bot listening on %s", listenAddr)
	if stripeSecretKey == "" {
		log.Printf("WARNING: STRIPE_SECRET_KEY not set — billing commands will fail")
	}
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
		Command:     r.FormValue("command"),
		ChannelID:   r.FormValue("channel_id"),
		ChannelName: r.FormValue("channel_name"),
		UserID:      r.FormValue("user_id"),
		UserName:    r.FormValue("user_name"),
		Text:        strings.TrimSpace(r.FormValue("text")),
		ResponseURL: r.FormValue("response_url"),
	}

	var resp SlashResponse
	switch {
	case req.Command == "/call":
		resp = handleCallCommand(req)
	case req.Text == "" || req.Text == "help":
		go postMenuViaMM(req)
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

func handleCallCommand(req SlashRequest) SlashResponse {
	token, err := createNextcloudRoom(req.ChannelName)
	if err != nil {
		log.Printf("handleCallCommand: %v", err)
		return SlashResponse{
			ResponseType: "ephemeral",
			Text:         "Fehler: Nextcloud Talk-Raum konnte nicht erstellt werden.",
		}
	}
	callURL := fmt.Sprintf("%s://%s/apps/spreed/call/%s", scheme, ncDomain, token)
	return SlashResponse{
		ResponseType: "in_channel",
		Attachments: []Attachment{
			{
				Color:     "#1f9b00",
				Text:      fmt.Sprintf("📹 **#%s Call** gestartet", req.ChannelName),
				Title:     "▶ Join Call",
				TitleLink: callURL,
			},
		},
	}
}

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
						{"id": "createinvoice", "type": "button", "name": "Rechnung erstellen", "style": "primary",
							"integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_invoice"}}},
						{"id": "createquote", "type": "button", "name": "Angebot erstellen",
							"integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_quote"}}},
						{"id": "createclient", "type": "button", "name": "Kunde anlegen", "style": "success",
							"integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "create_client"}}},
						{"id": "listclients", "type": "button", "name": "Kunden verwalten",
							"integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "list_clients"}}},
						{"id": "listinvoices", "type": "button", "name": "Rechnungen anzeigen",
							"integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "list_invoices"}}},
						{"id": "opendashboard", "type": "button", "name": "Stripe Dashboard",
							"integration": map[string]interface{}{"url": actionURL, "context": map[string]string{"action": "open_dashboard"}}},
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
		log.Printf("postMenuViaMM: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("postMenuViaMM: MM %d: %s", resp.StatusCode, string(b))
	}
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
		resp = actionCreateInvoice(r.Context(), req)
	case "create_quote":
		resp = actionCreateQuote(r.Context(), req)
	case "create_client":
		openClientDialog(req)
		resp = ActionResponse{}
	case "list_clients":
		resp = actionListClients(r.Context(), req)
	case "list_invoices":
		resp = actionListInvoices(r.Context(), req)
	case "open_dashboard":
		resp = ActionResponse{
			EphemeralText: fmt.Sprintf("Stripe Dashboard oeffnen: [Invoices](%s/invoices) | [Customers](%s/customers)",
				stripeDashboard(), stripeDashboard()),
		}
	default:
		resp = ActionResponse{EphemeralText: fmt.Sprintf("Unbekannte Aktion: `%s`", action)}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ── Stripe Helpers ───────────────────────────────────────────────

// stripeStatusLabel returns a German label for a Stripe invoice status
func stripeStatusLabel(status stripe.InvoiceStatus) string {
	switch status {
	case stripe.InvoiceStatusDraft:
		return "Entwurf"
	case stripe.InvoiceStatusOpen:
		return "Offen"
	case stripe.InvoiceStatusPaid:
		return "Bezahlt"
	case stripe.InvoiceStatusVoid:
		return "Storniert"
	case stripe.InvoiceStatusUncollectible:
		return "Uneinbringlich"
	default:
		return string(status)
	}
}

// fmtUnixDate formats a Unix timestamp as YYYY-MM-DD
func fmtUnixDate(ts int64) string {
	if ts == 0 {
		return ""
	}
	return time.Unix(ts, 0).UTC().Format("2006-01-02")
}

// stripeListCustomers returns up to 20 Stripe customers
func stripeListCustomers(ctx context.Context) ([]*stripe.Customer, error) {
	sc := newSC()
	params := &stripe.CustomerListParams{}
	params.Limit = stripe.Int64(20)

	var customers []*stripe.Customer
	var iterErr error
	sc.V1Customers.List(ctx, params).All(ctx)(func(c *stripe.Customer, err error) bool {
		if err != nil {
			iterErr = err
			return false
		}
		customers = append(customers, c)
		return len(customers) < 20
	})
	if iterErr != nil {
		return nil, iterErr
	}
	return customers, nil
}

// stripeCreateDraftInvoice creates an InvoiceItem + draft Invoice for a customer
func stripeCreateDraftInvoice(ctx context.Context, customerID, description string, amountCents int64) (*stripe.Invoice, error) {
	sc := newSC()

	_, err := sc.V1InvoiceItems.Create(ctx, &stripe.InvoiceItemCreateParams{
		Customer:    stripe.String(customerID),
		Amount:      stripe.Int64(amountCents),
		Currency:    stripe.String("eur"),
		Description: stripe.String(description),
	})
	if err != nil {
		return nil, fmt.Errorf("create invoice item: %w", err)
	}

	inv, err := sc.V1Invoices.Create(ctx, &stripe.InvoiceCreateParams{
		Customer:         stripe.String(customerID),
		CollectionMethod: stripe.String("send_invoice"),
		DaysUntilDue:     stripe.Int64(30),
		AutoAdvance:      stripe.Bool(false),
	})
	if err != nil {
		return nil, fmt.Errorf("create invoice: %w", err)
	}
	return inv, nil
}

// ── Action Implementations ───────────────────────────────────────

func openClientDialog(req ActionRequest) {
	if req.TriggerID == "" {
		log.Printf("openClientDialog: no trigger_id")
		return
	}
	dialog := map[string]interface{}{
		"trigger_id": req.TriggerID,
		"url":        "http://billing-bot:8090/dialog/client",
		"dialog": map[string]interface{}{
			"callback_id":      "create_client",
			"title":            "Kunde anlegen",
			"submit_label":     "Anlegen",
			"notify_on_cancel": false,
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
			},
		},
	}
	body, _ := json.Marshal(dialog)
	r, _ := http.NewRequest("POST", mattermostURL+"/api/v4/actions/dialogs/open", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+mattermostToken)
	r.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(r)
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

func handleClientDialog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     string            `json:"user_id"`
		UserName   string            `json:"user_name"`
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
	if s["name"] == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"errors": map[string]string{"name": "Firmenname ist erforderlich"},
		})
		return
	}

	sc := newSC()
	cParams := &stripe.CustomerCreateParams{
		Name:  stripe.String(s["name"]),
		Email: stripe.String(s["email"]),
		Phone: stripe.String(s["phone"]),
		Address: &stripe.AddressParams{
			Line1:      stripe.String(s["address1"]),
			City:       stripe.String(s["city"]),
			PostalCode: stripe.String(s["postal_code"]),
			Country:    stripe.String("DE"),
		},
		Metadata: map[string]string{
			"vat_number": s["vat_number"],
			"first_name": s["first_name"],
			"last_name":  s["last_name"],
		},
		PreferredLocales: stripe.StringSlice([]string{"de"}),
	}
	c, err := sc.V1Customers.Create(r.Context(), cParams)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"errors": map[string]string{"name": fmt.Sprintf("Stripe Fehler: %v", err)},
		})
		return
	}

	postToMM(req.ChannelID, fmt.Sprintf(
		"Kunde **%s** angelegt von @%s\nE-Mail: %s\n[Stripe Dashboard](%s/customers/%s)",
		c.Name, req.UserName, c.Email, stripeDashboard(), c.ID,
	))
	w.WriteHeader(http.StatusOK)
}

func actionCreateInvoice(ctx context.Context, req ActionRequest) ActionResponse {
	customers, err := stripeListCustomers(ctx)
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Stripe Fehler: %v", err)}
	}
	if len(customers) == 0 {
		return ActionResponse{EphemeralText: "Noch keine Kunden vorhanden. Bitte zuerst einen **Kunden anlegen**."}
	}

	c := customers[0]
	inv, err := stripeCreateDraftInvoice(ctx, c.ID, "Dienstleistung (bitte in Stripe anpassen)", 0)
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Entwurf-Rechnung erstellt fuer **%s**.\n\nBearbeiten & Versenden: [Stripe Dashboard](%s/invoices/%s)\n\n_Passe Positionen, Betrag und Empfaenger direkt in Stripe an._",
			c.Name, stripeDashboard(), inv.ID,
		),
	}
}

func actionCreateQuote(ctx context.Context, req ActionRequest) ActionResponse {
	customers, err := stripeListCustomers(ctx)
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Stripe Fehler: %v", err)}
	}
	if len(customers) == 0 {
		return ActionResponse{EphemeralText: "Noch keine Kunden vorhanden. Bitte zuerst einen **Kunden anlegen**."}
	}

	c := customers[0]
	sc := newSC()

	// Create a temporary product with inline data
	product, err := sc.V1Products.Create(ctx, &stripe.ProductCreateParams{
		Name: stripe.String("Dienstleistung (bitte in Stripe anpassen)"),
	})
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler beim Erstellen des Produkts: %v", err)}
	}

	// Create a price for the product
	price, err := sc.V1Prices.Create(ctx, &stripe.PriceCreateParams{
		Product:    stripe.String(product.ID),
		Currency:   stripe.String("eur"),
		UnitAmount: stripe.Int64(0),
	})
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler beim Erstellen des Preises: %v", err)}
	}

	// Create quote with the price
	q, err := sc.V1Quotes.Create(ctx, &stripe.QuoteCreateParams{
		Customer: stripe.String(c.ID),
		LineItems: []*stripe.QuoteCreateLineItemParams{
			{
				Price:    stripe.String(price.ID),
				Quantity: stripe.Int64(1),
			},
		},
	})
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Angebot erstellt fuer **%s**.\n\nBearbeiten: [Stripe Dashboard](%s/quotes/%s)",
			c.Name, stripeDashboard(), q.ID,
		),
	}
}

func actionListClients(ctx context.Context, req ActionRequest) ActionResponse {
	customers, err := stripeListCustomers(ctx)
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Stripe Fehler: %v", err)}
	}
	if len(customers) == 0 {
		return ActionResponse{EphemeralText: "Noch keine Kunden vorhanden."}
	}

	var lines []string
	lines = append(lines, "**Kunden (Stripe):**\n")
	lines = append(lines, "| Name | E-Mail | Dashboard |")
	lines = append(lines, "|------|--------|-----------|")
	for _, c := range customers {
		lines = append(lines, fmt.Sprintf("| %s | %s | [Bearbeiten](%s/customers/%s) |",
			c.Name, c.Email, stripeDashboard(), c.ID))
	}
	return ActionResponse{EphemeralText: strings.Join(lines, "\n")}
}

func actionListInvoices(ctx context.Context, req ActionRequest) ActionResponse {
	sc := newSC()
	params := &stripe.InvoiceListParams{}
	params.Limit = stripe.Int64(5)

	var invoices []*stripe.Invoice
	var iterErr error
	sc.V1Invoices.List(ctx, params).All(ctx)(func(inv *stripe.Invoice, err error) bool {
		if err != nil {
			iterErr = err
			return false
		}
		invoices = append(invoices, inv)
		return len(invoices) < 5
	})
	if iterErr != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Stripe Fehler: %v", iterErr)}
	}

	if len(invoices) == 0 {
		return ActionResponse{EphemeralText: "Noch keine Rechnungen vorhanden."}
	}

	var lines []string
	lines = append(lines, "**Letzte Rechnungen (Stripe):**\n")
	lines = append(lines, "| Nr. | Betrag | Status | Datum | Link |")
	lines = append(lines, "|-----|--------|--------|-------|------|")
	for _, inv := range invoices {
		lines = append(lines, fmt.Sprintf("| %s | %.2f EUR | %s | %s | [Anzeigen](%s/invoices/%s) |",
			inv.Number,
			float64(inv.AmountDue)/100.0,
			stripeStatusLabel(inv.Status),
			fmtUnixDate(inv.Created),
			stripeDashboard(), inv.ID,
		))
	}
	return ActionResponse{EphemeralText: strings.Join(lines, "\n")}
}

// ── Quick Commands ───────────────────────────────────────────────

func handleQuickClient(req SlashRequest) SlashResponse {
	name := strings.TrimPrefix(req.Text, "client ")
	if name == "" {
		return SlashResponse{ResponseType: "ephemeral", Text: "Nutzung: `/billing client <Kundenname>`"}
	}

	sc := newSC()
	c, err := sc.V1Customers.Create(req.Context(), &stripe.CustomerCreateParams{
		Name: stripe.String(name),
	})
	if err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Stripe Fehler: %v", err)}
	}

	return SlashResponse{
		ResponseType: "in_channel",
		Text: fmt.Sprintf(
			"Kunde **%s** angelegt von @%s. [Stripe Dashboard](%s/customers/%s)",
			name, req.UserName, stripeDashboard(), c.ID,
		),
	}
}

func handleQuickInvoice(req SlashRequest) SlashResponse {
	clientName := strings.TrimPrefix(req.Text, "invoice ")
	if clientName == "" {
		return SlashResponse{ResponseType: "ephemeral", Text: "Nutzung: `/billing invoice <Kundenname>`"}
	}

	sc := newSC()
	searchParams := &stripe.CustomerSearchParams{}
	searchParams.Query = fmt.Sprintf(`name:"%s"`, clientName)
	searchParams.Limit = stripe.Int64(1)

	var found *stripe.Customer
	var searchErr error
	sc.V1Customers.Search(req.Context(), searchParams).All(req.Context())(func(c *stripe.Customer, err error) bool {
		if err != nil {
			searchErr = err
			return false
		}
		found = c
		return false
	})
	if searchErr != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Stripe Fehler: %v", searchErr)}
	}

	if found == nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Kein Kunde mit Name `%s` gefunden.", clientName)}
	}

	inv, err := stripeCreateDraftInvoice(req.Context(), found.ID, "Dienstleistung", 0)
	if err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Fehler: %v", err)}
	}

	return SlashResponse{
		ResponseType: "in_channel",
		Text: fmt.Sprintf(
			"Rechnung erstellt fuer **%s** von @%s\n[Stripe Dashboard](%s/invoices/%s)",
			found.Name, req.UserName, stripeDashboard(), inv.ID,
		),
	}
}

// ── Mattermost Helpers ───────────────────────────────────────────

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
