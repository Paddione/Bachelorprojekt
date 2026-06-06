---
title: "Bereitstellungsdetails und Server-Topologie"
domain: infra
---

# Bereitstellungsdetails und Server-Topologie

Diese Dokumentation beschreibt die vollständigen Bereitstellungsdetails (Deployment-Details), IP-Adressen, Benutzernamen, SSH-Schlüssel (Public Keys) und die Architektur aller Services (Dienste) im Platform-Hub der Workspace-Plattform.

---

## 1. Netzwerk- und Server-Topologie (Fleet Cluster)

Die gesamte Produktion der Plattform wurde am 31.05.2026 konsolidiert. Alle Dienste der beiden Marken **Mentolder** (Domain: `mentolder.de`) und **Korczewski** (Domain: `korczewski.de`) laufen auf einem einzigen, gemeinsamen Kubernetes-Cluster namens **`fleet`**.

### 1.1 Produktions-Server (Hetzner Helsinki)

Der Cluster besteht aus drei Control-Plane-Knoten (Steuerungsknoten) und drei Worker-Knoten (Arbeitsknoten).

| Hostname | Rolle | Öffentliche IP-Adresse | WireGuard IP (`wg-fleet`) | WireGuard Public Key |
|---|---|---|---|---|
| **pk-hetzner-4** | Control-Plane | `204.168.244.104` | `10.20.0.1` | `e10sA4GsXWQbbcPAx6J98sbKQbiO8VEm+5ywHgKT2Vg=` |
| **pk-hetzner-6** | Control-Plane | `37.27.251.38` | `10.20.0.2` | `Fmx/zbyADzKElBEnEL/drun0VM6mt7NNBn4m2FeUklo=` |
| **pk-hetzner-8** | Control-Plane | `62.238.23.79` | `10.20.0.3` | `buA4HrVLhaOQTRUf5azhubgWPqJeGLnMJXbf/nqlmB8=` |
| **gekko-hetzner-2** | Worker | `178.104.169.206` | `10.20.0.4` | `VBzLQBlMZZvygs9/90hNfOEmscCjbbKN+/Zv7Q0gsD8=` |
| **gekko-hetzner-3** | Worker | `46.225.125.59` | `10.20.0.5` | `shjarf/+wXfxl4JlhTRtVvyDt8mzGodr8kj392WHa1I=` |
| **gekko-hetzner-4** | Worker | `178.104.159.79` | `10.20.0.6` | `H8R7yyZ6W8lS2rlKUNF0bP0oYNtxnn1bjoy3SwmRvCY=` |

*Hinweis:* Der API-Server des Clusters ist direkt über die IP des Knotens `pk-hetzner-4` unter Port `6443` erreichbar (`204.168.244.104:6443`). Die alten, separaten Standalone-Cluster-Kontexte sind stillgelegt.

---

### 1.2 Entwicklungs- und Testumgebung (Local Dev / k3d auf WSL-Host)

> **Hinweis:** Das geplante `devc`-3-Knoten-k3s-HA-Cluster wurde nie gebaut (shelved 2026-05-30). Die lokale Entwicklung findet auf einem k3d-Cluster (lokales Test-Kubernetes in Docker) auf dem WSL-Host / Proxmox-VM `dev-vm` statt. Kontext: `k3d-mentolder-dev`.

| Servername | Rolle | LAN-IP-Adresse | WireGuard IP (`wg-mesh`) | WireGuard Public Key |
|---|---|---|---|---|
| **dev-vm** | Dev Cluster Host (k3d/WSL) | `10.0.0.26` | `192.168.100.23` | `TQu+0XGGDRuuQyMUQUQWZMp7tyIQ0c4RTe9+FcMaWg4=` |
| **devc-2** | devc-Knoten 2 *(nie gebaut — shelved)* | `10.0.0.22` | `192.168.100.21` | `0jmnyI0rYR05HDzqfrvtNBCSZdQpv1XkTPhciJ9ZCxU=` |
| **devc-3** | devc-Knoten 3 *(nie gebaut — shelved)* | `10.0.0.23` | `192.168.100.22` | `TZhEWsDku+wccV0wAIHa9V8bK5Ru+tAUkc0uPk4C+00=` |
| **pk-l-1-worker** | Entwickler-Laptop | *Dynamisch* | `10.13.14.11` | `cLpIaLBkygvcX1D4Jm7syjoxqrRx3qhgTl7+aah1Nxw=` |

*Hinweis:* `dev-vm` ist der Nachfolger des alten `k3s-1` Heimservers. Sie läuft als Proxmox-Gast-VM (VMID `9002`) auf dem Server-Knoten `10.0.0.25`.

---

### 1.3 GPU-Host (KI-Bereitstellung für Transkription & Embeddings)

Für rechenintensive KI-Aufgaben wie Spracherkennung (Whisper) und Vektorisierung von Texten (Embeddings) ist eine lokale Workstation mit einer NVIDIA RTX 5070 Ti Grafikkarte (16 GB VRAM) über das WireGuard-VPN angebunden.

* **Lokale IP im Windows-Subsystem (WSL2):** `10.10.0.3` (befindet sich hinter einer FritzBox-NAT)
* **WireGuard IPs:** `192.168.100.10` (Mentolder-Netz) / `10.13.14.10` (Korczewski-Netz)
* **Öffentliche WireGuard-Schlüssel (Public Keys):**
  * Mentolder: `5FN+c5UwO4VDwkwaCkG7uoBGDriItwUKolQVVjhQ3U4=`
  * Korczewski: `BHYLRcy85XSxC2V7pXXmzY4KtfttPHLgWitAM6PdYnY=`
* **Netzwerkintegration:** Der GPU-Host leitet Anfragen über `iptables` (Linux-Firewall) an den lokalen Ollama-Dienst weiter. Die Kubernetes-Services (z. B. `llm-gateway-embed:8081` und `llm-gateway-chat:11434`) greifen über die WireGuard-IP auf diesen Rechner zu.

---

### 1.4 VPN-Netzwerke (WireGuard Mesh & Fleet)

Drei verschlüsselte VPN-Netze (Virtual Private Network) verbinden die Server sicher untereinander:

1. **`wg-fleet` (Bereich `10.20.0.0/24`):** Verbindet die sechs Hetzner-Server des Produktions-Clusters über den Port `51820`. Alle Anwendungs-Daten fließen verschlüsselt durch dieses Netz.
2. **`wg-mesh` (Bereich `192.168.100.0/24`):** Legacy-Mesh der Marke Mentolder (Port `51821`), über das der GPU-Host angebunden ist.
3. **`wg-mesh` (Bereich `10.13.14.0/24`):** Legacy-Mesh der Marke Korczewski (Port `51820`), über das das Laptop des Entwicklers angebunden ist.

---

## 2. Benutzerkonten und Zugangsdaten (Usernames)

Beim Betrieb des Repositories und der Server werden folgende administrative Konten verwendet:

### 2.1 SSH-Systembenutzer
* **`root`**: Administrativer Hauptnutzer auf allen Hetzner-Servern (`pk-*` und `gekko-*`) sowie den Proxmox-Hosts (`pve`, `pve2`, `pve3`).
* **`devops`**: War Standard-SSH-Benutzer auf den VM-Knoten (`devc-2`, `devc-3`) — diese wurden nie gebaut (shelved 2026-05-30).
* **`gekko`**: Standard-Benutzer auf dem alten `k3s-1` Heimserver sowie auf der neuen `dev-vm` (`DEV_SSH_USER`).

### 2.2 Keycloak SSO / OIDC-Benutzer (Vordefinierte Konten)
* **`paddione`** (`patrick@korczewski.de`): Haupt-Administrator-Konto, berechtigt für alle Bereiche.
* **`gekko`** (`quamain@web.de`): Test- und Entwicklerkonto.

---

## 3. SSH-Schlüssel (Public Keys)

Die folgenden öffentlichen SSH-Schlüssel sind in den Konfigurationsdateien des Repositories hinterlegt und erlauben den Zugriff auf die Server-Ressourcen:

### PVE Host-Schlüssel (Proxmox-Virtualisierung)
* **`PVE_SSH_PUBLIC_KEY` (root@pve):**
  `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCcVmcn2U3Ds/yWSC46oxiZjNMjQfqUDFTzFau8Glv0FSEgy9WipbHuKoms+/NU3ELdTMtvWdhHq02cdoS1nlDvBNHWkCz4XS2/L+D7XmDIbhWgdjTu77BA5itQf1s7rhQhy5aN9Bo/itDJOX3U8YN+4EHiUQS6p40y9ATcSf/FzhaZ8/5UrsNAdpvqEMlHT1E6+8UHmlq76IojhWCIPTqSbmOcKfWtrSreqUwpz6nrC1G2MF4KZ+bLqOh4vv8a4knUCrsE9xrKpl//jEmCNgWDBBpx1+4q/kKbBUCNTH73iJBKXV26HiG4kDS66idbJ5ePfHetl/c6h0k60yGnN7gvt53qLdo1fIKdLO7azmGbKQG+TQcTH6mwvl1irhQb0GbbtgwALGblR3r8M2wLsjFXhKoYPM45DTqQ37D0E/yNWklwStMbzkpwocn2V5Z5w6dtzLJ5wmm/FnnP0ugyvFfrSGdMGKZm/x6NdbVugY4yrRJ+5uU0kAg18O4NaG/calJX6g8yODqhb0kyoFuYBnkiUCx5E1q2KeOrKcXBIC4T2dB3vQXB4sYzD0cYItMJk7g53OXEDtMVmiSmPHkqJNT8ZLxv3EtL2HElqEkOKcnWlclU154GEqIElhVXiIhIVs9YSeGs6pVR8ltbEAQfQIakZ+79hNwy0TakGCzTgl4fMQ== root@pve`
* **`PVE2_SSH_PUBLIC_KEY` (root@dev1 ehem. pve2):**
  `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDIRsuXjU49374Ztn0YyQI8yxHH0czAFGS5cGL3EEGtEMVKSzTvWefWEh4EFKCsLfOEJAKcW4zDrOGljub45/eCW8GIY1VIUKzkOhj1JlYPSKpNGPIDWZ643k2NRfCRRAXGRx1oV9u+Ulb1xjC+TggIlgdSzV/3+V8liwVNU4tmUSX0aNKE8rNzKPxVLuxLCe3twm8RsPWfR4rUBiDf51s9ITu6jbwziai6Fxp0uv/ScnXieJ7Iqut99VqQBJxpEQYSfQ5Zqf1jtXuAc3q5kSdVDg8q+5DXBIFSCk8Gofdgxs26M4AsSDxr01gGQ7QdgVpP2unJvKTASI/aQg+xAd8kXze1puzcvJqfNUexcfpvJ5uiGrgpp042nNHXuUS2+xH9Gfd1QCw2vZM84h0qL9itumnU1rcU3zodAWPf4hRYaz3/oIGF5p2zFhXwu/6V6vOgNSzVkJM3PLs7N2DMOUqgkFClLR9hA4H4Fm/xxCNV50kjwLuEuAq3cN7/Y6PdePbNEnlDfbBWtHC+ow9ygXR52AIGXnDUhI6wM10pgxylR4A+aTOeuGgwgVjoC0DmYokEIidAYzIyUapajO2Brxci10V3Ykp/FgKY2m47S+9kMqmp+XGELCIgs4VjWkM7sVbiJSJLr0wIlKZ2mlNIbV5PPSTYP4Yd9o3Vy3rKV4SZ2Q== root@pve2`
* **`PVE3_SSH_PUBLIC_KEY` (root@dev2 ehem. pve3):**
  `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDAJAf6e0K/SdlaKCxPVyP8rCZqOVz3M8NZUL4W8jSMzL3JqlcjNeSeUfoO9nfbHyI3QfDQPmvkpHY9JBa+e2A5Plj1MIC4DDvvgcY1eJL4j5gJ+2fQXyG6c1l2r5yEPs5wWn8vGuR8540d1Y93VDq90Zg+lJ6ON0vosuQ9jUyuGo7DIwwBN8vhBYiSN6XdeDlIJG2HVSJftbCREXC5u9fDH4J1Y0sNEkeua9vNZsC3BAAviylwBMFUYaB2TVKLyFOI5xGiZxKHio1H49S5b2gHHaOWor+I4byIBNibCS8LCeB/q8a99MnCHqMQT/jilwuq1RWorIrjVF0PX011s0Ddw+dA5iq0R2UH+htDkjJXdcXUYQEuBUMX/mBDkyiqSshCDDZfGvjm47YZTzt4bGYEKhBI/pPygi4MhSRN+TvWpngFWjxcSy4LEowTNePJx6CB17DwnVhBnQdHygCIZ8iHgvsgbVZgV0gO1He8zteZFPV7OjPANm4xSOim5vTSzpWwVvLhk9wv2sOURz4JY7mbtIPryFqNSbWI0B/4zMFH87YFQ7IfD7r5JhoqZRIaplJDRJWFrnLXXWjWS07vNWAcDS9AMNM9spPce65f8HlvaTjAcznVmzxW75ig5znFFAfi+SyVwWRhQ7fhuRZMnbOzqVwl1VINz7FGyJKOUoIvMw== root@pve3`

### Personenbezogene SSH-Schlüssel
* **`PATRICK_SSH_PUBLIC_KEY` (patrick@korczewski.de):**
  `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFN75CnuOz7YXaJipTFxWMVDgm35heu64JKN1QL+Z84+ patrick@korczewski.de`
* **`GEKKO_SSH_PUBLIC_KEY` (gekko@mentolder-20260513):**
  `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG/fPSlV0 gekko@mentolder-20260513`

*Sicherheitshinweis:* Die zugehörigen privaten Schlüssel (Private Keys) liegen verschlüsselt im Git-Repository in den jeweiligen `.secrets/<env>.yaml`-Dateien und sind mittels SealedSecrets geschützt.

---

## 4. Detaillierte Erklärung aller Software-Dienste im Platform-Hub

Jeder hier beschriebene Service läuft als K8s-Workload (Kubernetes Deployment) im Namespace `workspace` (für die Marke Mentolder) oder `workspace-korczewski` (für die Marke Korczewski), sofern nicht anders angegeben.

### 4.1 Website (`website`)
* **Beschreibung:** Die Benutzeroberfläche (Astro + Svelte), die die öffentliche Homepage sowie das geschützte Kundenportal darstellt. Sie liest direkt aus der Shared-Database und kommuniziert mit Keycloak für die Benutzeranmeldung.
* **K8s-Deployment-Name:** `website`
* **K8s-Namespace:** `website`
* **Image:** `website:latest` (wird bei jedem CI-Durchlauf neu gebaut)
* **Produktions-URLs:** `web.mentolder.de`, `web.korczewski.de`

### 4.2 Keycloak (`keycloak`)
* **Beschreibung:** Der zentrale SSO-Dienst (Single Sign-On). Er regelt die Authentifizierung über OIDC (OpenID Connect). Alle anderen Dienste (Nextcloud, Vaultwarden, DocuSeal, Systembrett) leiten Benutzer zur Anmeldung an Keycloak weiter.
* **K8s-Deployment-Name:** `keycloak`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Datenbank:** PostgreSQL (Schema `keycloak`)
* **Image-Tag:** `:22.0` (ausgeliefert via Bitnami Keycloak-Chart)
* **Produktions-URLs:** `auth.mentolder.de`, `auth.korczewski.de`

### 4.3 Nextcloud (`nextcloud`)
* **Beschreibung:** Das Kernstück für Kollaboration. Stellt Datei-Speicher, Kalender, Kontakte und Office-Integration bereit. Beinhaltet auch die Erweiterung "Nextcloud Talk" für Audio/Video-Konferenzen.
* **K8s-Deployment-Name:** `nextcloud`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Datenbank:** PostgreSQL (Schema `nextcloud`)
* **Image-Tag:** `:29` (Nextcloud-Basis)
* **Produktions-URLs:** `files.mentolder.de`, `files.korczewski.de`

### 4.4 Collabora (`collabora`)
* **Beschreibung:** Ein Online-Office-Server. Er wird über das WOPI-Protokoll in Nextcloud eingebunden und erlaubt das kollaborative Editieren von Word-, Excel- und PowerPoint-Dateien direkt im Browser.
* **K8s-Deployment-Name:** `collabora`
* **K8s-Namespace:** `workspace-office` / `workspace-office-korczewski`
* **Image-Tag:** `:latest` (Collabora Online Development Edition)
* **Produktions-URLs:** `office.mentolder.de`, `office.korczewski.de`

### 4.5 Vaultwarden (`vaultwarden`)
* **Beschreibung:** Ein leichtgewichtiger, Bitwarden-kompatibler Passwort-Tresor. Ermöglicht Teams das sichere Verwalten und Teilen von Anmeldedaten und Passwörtern.
* **K8s-Deployment-Name:** `vaultwarden`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Datenbank:** PostgreSQL (Schema `vaultwarden`)
* **Image-Tag:** `:latest`
* **Produktions-URLs:** `vault.mentolder.de`, `vault.korczewski.de`

### 4.6 Talk HPB (`nextcloud-talk-hpb`)
* **Beschreibung:** Das High-Performance-Backend für Nextcloud Talk. Es beinhaltet den Janus WebRTC Gateway (Video-Streaming-Server), NATS (Messaging-System) und den Signaling-Server. Ermöglicht stabile Gruppen-Anrufe.
* **K8s-Deployment-Name:** `talk-hpb`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Image-Tag:** `:latest`
* **Produktions-URLs:** Internal routing via Traefik.

### 4.7 Brett (`brett`)
* **Beschreibung:** Ein interaktives, kollaboratives 3D-Systembrett (Systemic Constellation Board) zur Simulation von Aufstellungen im Browser.
* **K8s-Deployment-Name:** `brett`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Datenbank:** PostgreSQL (Schema `brett`)
* **Image-Tag:** `:latest`
* **Produktions-URLs:** `brett.mentolder.de`, `brett.korczewski.de`

### 4.8 Mailpit (`mailpit`)
* **Beschreibung:** Ein SMTP-Test-Mailserver. Er fängt alle ausgehenden E-Mails der Plattform in der Entwicklungsumgebung ab und stellt eine Weboberfläche bereit, um diese zu inspizieren. Echte E-Mails werden nicht versendet.
* **K8s-Deployment-Name:** `mailpit`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Image-Tag:** `:latest`
* **Produktions-URLs:** `mail.mentolder.de`, `mail.korczewski.de` (SSO-geschützt)

### 4.9 DocuSeal (`docuseal`)
* **Beschreibung:** Ein eigenständiger Dienst zum digitalen Signieren und Verwalten von Dokumenten (PDF-Verträge) mit fortgeschrittener elektronischer Signatur.
* **K8s-Deployment-Name:** `docuseal`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Datenbank:** PostgreSQL (Schema `docuseal`)
* **Image-Tag:** `:latest`
* **Produktions-URLs:** `sign.mentolder.de`, `sign.korczewski.de`

### 4.10 Whiteboard (`whiteboard`)
* **Beschreibung:** Eine kollaborative Zeichen-Tafel (basierend auf Spacedeck), die direkt als Nextcloud-App in die Cloud-Umgebung integriert ist.
* **K8s-Deployment-Name:** `whiteboard`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Image-Tag:** `:latest`
* **Produktions-URLs:** Erreichbar innerhalb der Nextcloud-Oberfläche.

### 4.11 Arena (`arena`)
* **Beschreibung:** Der Multiplayer-Spielserver (WebSocket-Backend), der exklusiv für das 3D-Spiel der Marke Korczewski genutzt wird.
* **K8s-Deployment-Name:** `arena-server`
* **K8s-Namespace:** `workspace-korczewski` (nur für die Marke Korczewski aktiv)
* **Image-Tag:** `:latest`
* **Produktions-URLs:** `arena-ws.korczewski.de`

### 4.12 Documentation (`docs`)
* **Beschreibung:** Eine statische Dokumentations-Webseite (Docsify), die das Admin- und Benutzerhandbuch bereitstellt.
* **K8s-Deployment-Name:** `docs`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Image-Tag:** `:latest` (wird via `task docs:deploy` neu gebaut)
* **Produktions-URLs:** `docs.mentolder.de`, `docs.korczewski.de`

### 4.13 PostgreSQL 16 (`postgresql`)
* **Beschreibung:** Der zentrale relationale Datenbank-Server der Plattform. Pro Marke läuft eine eigene PostgreSQL-Instanz im jeweiligen Namespace. Der Zugriff erfolgt über interne Kubernetes-DNS-Namen (`shared-db`).
* **K8s-Deployment-Name:** `shared-db`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Image-Tag:** `:16` (PostgreSQL 16)
* **Speicherklasse:** Longhorn (verteilter, redundanter Speicher)

### 4.14 Traefik (`traefik`)
* **Beschreibung:** Der Kubernetes-Ingress-Controller. Er empfängt alle externen HTTP/HTTPS-Anfragen der Plattform, leitet sie an die zuständigen Services weiter und übernimmt die Verschlüsselung (TLS-Terminierung).
* **K8s-DaemonSet:** Läuft im Namespace `kube-system` als Systemkomponente.
* **Image-Tag:** `:latest`

### 4.15 Sealed Secrets (`sealed-secrets`)
* **Beschreibung:** Der Bitnami Sealed Secrets Controller. Er ermöglicht das sichere Speichern von Passwörtern und API-Schlüsseln im öffentlichen Git-Repository, indem er sie asymmetrisch verschlüsselt. Nur der Controller im Cluster kann sie wieder entschlüsseln.
* **K8s-Deployment:** Läuft im Namespace `sealed-secrets`.
* **Image-Tag:** `:latest`

### 4.16 cert-manager (`cert-manager`)
* **Beschreibung:** Automatisiert das Ausstellen und Erneuern von SSL/TLS-Zertifikaten über Let's Encrypt mittels der DNS-01-Challenge (über den DNS-Anbieter ipv64.de).
* **K8s-Deployment:** Läuft im Namespace `cert-manager` (3 separate Pods).

### 4.17 k3s / k3d (`k3s`)
* **Beschreibung:** Die zugrundeliegende leichtgewichtige Kubernetes-Distribution. `k3s` läuft in der Produktion auf den Hetzner-Servern; `k3d` simuliert ein k3s-Cluster lokal in Docker für Entwicklungszwecke.

### 4.18 WireGuard (`wireguard`)
* **Beschreibung:** Das verschlüsselte Peer-to-Peer-VPN-Netzwerk (Virtual Private Network). Ermöglicht die sichere Kommunikation zwischen den Cloud-Knoten und externen Hosts (wie dem GPU-Rechner).

### 4.19 TEI (`tei`)
* **Beschreibung:** Text Embeddings Inference (Text-Vektorisierung). Dienst zur Generierung von Text-Embeddings (Modell: `bge-m3`) für die semantische Suche. Läuft auf dem GPU-Host und wird als ClusterIP-Service `llm-gateway-embed` in Kubernetes bereitgestellt (nur Mentolder).

### 4.20 OpenClaw (`openclaw`)
* **Beschreibung:** Ein lokaler KI-Assistent-Dienst (Daemon), der direkt auf dem Windows/WSL2-GPU-Host läuft und mit Ollama kommuniziert. Er wird über das `openclaw`-CLI verwaltet.

### 4.21 LiveKit Server (`livekit`)
* **Beschreibung:** Echtzeit-Audio- und Video-Server (WebRTC) für interaktive Video-Streams. Läuft im Host-Netzwerk (`hostNetwork: true`) und ist aus Performance-Gründen fest an den Knoten `pk-hetzner-4` (bzw. im Dev-Fall `gekko-hetzner-3`) gebunden.
* **K8s-Deployment-Name:** `livekit-server`
* **K8s-Namespace:** `workspace`
* **Produktions-URLs:** `livekit.mentolder.de`, `livekit.korczewski.de`

### 4.22 LiveKit Ingress (`livekit-ingress`)
* **Beschreibung:** Video-Eingangsschnittstelle. Empfängt externe Video-Feeds (z. B. RTMP-Stream aus OBS) und leitet sie in einen LiveKit-Raum weiter.
* **K8s-Deployment-Name:** `livekit-ingress`
* **K8s-Namespace:** `workspace`

### 4.23 LiveKit Egress (`livekit-egress`)
* **Beschreibung:** Video-Ausgangsschnittstelle. Zeichnet LiveKit-Sitzungen auf und speichert sie als Videodatei im Backup-Speicher ab.
* **K8s-Deployment-Name:** `livekit-egress`
* **K8s-Namespace:** `workspace`

### 4.24 Whisper (`whisper`)
* **Beschreibung:** Ein Spracherkennungsmodell (OpenAI Whisper), welches auf dem GPU-Host ausgeführt wird. Es wandelt gesprochene Sprache aus Audioaufnahmen in Text um.
* **K8s-Deployment-Name:** `whisper`
* **K8s-Namespace:** `workspace`

### 4.25 Talk Transcriber (`talk-transcriber`)
* **Beschreibung:** Ein Nextcloud Talk Bot, der an laufenden Video-Gesprächen teilnimmt, die Audiospur an den Whisper-Dienst sendet und ein Live-Transkript (Gesprächs-Mitschrift) im Chat ablegt.
* **K8s-Deployment-Name:** `talk-transcriber`
* **K8s-Namespace:** `workspace`

### 4.26 MCP Monolith (`mcp`)
* **Beschreibung:** Model Context Protocol Proxy (Claude Code MCP-Server). Ermöglicht dem KI-Coding-Assistenten Claude Code den sicheren, kontrollierten Zugriff auf Cluster-Ressourcen und -Werkzeuge.
* **K8s-Deployment-Name:** `claude-code-mcp-auth` / `claude-code-mcp-ops`
* **K8s-Namespace:** `workspace` (nur Mentolder)

### 4.27 Brainstorm Sish (`brainstorm`)
* **Beschreibung:** Ein SSH-Tunnel-Server (sish), der es Entwicklern erlaubt, lokale Entwicklungs-Webseiten oder Whiteboards über einen sicheren SSH-Reverse-Tunnel im Internet erreichbar zu machen.
* **K8s-Deployment-Name:** `brainstorm-sish`
* **K8s-Namespace:** `workspace`
* **Produktions-URLs:** `brainstorm.mentolder.de`

### 4.28 Arena Server (`arena-server`)
* **Beschreibung:** Der exklusive 3D-Mehrspieler-WebSocket-Spielserver für die Marke Korczewski, der Logins über Keycloak-JSON-Web-Tokens (JWT) beider Marken validiert.
* **K8s-Deployment-Name:** `arena-server`
* **K8s-Namespace:** `workspace-korczewski`
* **Image-Tag:** `:latest`

---

## 5. Dokumentations-Abdeckung des Repositories

Damit kein Teil des Projekts und des Repositories unbeleuchtet bleibt, ordnet die folgende Tabelle jedem Ordner und jeder Datei im Repository das zuständige Hilfe-Dokument zu:

| Ordner / Datei im Repo | Funktion / Zweck | Zuständiges Dokument in der Hilfe |
|---|---|---|
| **`website/`** | Astro- & Svelte-Frontend (Kundenportal, Homepage, Chat-Komponente) | [Website-Doku](website.html), [Benutzerhandbuch](benutzerhandbuch.html) |
| **`k3d/`** | Kubernetes-Manifeste und Kustomize-Dateien für die Dev-Umgebung | [Operations-Handbuch](operations.html), [Dev-Stack Runbook](dev-stack/README.md) |
| **`environments/`** | Variablen, Zertifikate und SealedSecrets pro Umgebung | [Umgebungs-Doku (Environments)](environments.html), [[secret-rotation]] |
| **`docs/`** | System-Dokumentation, Admin-Handbücher, Architekturberichte | Diese Doku-Seiten selbst |
| **`docs/agent-guide/`** | Zielgerichtete Hilfen für KI-Coding-Agenten (Taxonomie, Goals, Tools) | [[00-anleitung]] |
| **`scripts/`** | Hilfs- und Setup-Skripte für Datenbank-Migrationen, Keycloak und Backups | [Skripte-Übersicht](scripts.html), [Operations-Handbuch](operations.html) |
| **`tests/`** | Playwright E2E-Tests und BATS-Unit-Tests für die Verifikation | [Test-Dokumentation](tests.html) |
| **`wireguard/`** | WireGuard-Konfigurationsvorlagen und Mesh-Knoten-Definitionen | [Netzwerk-Handbuch (WireGuard)](bereitstellungsdetails.md) (dieses Dokument) |
| **`pentest-dashboard/`**| Lokales Flask-Dashboard zur Durchführung autorisierter Sicherheits-Scans | [Sicherheits-Handbuch](security.html) |
| **`art-library/`** | Brand-spezifische Bild-Assets für das 3D-Systembrett | [Systembrett-Doku](systembrett.html) |
| **`brett/`** | Node.js Service für das kollaborative 3D-Aufstellungsboard | [Systembrett-Doku](systembrett.html) |
| **`arena-server/`** | Multiplayer-WebSocket-Spielserver für die Marke Korczewski | [Arena-Dokumentation](arena.html) |
| **`claude-code/`** | MCP Monolith Konfigurationen für den Claude Code Agenten | [Claude-Code Integration](claude-code.html) |
| **`prod-fleet/`** | Kustomize-Overlays für das konsolidierte Fleet-Cluster | [[fleet-stage2-cutover-runbook]] |
| **`prod-mentolder/`** | Legacy standalone-Overlay für die Marke Mentolder | [[fleet-2026-05-31-what-changed]] |
| **`prod-korczewski/`**| Legacy standalone-Overlay für die Marke Korczewski | [[fleet-2026-05-31-what-changed]] |
| **`Taskfile.yml`** | Zentrales Build- & Task-Automatisierungstool | [Operations-Handbuch](operations.html), [[00-anleitung]] |
| **`CLAUDE.md`** | Generelle Regeln und Schnellstart-Referenz für Claude Code | [CLAUDE.md](file:///home/patrick/Bachelorprojekt/CLAUDE.md) |
| **`GEMINI.md`** | Spezifischer Leitfaden für die Gemini CLI Integration | [GEMINI.md](file:///home/patrick/Bachelorprojekt/GEMINI.md) |
| **`CONTRIBUTING.md`** | Entwicklungs-Richtlinien und PR-Workflow | [Contributing-Handbuch](contributing.html) |
