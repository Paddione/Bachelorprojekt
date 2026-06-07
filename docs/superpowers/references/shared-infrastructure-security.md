---
description: Security analysis of shared infrastructure between mentolder and korczewski brands — LLM GPU host, backup encryption, Filen, and SMTP
domain: security
related_tickets: [T000481]
source: docs/audits/2026-06-07-dataflow-dataleak.md (Prio 5+7)
---

# Shared Infrastructure Security — Cross-Brand Analysis

Beide Brands (mentolder.de / korczewski.de) laufen auf demselben **fleet** Kubernetes-Cluster, in getrennten Namespaces (`workspace` / `workspace-korczewski`). Einige Infrastruktur-Komponenten werden jedoch **cluster-übergreifend geteilt**. Dieses Dokument analysiert die Sicherheits-Implikationen der geteilten Ressourcen.

---

## 1. Shared LLM GPU Host

### Architektur

Beide Brands nutzen **dieselbe physische GPU-Box** für KI-Workloads:

| Eigenschaft | Wert |
|---|---|
| **Hardware** | NVIDIA RTX 5070 Ti (16 GB VRAM), Ubuntu 24.04 |
| **WireGuard IP** | `100.102.71.114` (wg-mesh) |
| **Erreichbarkeit** | Nur innerhalb des wg-mesh VPNs — kein öffentlicher Zugriff |
| **Services** | TEI Embed (`:8081`), TEI Rerank (`:8082`), Ollama Chat (`:11434`) |
| **Kubernetes** | Drei `Service`/`Endpoints`-Paare pro Brand → `${LLM_HOST_IP}` |

```
┌─────────────────────────────────────────────────────────┐
│                    wg-mesh (WireGuard)                    │
│                                                          │
│  ┌──────────────────┐         ┌──────────────────────┐  │
│  │ fleet mentolder   │         │ fleet korczewski      │  │
│  │ ns: workspace     │         │ ns: workspace-korczewski│
│  │                   │         │                       │  │
│  │ llm-gateway-embed │         │ llm-gateway-embed     │  │
│  │ llm-gateway-rerank│         │ llm-gateway-rerank    │  │
│  │ llm-gateway-chat  │         │ llm-gateway-chat      │  │
│  └──────┬───────────┘         └──────┬────────────────┘  │
│         │                            │                   │
│         └──────────┬─────────────────┘                   │
│                    ▼                                     │
│         ┌──────────────────────┐                         │
│         │   GPU Host           │                         │
│         │   100.102.71.114     │                         │
│         │                      │                         │
│         │  TEI (bge-m3) :8081  │                         │
│         │  TEI (rerank) :8082  │                         │
│         │  Ollama (chat) :11434│                         │
│         └──────────────────────┘                         │
└─────────────────────────────────────────────────────────┘
```

### Brand-Isolation der Embeddings

**Fazit: Collections sind pro Brand logisch isoliert. Kein Cross-Brand-Leak möglich.**

Die Isolation erfolgt auf **Applikations-Ebene**, nicht auf GPU-Ebene:

1. **Datenbank-Level:** Jede `knowledge.collections`-Zeile hat eine `brand`-Spalte. Queries der Website filtern immer auf die eigene Brand (`WHERE brand = $1`). Die `website`-DB selbst ist pro Brand getrennt (separate PostgreSQL-Instanzen: `shared-db.workspace` vs `shared-db.workspace-korczewski`).

2. **Embedding-Modell-Pinning:** Jede Collection ist fest an **genau ein** Embedding-Modell gebunden (`embedding_model`-Spalte: `bge-m3` oder `voyage-multilingual-2`). Cross-Modell-Queries werden von `MixedEmbeddingModelError` hart abgelehnt — es gibt keinen Fallback zwischen Vektorräumen.

3. **GPU-Host ist stateless:** Die TEI/Ollama-Instanzen auf dem GPU-Host speichern keine Embeddings persistent. Sie empfangen Plaintext, berechnen Vektoren, und geben sie zurück. Es gibt kein Caching, keine Persistenz, keine Query-Logs auf dem GPU-Host.

4. **Kein Cross-Brand-Routing:** Obwohl beide Brands denselben GPU-Host ansteuern, geschieht dies über separate `Service`/`Endpoints`-Objekte in getrennten Namespaces. Eine mentolder-Collection kann nicht versehentlich eine korczewski-Collection abfragen, weil die Website nur ihre eigene Datenbank kennt.

### Restrisiko: Plaintext-HTTP innerhalb wg-mesh

Der Traffic zwischen Cluster und GPU-Host läuft **unverschlüsselt als HTTP** innerhalb des WireGuard-Tunnels. WireGuard selbst bietet Verschlüsselung auf Layer 3 (ChaCha20-Poly1305), aber:

- Ein kompromittierter wg-mesh-Peer (z. B. der Entwickler-Laptop `10.13.14.11`) könnte den Plaintext-Traffic mitschneiden.
- Embedding-Anfragen enthalten den zu vektorisierenden Plaintext — bei Coaching-Dokumenten potenziell PII.
- **Akzeptiertes Risiko:** wg-mesh ist ein geschlossenes VPN mit bekannten Peers. Die Alternative (TLS-Terminierung auf dem GPU-Host) würde Zertifikatsmanagement auf einem nicht-Cluster-Node erfordern.

### GPU-Host-Ausfall

Fällt der GPU-Host aus:
- `bge-m3`-Collections: Embedding-Indexierung und -Queries **fail closed** (503). Kein Fallback auf Voyage — unterschiedliche Vektorräume würden garbage results liefern.
- `voyage-multilingual-2`-Collections: **nicht betroffen** (Voyage-API ist Cloud-basiert, unabhängig vom GPU-Host).
- Chat-class-Anfragen: **fallen zurück auf Anthropic** (pro Call, via llm-router Timeout nach 30s).

Siehe auch: CLAUDE.md § "Local-first LLM pipeline", `docs/superpowers/plans/archive/2026-05-10-local-llm-pipeline.md`.

---

## 2. Backup Encryption Pipeline

### Übersicht

**Fazit: ALLE Backups werden vor dem Upload mit AES-256-CBC verschlüsselt. Filen sieht nur verschlüsselte Daten.**

Es gibt zwei Backup-Ströme, beide folgen demselben Prinzip: **encrypt-then-upload**.

### 2.1 DB-Backup (`db-backup` CronJob, 02:00 UTC täglich)

```
┌──────────┐    pg_dump -Fc     ┌──────────┐    openssl enc     ┌───────────┐    @filen/cli    ┌───────┐
│ shared-db │ ────────────────► │  *.dump   │ ────────────────► │ *.dump.enc │ ──────────────► │ Filen │
│ PostgreSQL│   (plaintext)     │ (raw SQL) │  aes-256-cbc      │(encrypted) │   (encrypted)   │ Cloud │
└──────────┘                   └──────────┘  -salt -pbkdf2     └───────────┘                 └───────┘
                                                    │
                                           BACKUP_PASSPHRASE
                                           (workspace-secrets
                                            → SealedSecret)
```

**Datenbanken im Backup:** `keycloak`, `nextcloud`, `vaultwarden`, `website`, `docuseal`

**PII pro DB:**
| Datenbank | Enthaltene PII |
|---|---|
| `website` | Namen, Emails, Adressen, Telefon, **Coaching-Notizen**, Rechnungen, Zahlungsdaten, CRM |
| `keycloak` | Usernamen, Emails, Vor-/Nachname, bcrypt-Passwort-Hashes, Gruppen-Zugehörigkeit |
| `nextcloud` | Dateinamen, Dateiinhalte, Chat-Nachrichten, Share-Links, E-Mail-Adressen |
| `vaultwarden` | Emails, **client-seitig verschlüsselte** Vault-Inhalte (Passwörter, Notizen, Karten, TOTP) |
| `docuseal` | Namen, Emails, IP-Adressen, PDF-Dokumente mit Unterschriften |

**Verschlüsselung:** `openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_PASSPHRASE`

- `BACKUP_PASSPHRASE` stammt aus `workspace-secrets` (SealedSecret → nur cluster-intern entschlüsselbar)
- **Verschlüsselung geschieht IM Pod, vor dem Upload.** Filen empfängt ausschließlich `.dump.enc`-Dateien.
- Retention: 30 Tage lokal auf `backup-pvc` + dauerhaft in Filen

### 2.2 PVC-Backup (`pvc-backup` CronJob, 03:00 UTC täglich)

```
┌───────────┐    tar czf    ┌──────────────┐    openssl enc     ┌──────────────────┐    @filen/cli    ┌───────┐
│ data-PVCs  │ ───────────► │  *.tar.gz     │ ────────────────► │ *.tar.gz.enc      │ ──────────────► │ Filen │
│ (readOnly) │  (plaintext) │  (raw files)  │  aes-256-cbc      │ (encrypted)        │   (encrypted)   │ Cloud │
└───────────┘              └──────────────┘  -salt -pbkdf2     └──────────────────┘                 └───────┘
```

**PVCs im Backup:** `nextcloud-data-pvc`, `vaultwarden-data-pvc`, `docuseal-data-pvc`

**PII pro PVC:**
| PVC | Enthaltene PII |
|---|---|
| `nextcloud-data-pvc` | Nutzerdateien, hochgeladene Dokumente, Preview-Thumbnails |
| `vaultwarden-data-pvc` | Client-seitig verschlüsselte Attachments, Icons |
| `docuseal-data-pvc` | Hochgeladene PDFs, signierte Dokumente |

**Verschlüsselung:** Identisch zu DB-Backup — `openssl enc -aes-256-cbc -salt -pbkdf2` mit `BACKUP_PASSPHRASE`.

### 2.3 Defense-in-Depth: Filen-eigene Verschlüsselung

Zusätzlich zur AES-256-CBC-Verschlüsselung vor dem Upload bietet Filen **client-seitige Ende-zu-Ende-Verschlüsselung** (Zero-Knowledge-Architektur). Das bedeutet:

1. **Unsere Schicht:** `openssl enc -aes-256-cbc` → Dateien sind bereits verschlüsselt, bevor sie den Pod verlassen
2. **Filens Schicht:** Filen verschlüsselt alle Uploads client-seitig mit dem Account-Master-Key → Filen kann die Inhalte selbst dann nicht lesen, wenn der `BACKUP_PASSPHRASE` schwach wäre

**Doppelte Verschlüsselung ist hier gewollt** — sie schützt auch dann, wenn eine der beiden Schichten kompromittiert wird.

### 2.4 Recovery-Prozess

Der `BACKUP_PASSPHRASE` wird im Disaster-Recovery-Fall benötigt:

1. `scripts/backup-restore.sh filen-pull <timestamp>` — lädt verschlüsselte Backups aus Filen in den leeren `backup-pvc`
2. `scripts/backup-restore.sh restore <db> <timestamp>` — entschlüsselt mit `BACKUP_PASSPHRASE` und stellt wieder her

**Kritische Abhängigkeit:** Ohne `BACKUP_PASSPHRASE` sind alle Backups unwiederbringlich verloren. Der Passphrase ist Teil der `workspace-secrets` und wird als SealedSecret versioniert in `environments/sealed-secrets/<env>.yaml`. Bei einem Komplettverlust des Clusters muss der Passphrase aus dem Git-Repository (git-crypt-encrypted) wiederhergestellt werden.

---

## 3. Shared Infrastructure Risk Assessment

### 3.1 Filen Backup Account

| Eigenschaft | Status |
|---|---|
| **Account** | Ein Filen-Account für beide Brands |
| **Trennung** | Separate Pfade: `BACKUPS/mentolder/` und `BACKUPS/korczewski/` |
| **Zugriff** | Credentials in separaten `workspace-secrets` pro Brand (verschiedene SealedSecrets) |
| **Risiko** | 🟢 **Akzeptabel** — Verschlüsselung vor Upload macht Pfad-Trennung redundant; selbst bei Pfad-Verwechslung sind die Daten AES-256-verschlüsselt |

**Begründung:** Da beide Brands denselben Filen-Account nutzen, könnte ein Fehler in der Upload-Pfad-Logik theoretisch mentolder-Backups in den korczewski-Pfad schreiben (oder umgekehrt). Dies hätte aber **keine Sicherheitsimplikation**, weil:

1. Die Dateien sind AES-256-CBC verschlüsselt — ohne `BACKUP_PASSPHRASE` nicht lesbar
2. Der `BACKUP_PASSPHRASE` ist pro Brand unterschiedlich (separate `workspace-secrets`)
3. Selbst bei gleichem Passphrase würden die `pg_restore`-Befehle gegen die falsche DB fehlschlagen (falsche Credentials)

### 3.2 SMTP (smtp.mailbox.org)

| Eigenschaft | Status |
|---|---|
| **Provider** | mailbox.org (gleicher Anbieter für beide Brands) |
| **Auth** | Separate SMTP-Credentials pro Brand (`SMTP_USER` / `SMTP_PASSWORD`) |
| **Transport** | STARTTLS (`:587`) — TLS-verschlüsselt in transit |
| **Risiko** | 🟢 **Akzeptabel** — Gleicher Provider, aber separate Auth + separate Absender-Domains |

**Begründung:** `smtp.mailbox.org` ist lediglich der Transport-Provider. Beide Brands authentifizieren sich mit separaten Credentials und versenden E-Mails von unterschiedlichen Domains (`@mentolder.de` vs `@korczewski.de`). Die E-Mail-Inhalte sind per STARTTLS geschützt. Ein Provider-seitiger Fehler (falsches Routing) könnte E-Mails der falschen Domain zuordnen, aber:

1. SMTP-Auth trennt die Absender-Identitäten auf Protokollebene
2. E-Mails enthalten die Absender-Domain im `From:`-Header (vom Client gesetzt)
3. DSGVO-Relevanz: Rechnungen/Coaching-Mails sind bereits per STARTTLS verschlüsselt; ein Routing-Fehler würde zu einem Zustellfehler führen, nicht zu einem Leak

### 3.3 WireGuard Mesh (gemeinsames VPN)

| Eigenschaft | Status |
|---|---|
| **Netzwerke** | `wg-fleet` (10.20.0.0/24) für Cluster-intern, `wg-mesh` (192.168.100.0/24 + 10.13.14.0/24) für externe Peers |
| **Peers** | Fleet-Nodes (6) + GPU-Host + Entwickler-Laptop |
| **Verschlüsselung** | ChaCha20-Poly1305 (WireGuard-Standard) |
| **Risiko** | 🟡 **Beobachtet** — GPU-Host-Plaintext-HTTP innerhalb wg-mesh; Entwickler-Laptop als Peer mit Zugriff auf alle Mesh-Subnetze |

**Begründung:** Die WireGuard-Konfiguration erlaubt allen Peers im `wg-mesh` prinzipiell Zugriff auf den GPU-Host und potenziell auf Cluster-Services. Der Entwickler-Laptop ist ein vollwertiger Mesh-Peer. Kompromittierung des Laptops würde einem Angreifer Zugriff auf den GPU-Traffic (Plaintext-Embedding-Anfragen) geben. Dies ist ein **akzeptiertes Risiko** für die aktuelle Betriebsgröße — die Alternative (TLS auf dem GPU-Host) würde erhebliches Zertifikatsmanagement erfordern.

---

## 4. Zusammenfassung

| Komponente | Isolation | Verschlüsselung | Risiko |
|---|---|---|---|
| **LLM GPU Host** | Collections pro Brand (DB-Level) | WireGuard (Layer 3) + Plaintext-HTTP intern | 🟡 Beobachtet |
| **DB-Backups** | Separate `workspace-secrets` pro Brand | AES-256-CBC vor Upload + Filen E2E | 🟢 Akzeptabel |
| **PVC-Backups** | Separate `workspace-secrets` pro Brand | AES-256-CBC vor Upload + Filen E2E | 🟢 Akzeptabel |
| **Filen Account** | Separate Pfade pro Brand | Doppelt (AES + Filen Zero-Knowledge) | 🟢 Akzeptabel |
| **SMTP** | Separate Auth pro Brand | STARTTLS | 🟢 Akzeptabel |
| **WireGuard Mesh** | Shared (alle Peers) | ChaCha20-Poly1305 | 🟡 Beobachtet |

**Keine Datenlecks.** Alle geteilten Ressourcen haben entweder logische Isolation auf Applikations-Ebene (LLM-Collections, Filen-Pfade, SMTP-Auth) oder kryptografische Isolation (Backup-Passphrase pro Brand, AES-256-CBC). Es gibt keinen Pfad, über den PII einer Brand unverschlüsselt in den Besitz der anderen Brand gelangen könnte.
