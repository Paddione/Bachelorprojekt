# Proposal: flux-bootstrap-secrets-ssot-T002254

## Why

Die beiden Flux-Bootstrap-SealedSecrets — `flux-system/ghcr-auth` und
`flux-system/flux-webhook-token` — wurden in T002251 **von Hand gesealt**. Ihr
Ciphertext liegt committed unter `flux/clusters/fleet/bootstrap/*-sealedsecret.yaml`,
ihr **Plaintext existiert aber nirgends im Repo**: er lebt ausschließlich als
laufendes Secret im `fleet`-Cluster. Das Regenerierungs-Runbook im Dateikopf
bestätigt das — es liest den Wert mit `kubectl get secret … -o yaml` aus dem Cluster
zurück und pipet ihn nach `kubeseal`.

Daraus folgen drei konkrete Probleme:

1. **Cert-Rotation ist Handarbeit.** Nach einer Sealing-Key-Rotation sind beide
   Ciphertexte wertlos und müssen einzeln per Runbook neu erzeugt werden — während
   `task env:seal ENV=<env>` alle anderen Secrets der Umgebung in einem Schritt neu
   sealt.
2. **Bootstrap-Henne-Ei bei Cluster-Neuaufbau.** Ist der Cluster weg, ist auch die
   einzige Quelle des Plaintexts weg. Genau der Fall, in dem `task flux:bootstrap`
   gebraucht würde, ist der Fall, in dem seine Eingaben nicht mehr rekonstruierbar
   sind.
3. **Kein Schema-Gate.** `environments/schema.yaml` kennt beide Werte nicht, also
   prüft `task env:validate` sie nicht. Ein fehlender oder leerer
   `flux-webhook-token` fällt erst auf, wenn der Receiver-Webhook stumm bleibt.

Der Token selbst ist teilweise schon im SSOT: `GHCR_PAT` steht seit längerem in
`environments/schema.yaml` (`required: false`, `generate: false`) — er wird nur nicht
zum Sealen des `ghcr-auth`-Secrets verwendet. Es fehlt also weniger ein neues
Konzept als der Anschluss eines vorhandenen Wertes an einen vorhandenen Mechanismus.

## What

`task env:seal ENV=<env>` erzeugt die beiden Flux-Bootstrap-SealedSecrets künftig
mit, aus dem Plaintext in `environments/.secrets/<env>.yaml`. Die Dateien bleiben an
ihrem Ort und behalten ihre Namen, damit `task flux:bootstrap` unverändert bleibt und
die Bootstrap-Reihenfolge intakt bleibt.

**Getroffene Design-Entscheidungen** (Brainstorming 2026-07-27):

- **Eigene Ausgabedateien statt Sammeldatei.** Die generierten SealedSecrets landen
  weiterhin als je eine Datei unter `flux/clusters/fleet/bootstrap/`, nicht in
  `environments/sealed-secrets/<env>.yaml`. Grund: `task flux:bootstrap` appliziert
  sie einzeln und *vor* allem anderen; die Sammeldatei enthält dagegen Secrets für
  Namespaces (`workspace`, `website`, `coturn`), die zum Bootstrap-Zeitpunkt noch gar
  nicht existieren. Dafür bekommt `extra_namespaces` ein optionales Feld
  `output_file`.
- **Nur der PAT im Plaintext, JSON beim Sealen gebaut.** `environments/.secrets/`
  hält `GHCR_PAT` (vorhanden) und `GHCR_USERNAME` (neu); der
  `.dockerconfigjson`-Blob `{"auths":{"ghcr.io":{"auth":"base64(user:pat)"}}}` wird
  im Sealer konstruiert. Grund: keine Token-Duplikation, der PAT bleibt an genau
  einer Stelle rotierbar. Dafür bekommt `extra_namespaces` ein optionales Feld
  `type` (Default `Opaque`) und einen `dockerconfigjson`-Builder.
- **`owner_brand: [mentolder]`.** `flux-system` existiert auf `fleet` nur einmal.
  Ohne `owner_brand` würden mentolder und korczewski dieselbe Ressource sealen und
  überschreiben — dasselbe Muster, das T001404/T001584 für `coturn` gelöst haben.

**Migrationsschritt (einmalig, manuell).** Der aktuelle Plaintext beider Werte muss
einmal aus dem Cluster in `environments/.secrets/mentolder.yaml` überführt werden,
bevor `env:seal` sie erzeugen kann. Danach ist der Cluster nicht mehr die Quelle.
Die Verifikation vergleicht die **entschlüsselten** Werte im Cluster vor und nach dem
Umstieg — nicht die Ciphertexte, die sich bei jedem `kubeseal`-Lauf unterscheiden.

**Nicht Teil dieser Änderung:** die `environments/sealed-secrets/fleet-*.yaml`-Dateien
und der `deploy-sealed-secrets`-Workflow (siehe `secrets-deploy-automation`) bleiben
unangetastet. Bootstrap-Secrets werden bewusst nicht auto-deployt — sie gehören in
den imperativen Bootstrap-Pfad.

_Ticket: T002254_
