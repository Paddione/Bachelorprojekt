# Proxmox Bare-Metal / LAN Node Provisioning — Detail

Aus `cluster-deployment` Step 1.0b extrahiert (Chore T001007). Proxmox Automated Installation
mit embedded `answer.toml` — nur für Bare-Metal oder LAN-Setups, nicht für Hetzner Cloud.

## Provisioning-Workflow

1. **answer.toml scaffolden** mit folgender Struktur:
   ```toml
   [global]
   keyboard = "de"
   country = "de"
   timezone = "Europe/Berlin"
   root-password = "CHANGEME"
   root-ssh-keys = ["ssh-ed25519 AAAA... your-key-here"]

   [disk-setup]
   filesystem = "ext4"
   disk-list = ["nvme0n1"]

   [network]
   source = "from-answer"
   cidr = "192.168.100.100/24"
   gateway = "192.168.100.1"
   dns = "192.168.100.1"

   [network.filter]
   interface-name = "en*"
   ```
2. **Customize**: Root-Passwort, SSH-Keys (`root-ssh-keys` als TOML-Array mit gequoteten Strings), Target-Disk (für ext4/xfs nur 1 Disk — bei Multi-Disk-OS ZFS konfigurieren), Network (`source = "from-answer"` mit cidr/gateway/dns). **Matcher unter `[network.filter]` ist Pflicht** — ohne ihn failt der Installer mit `No filter defined`. `interface-name = "en*"` matched moderne Ethernet-Interfaces.
3. **Custom ISO bauen**:
   ```bash
   sudo apt install -y proxmox-auto-install-assistant xorriso curl
   curl -LO https://enterprise.proxmox.com/iso/proxmox-ve_9.2-1.iso
   proxmox-auto-install-assistant validate answer.toml
   proxmox-auto-install-assistant prepare-proxmox-iso proxmox-ve_9.2-1.iso --answer-file answer.toml
   ```
4. **USB Drive flashen** (Rufus Windows oder `dd` Linux). **Bei Rufus: „DD Image"-Mode wählen, nicht „ISO"-Mode.** Vom USB-Stick booten → unattended Install.

## Outgoing Mail Rewrite (Postfix canonical maps)

Proxmox sendet Notifications als `root@<hostname>` (z.B. `root@dev3.local`) — externe
Provider (mailbox.org) bouncen das. Rewrite-Rule auf **allen Proxmox-Nodes** anwenden:

```bash
# 1. Sender canonical mapping
cat > /etc/postfix/sender_canonical <<'EOF'
root    root@korczewski.de
EOF

# 2. Mapping-DB generieren
postmap /etc/postfix/sender_canonical

# 3. Postfix konfigurieren
postconf -e 'sender_canonical_maps = hash:/etc/postfix/sender_canonical'
postconf -e 'sender_canonical_classes = envelope_sender, header_sender'

# 4. Reload
postfix reload
```

Verify per Test-Mail:
```bash
echo "Test mail from $(hostname)" | mail -s "PVE Mail Test" korczewski@mailbox.org
tail -n 20 /var/log/mail.log
```
