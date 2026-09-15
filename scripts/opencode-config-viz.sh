#!/usr/bin/env bash
set -euo pipefail

# scripts/opencode-config-viz.sh — deterministischer Markdown-Tree der opencode-
# Agenten-/Modellkonfiguration (T900162).
#
# Liest die SSOT .opencode/agent-models.jsonc (+ optional weitere Configs via
# --config) und rendert docs/agent-guide/registry/config-overview.md:
# Provider -> Modelle -> Agenten, je mit Limit, Messdatum und Status
# (ok | stale | fehlt | unbelegt). Die Ausgabe ist generiert und wird NIE von
# Hand editiert — Editier-Ziel ist die SSOT.
#
# nvim-Hinweis (JSONC): .opencode/agent-models.jsonc mit JSONC-Treesitter-
# Highlighting + foldmethod=syntax bearbeiten:
#   nvim .opencode/agent-models.jsonc
#   :set ft=jsonc foldmethod=syntax
# Die generierte Uebersicht dient als Karte, nicht als Editier-Ziel.
#
# Nutzung:
#   scripts/opencode-config-viz.sh                     # regenerieren (liest --config-Markerzeile)
#   scripts/opencode-config-viz.sh --check             # Snapshot-Vergleich (exit 1 bei Drift)
#   scripts/opencode-config-viz.sh --config <pfad>     # zusaetzliche Config validieren
#   scripts/opencode-config-viz.sh --output <pfad>     # Zielpfad ueberschreiben
#
# Reproduktion: die zusaetzlich validierten Config-Pfade werden als Markerzeile
# (<!-- opencode-config-viz: extra-config=<pfad> -->) in die generierte Uebersicht
# geschrieben. Ein Lauf OHNE --config liest diese Markerzeile und reproduziert
# damit exakt den committeten Stand (T900162-Review-Finding 1).

usage() {
  sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSOT="$REPO_DIR/.opencode/agent-models.jsonc"
OUTPUT="${VIZ_OUTPUT:-$REPO_DIR/docs/agent-guide/registry/config-overview.md}"
CHECK=0
EXTRA=()
MARKER_EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --config) EXTRA+=("$2"); shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unbekanntes Argument: $1" >&2; usage; exit 2 ;;
  esac
done

# Ohne explizites --config: Markerzeile(n) aus dem letzten generierten Stand
# lesen und exakt reproduzieren (T900162-Review-Finding 1: plain regen == committed file).
if [[ ${#EXTRA[@]} -eq 0 && -f "$OUTPUT" ]]; then
  while IFS= read -r marker_path; do
    MARKER_EXTRA+=("$marker_path")
  done < <(sed -n 's|^<!-- opencode-config-viz: extra-config=\(.*\) -->$|\1|p' "$OUTPUT")
fi

# Explizit uebergebene --config-Pfade muessen existieren (freundlicher Fehler,
# kein roher node-Stack — T900162-Review-Finding 5).
for p in "${EXTRA[@]}"; do
  if [[ ! -f "$p" ]]; then
    echo "Error: --config Datei nicht gefunden: $p" >&2
    exit 1
  fi
done

# Marker-Pfade (z. B. Windows-Config auf anderem Host) fehlen darf: ueberspringen.
for p in "${MARKER_EXTRA[@]}"; do
  if [[ -f "$p" ]]; then
    EXTRA+=("$p")
  else
    echo "Warnung: extra config nicht gefunden, uebersprungen: $p" >&2
  fi
done

if [[ ! -f "$SSOT" ]]; then
  echo "Error: SSOT $SSOT nicht gefunden." >&2
  exit 1
fi

TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

node - "$SSOT" "${EXTRA[@]}" > "$TMP_OUT" <<'NODE'
const { parse } = require("jsonc-parser");
const fs = require("fs");

const ssotPath = process.argv[2];
const extraPaths = process.argv.slice(3);

function readJsonc(path) {
  let src;
  try {
    src = fs.readFileSync(path, "utf8");
  } catch (e) {
    console.error(`Config nicht lesbar: ${path} (${e.code || e.message})`);
    process.exit(1);
  }
  const errors = [];
  const data = parse(src, errors, { allowTrailingComma: true });
  if (errors.length) {
    console.error(`JSONC-Parsefehler in ${path}: ${errors.map(e => e.error).join(", ")}`);
    process.exit(1);
  }
  return { data, src };
}

// Anmerkungen (Messdatum / Stale-Marker) aus dem Rohtext zwischen Modell-Key
// und limit-Block ziehen — jsonc-parser verwirft Kommentare.
function modelAnnotations(src, modelKey, providerBasis) {
  const idx = src.indexOf(`"${modelKey}": {`);
  if (idx < 0) return {};
  const limitIdx = src.indexOf(`"limit": {`, idx);
  const block = limitIdx > 0 ? src.slice(idx, limitIdx) : src.slice(idx, idx + 2000);
  const messung = block.match(/messung:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  const stale = block.match(/stale:([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  let messungLabel = messung ? messung[1] : null;
  // "kein Frischwert" -> das Anmerkungsdatum ist KEIN Messdatum; die Basis-Messung
  // auszeichnen: erst explizit im Modell-Kommentar (mehrzeilig, mit //-Zeilen),
  // sonst das Provider-Basisdatum (T900162-Review-Finding 3).
  if (messung && /kein Frischwert/i.test(block)) {
    const basis = block.match(/Basis\s+bleibt\s+die\s+dokumentierte\s+Messung(?:\s|\/\/)*\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
    if (basis) messungLabel = `${basis[1]} (Basis)`;
    else if (providerBasis) messungLabel = `${providerBasis} (Basis)`;
  }
  return { messung: messungLabel, stale: stale ? stale[1] : null };
}

// Provider-Basisdatum: "GEMESSEN (YYYY-MM-DD, ...)" im Provider-Kommentar.
// Der Kommentarblock liegt oft VOR dem Provider-Key — Start ist das Ende des
// vorherigen models-Blocks (letztes "}" vor dem Key), sonst Dateianfang.
function providerBasisDate(src, providerKey) {
  const idx = src.indexOf(`"${providerKey}": {`);
  if (idx < 0) return null;
  const modelsIdx = src.indexOf(`"models": {`, idx);
  const prevEnd = src.lastIndexOf("}", idx);
  const start = prevEnd > 0 ? prevEnd : 0;
  const block = src.slice(start, modelsIdx > 0 ? modelsIdx : idx + 2000);
  const m = block.match(/GEMESSEN\s*\(([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  return m ? m[1] : null;
}

const ssot = readJsonc(ssotPath);
const providers = ssot.data.provider || {};
const agents = ssot.data.agent || {};

// Referenzierte Modelle (fuer Status "fehlt": SSOT-Modell ohne Agenten-Referenz)
const referenced = new Set();
for (const a of Object.values(agents)) {
  if (typeof a.model === "string") referenced.add(a.model);
}

const out = [];
out.push("# opencode Agent-/Modell-Konfiguration — Uebersicht");
out.push("");
out.push("> Generiert von `scripts/opencode-config-viz.sh` — **nie von Hand editieren**.");
out.push("> Editier-Ziel ist die SSOT `.opencode/agent-models.jsonc`.");
out.push("");
// Markerzeile(n): persistieren die --config-Pfade, damit ein Lauf ohne
// --config exakt denselben Stand reproduziert (T900162-Review-Finding 1).
for (const extraPath of extraPaths) {
  out.push(`<!-- opencode-config-viz: extra-config=${extraPath} -->`);
}
out.push("");
out.push("## README");
out.push("");
out.push("- **SSOT:** `.opencode/agent-models.jsonc` — Provider, Modelle, Agenten.");
out.push("- **Status-Taxonomie:** `ok` (SSOT-Eintrag ohne Stale-Marker) · `stale` (tot verifiziert / Limit-Drift) · `fehlt` (SSOT-Modell ohne Agenten-Referenz) · `unbelegt` (Referenz ohne SSOT-Eintrag).");
out.push("- **nvim:** `nvim .opencode/agent-models.jsonc` — JSONC-Treesitter-Highlighting + `foldmethod=syntax` (`:set ft=jsonc foldmethod=syntax`).");
out.push("- **Windows-Desktop-Config** (`C:\\Users\\PatrickKorczewski\\.config\\opencode\\opencode.jsonc`): zeigt `llamacpp-local` auf den dekommissionierten `:18235`-Stack; `qwen38-220k` deklariert 114688 statt 205056 (SSOT), `qwen36-35b-a3b-262k` und `llamacpp-native/qwen3.8-27b` existieren nicht in der SSOT, `big-pickle` deklariert 1000000 statt 260000. Einmalige manuelle Korrektur erforderlich — kein Cross-OS-Schreibzugriff (T900162).");
out.push("- **Reproduktion:** `bash scripts/opencode-config-viz.sh` regeneriert exakt dieses Dokument; die zusaetzlich validierte Config (`--config <pfad>`) wird als Markerzeile persistiert und beim Lauf ohne `--config` automatisch wiederverwendet.");
out.push("");
out.push("## Provider");
out.push("");

for (const [pname, prov] of Object.entries(providers)) {
  out.push(`### ${pname}`);
  out.push("");
  out.push("| Modell | Limit (ctx/output) | Messung | Status |");
  out.push("|---|---|---|---|");
  const models = prov.models || {};
  const pBasis = providerBasisDate(ssot.src, pname);
  for (const [mname, model] of Object.entries(models)) {
    const ann = modelAnnotations(ssot.src, mname, pBasis);
    const limit = model.limit || {};
    const ref = `${pname}/${mname}`;
    let status;
    if (ann.stale) status = `\`stale\` (${ann.stale})`;
    else if (!referenced.has(ref)) status = "`fehlt`";
    else status = "`ok`";
    out.push(`| ${mname} | ${limit.context ?? "?"}/${limit.output ?? "?"} | ${ann.messung ?? "—"} | ${status} |`);
  }
  out.push("");
}

out.push("## Agenten");
out.push("");
out.push("| Agent | Modell | Status |");
out.push("|---|---|---|");
for (const [aname, agent] of Object.entries(agents)) {
  const ref = typeof agent.model === "string" ? agent.model : "(kein model)";
  const [p, m] = ref.split("/");
  const ok = p && m && providers[p] && providers[p].models && providers[p].models[m];
  out.push(`| ${aname} | ${ref} | ${ok ? "`ok`" : "`unbelegt`"} |`);
}
out.push("");

for (const extraPath of extraPaths) {
  const extra = readJsonc(extraPath);
  out.push(`## Zusatz-Config: ${extraPath}`);
  out.push("");
  out.push("> Gegen die SSOT validiert; Abweichungen sind als `stale`/`unbelegt` markiert.");
  out.push("");
  const eproviders = extra.data.provider || {};
  for (const [pname, prov] of Object.entries(eproviders)) {
    const models = prov.models || {};
    const ssotProv = providers[pname];
    out.push(`### ${pname}`);
    out.push("");
    out.push("| Modell | Limit (ctx/output) | SSOT-Limit | Status |");
    out.push("|---|---|---|---|");
    for (const [mname, model] of Object.entries(models)) {
      const limit = model.limit || {};
      const ssotModel = ssotProv && ssotProv.models ? ssotProv.models[mname] : undefined;
      const ssotAnn = ssotModel ? modelAnnotations(ssot.src, mname) : {};
      let status;
      if (!ssotModel) status = "`unbelegt`";
      else if (ssotAnn.stale) status = "`stale` (SSOT-stale)";
      else if ((ssotModel.limit || {}).context !== limit.context) status = "`stale` (Limit-Drift)";
      else status = "`ok`";
      const ssotCtx = ssotModel && ssotModel.limit ? ssotModel.limit.context : "—";
      out.push(`| ${mname} | ${limit.context ?? "?"}/${limit.output ?? "?"} | ${ssotCtx ?? "—"} | ${status} |`);
    }
    out.push("");
  }
  const eagents = extra.data.agent || {};
  if (Object.keys(eagents).length > 0) {
    out.push("### Agenten");
    out.push("");
    out.push("| Agent | Modell | Status |");
    out.push("|---|---|---|");
    for (const [aname, agent] of Object.entries(eagents)) {
      const ref = typeof agent.model === "string" ? agent.model : "(kein model)";
      const [p, m] = ref.split("/");
      const ok = p && m && providers[p] && providers[p].models && providers[p].models[m];
      out.push(`| ${aname} | ${ref} | ${ok ? "`ok`" : "`unbelegt`"} |`);
    }
    out.push("");
  }
}

process.stdout.write(out.join("\n"));
NODE

if [[ $CHECK -eq 1 ]]; then
  if [[ ! -f "$OUTPUT" ]]; then
    echo "config-overview.md fehlt — regenerieren: bash scripts/opencode-config-viz.sh" >&2
    exit 1
  fi
  if diff -q "$TMP_OUT" "$OUTPUT" >/dev/null 2>&1; then
    echo "config-overview.md ist aktuell (snapshot-identisch)"
    exit 0
  fi
  echo "config-overview.md ist veraltet — diff:" >&2
  diff -u "$OUTPUT" "$TMP_OUT" >&2 || true
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
mv "$TMP_OUT" "$OUTPUT"
echo "config-overview.md regeneriert: $OUTPUT"
