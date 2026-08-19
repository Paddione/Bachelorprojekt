---
title: Design: headed-vision-sweep
ticket_id: T012781
domains: [website, infra, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: headed-vision-sweep

_Ticket: T012781_

## 1. Der Weg zum Modell

| | |
|---|---|
| Endpunkt | `http://127.0.0.1:18235/v1/chat/completions` (llm-proxy) |
| Modellname | `gemma12-vision` (Alias, aufgelöst vom Proxy) |
| Backend dahinter | `llamacpp-gemma12` → `http://127.0.0.1:8089/v1`, `max_inflight = 3` |
| Loadout | `gemma12-vision`, Gemma 4 12B QAT UD-Q4_K_XL + `mmproj-F16.gguf`, `-np 3 -kvu` |

**Nicht direkt auf 8089.** Der Server läuft auf dem Windows-GPU-Host; aus WSL antwortet
`curl http://localhost:8089/v1/models` mit HTTP-Code `000` (keine Verbindung), während
`curl http://127.0.0.1:18235/v1/models` mit `200` antwortet. Der Proxy ist nicht Bequemlichkeit,
sondern der einzige erreichbare Weg — und er ist zugleich die Stelle, an der `max_inflight = 3`
serverseitig durchgesetzt wird.

**Der Alias ist bewusst kein Dateiname.** llama.cpp meldet unter `/v1/models` den GGUF-Dateinamen
(`gemma-4-12B-it-qat-UD-Q4_K_XL.gguf`). Die `model_aliases`-Abbildung des Backends entkoppelt
davon; ein Quant-Wechsel zieht dann keine Client-Änderung nach sich.

## 2. Anfrageform

```jsonc
{
  "model": "gemma12-vision",
  "temperature": 0,          // überschreibt die Loadout-Vorgabe 1 — ein Urteil soll reproduzierbar sein
  "max_tokens": 320,
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "<Fragenkatalog, siehe 3>" },
      { "type": "image_url",
        "image_url": { "url": "data:image/jpeg;base64,<screenshot>" } }
    ]
  }],
  "response_format": { "type": "json_schema", "json_schema": { "schema": { /* siehe 4 */ } } }
}
```

**JPEG, nicht PNG.** Playwright liefert per `page.screenshot({ type: 'jpeg', quality: 80 })` ein
Bild, dessen base64-Nutzlast rund ein Zehntel der PNG-Variante wiegt. Das zählt doppelt: die
Nutzlast geht über HTTP, und der Prefill des Vision-Towers dominiert die Antwortzeit.

## 3. Der Fragenkatalog

Der Prompt stellt **geschlossene** Fragen. Offene („beschreibe, was du siehst") erzeugen Prosa,
die niemand auswertet — genau das tut der heutige, wirkungslose Aufruf in
`k8-headed-verify.spec.ts:76`.

Gefragt wird nach genau fünf Befunden:

| Kennung | Frage |
|---|---|
| `blank` | Ist der sichtbare Bereich praktisch leer (kein Inhalt außer Hintergrund/Chrom)? |
| `error_visible` | Steht eine technische Fehlermeldung im Bild (Stacktrace, „500", „Internal Server Error", Framework-Overlay)? |
| `layout_broken` | Überlagern sich Elemente, ragt Inhalt sichtbar aus seinem Container, oder ist Text abgeschnitten? |
| `unstyled` | Wirkt die Seite ungestylt (nackte HTML-Standarddarstellung, fehlendes CSS)? |
| `unexpected_auth_wall` | Ist eine Anmeldeaufforderung zu sehen, obwohl die Route in ihrer Auth-Stufe angemeldet sein sollte? |

Der Prompt bekommt als Kontext mit: Route-Pfad, Brand, Viewport und die bereits ermittelte
`status`-Angabe der Sweep-Zeile. Ohne diesen Kontext kann das Modell `unexpected_auth_wall`
nicht beantworten — eine Anmeldeseite ist auf `/login` korrekt und auf `/admin/tickets` ein Defekt.

## 4. Antwortform

```jsonc
{
  "type": "object",
  "required": ["verdict", "findings"],
  "additionalProperties": false,
  "properties": {
    "verdict":  { "type": "string", "enum": ["ok", "suspect"] },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "confidence", "note"],
        "additionalProperties": false,
        "properties": {
          "code":       { "type": "string",
                          "enum": ["blank","error_visible","layout_broken","unstyled","unexpected_auth_wall"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "note":       { "type": "string", "maxLength": 200 }
        }
      }
    }
  }
}
```

`response_format` erzwingt die Form über eine Grammatik im Server. Kommt trotzdem etwas anderes
zurück — abgeschnittene Antwort, Server ohne Grammatik-Unterstützung —, wird die Zeile als
`status: "unusable"` samt Rohantwort abgelegt und **nicht** teilweise geparst. Ein halb geparstes
Urteil ist schlechter als gar keines, weil es aussieht wie ein Ergebnis.

## 5. Nebenläufigkeit

Der Sweep ist per Konstruktion seriell: `visual-sweep.spec.ts:57` setzt
`test.describe.configure({ mode: 'serial' })`, und je Auth-Stufe wird **eine** Page
wiederverwendet. Innerhalb eines Sweeps lässt sich also nichts parallelisieren, ohne die
Video-Aufzeichnung und den Auth-Kontext-Cache zu zerschlagen.

Die Nebenläufigkeit entsteht deshalb eine Ebene höher, über die vier Sweep-Projects
(`{mentolder,korczewski} × {desktop,mobile}`):

```
playwright test --config playwright.visual-sweep.config.ts --headed --workers=3 \
  --project=visual-sweep-mentolder-desktop \
  --project=visual-sweep-mentolder-mobile \
  --project=visual-sweep-korczewski-desktop \
  --project=visual-sweep-korczewski-mobile
```

Playwright-Worker sind eigene Prozesse. Jeder Worker fährt genau ein Project, jedes Project ist
seriell, jede Route wartet ihren Vision-Aufruf ab. Daraus folgt die Invariante direkt:

> gleichzeitige Vision-Anfragen ≤ Worker-Anzahl = 3

Vier Projects auf drei Workern heißt: drei laufen, das vierte rückt nach. Die Obergrenze bleibt
drei — sie hängt an der Worker-Zahl, nicht an der Project-Zahl. Serverseitig deckelt der Proxy
mit `max_inflight = 3` dieselbe Zahl ein zweites Mal ab; die beiden Grenzen sind unabhängig
voneinander gesetzt und müssen nicht abgestimmt werden.

Warum drei und nicht mehr: `scripts/llm/measurements/2026-08-19-gemma12-slots.md` misst bei
`-np 3 -kvu` 307–489 tok/s gesamt gegen 255 bei einem Slot; `-np 4` fällt auf 319 zurück, `-np 6`
lädt gar nicht erst (der MTP-Drafter bricht ab). Drei ist gemessen.

## 6. Kopplung an den Sweep

Ein neues Modul `tests/e2e/lib/vision-judge.ts` kapselt Erreichbarkeitsprüfung, Anfrage,
Schema-Prüfung und Fehlerbehandlung. Der Sweep ruft es an genau einer Stelle auf — direkt
nachdem der Screenshot geschrieben wurde — und hängt das Ergebnis an eine parallele Liste,
nicht an die bestehende `ResultRow`. Grund: `results-<viewport>.json` wird von
`build-gallery.mjs` und von vorhandenen Auswertungen gelesen; ein zusätzliches Feld dort
verändert ein Format, das andere bereits konsumieren. Die Urteile gehen deshalb in eine eigene
Datei `vision-<viewport>.json` neben dem bestehenden Ergebnis.

Der Read-only-Netzwerk-Guard (`installReadOnlyGuard`) bricht alle Nicht-GET/HEAD-Anfragen der
**Seite** ab. Der Vision-Aufruf geht über Node-`fetch` aus dem Testprozess, nicht über den
Browser-Kontext, und wird davon nicht erfasst. Das ist zu verifizieren, nicht anzunehmen.

## 7. Schalter

| Variable | Vorgabe | Wirkung |
|---|---|---|
| `VISUAL_SWEEP_VISION` | leer (aus) | `=1` schaltet die Stufe ein |
| `VISION_URL` | `http://127.0.0.1:18235/v1/chat/completions` | Endpunkt |
| `VISION_MODEL` | `gemma12-vision` | Modellalias |
| `VISION_TIMEOUT_MS` | `60000` | Zeitgrenze je Anfrage |
| `VISION_MAX_ROUTES` | leer (alle) | Deckel für Probeläufe |

Aus-als-Vorgabe ist Absicht: `task test:e2e:visual-sweep` bleibt damit unverändert schnell und
unabhängig vom GPU-Host. Die Stufe wird über ein eigenes Taskfile-Ziel eingeschaltet.

## 8. Kosten, grob

Rund 104 nicht ausgeschlossene Routen je Project, vier Projects — also etwa 400 Bilder,
verteilt auf drei Slots. Prefill ist bildlastig, die Antwort mit ≤ 320 Token kurz. Bei geschätzt
2–4 s je Urteil ergibt das ungefähr 5–9 Minuten Vision-Anteil über den gesamten Lauf.

**Diese Zahl ist geschätzt, nicht gemessen.** Der Plan enthält deshalb einen eigenen
Messschritt, der sie an einem Probelauf über zehn Routen belegt oder widerlegt, bevor der volle
Lauf angeboten wird. Offen ist insbesondere, ob der MTP-Drafter hier hilft oder schadet: er
verdreifacht die Dekodierrate, halbiert aber den Prefill — und bei kurzer Antwort auf großem
Bild überwiegt der Prefill.

## 9. Verworfen

- **Vision-Urteil als harte Assertion.** Ein 12B-Modell auf 400 Screenshots erzeugt
  Falschmeldungen; ein Lauf, der daran scheitert, wird nach dem zweiten Mal ignoriert. Report-only
  hält den Befund sichtbar, ohne den Lauf zu entwerten.
- **Eigener Vision-Server auf einem eigenen Port.** Genau das suggeriert die alte 8094-Formulierung.
  Es gibt keinen solchen Dienst, und `exclusiveGroup: "chat-gpu"` lässt ohnehin nur ein
  GPU-Loadout gleichzeitig laufen — ein zweiter Server wäre nicht startbar.
- **Nebenläufigkeit innerhalb eines Sweeps.** Bräche den seriellen Modus, den Page-Cache je
  Auth-Stufe und die durchgehende Video-Aufzeichnung.
- **Screenshots nachträglich aus dem Ergebnisordner beurteilen.** Wäre entkoppelter, verlöre aber
  den Live-Kontext (Auth-Stufe, DOM-Status) und liefe nicht headed — die Anforderung des Vorgangs.
