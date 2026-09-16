# scripts/llm/install-freetoken.ps1 -- FreeToken-Engine windows-nativ installieren.
#
# WARUM ES DAS GIBT: Die Installation ist dreimal gescheitert, weil sie von Hand
# lief. Der Fehlschlag vom 2026-09-16 legte ein leeres 29-MB-venv im Repo-Root ab
# (Verzeichnis ":LOCALAPPDATA" -- die Variable wurde nicht expandiert) und benutzte
# Python 3.11.15, obwohl das Release-Wheel cp312 ist und dort nie haette
# installiert werden koennen. Beide Fehler sind hier nicht mehr moeglich:
# der Zielpfad kommt aus $env:LOCALAPPDATA, die Version ist auf 3.12 gepinnt.
#
# Versionsvertrag (aus der Wheel-METADATA von freetoken 0.1.2+g141c31a8d):
#   Python  = 3.12 exakt        (Wheel-Tag cp312-cp312-win_amd64)
#   torch  >= 2.11, < 2.12      (CUDA 13.0 -- der kernel_cache ist cu130)
#   triton-windows == 3.6.0.post26
# Die RTX 5070 Ti ist Blackwell (sm_120) und braucht daher mindestens cu128;
# cu130 ist die Variante, zu der der mitgelieferte Kernel-Cache passt.
#
# Usage (aus WSL, detached -- der Torch-Download dauert Minuten):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/install-freetoken.ps1
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/install-freetoken.ps1 -Force

param(
    [string]$WheelDir = "$env:USERPROFILE\Downloads\ft-wheels",
    [string]$PythonVersion = "3.12",
    [string]$TorchIndex = "https://download.pytorch.org/whl/cu130",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$VenvDir = "$env:LOCALAPPDATA\FreeToken\venv"
$LogDir  = "$env:LOCALAPPDATA\FreeToken\logs"
$FtExe   = "$VenvDir\Scripts\ft.exe"
$PyExe   = "$VenvDir\Scripts\python.exe"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Say($msg) { Write-Host ("[install-freetoken] " + $msg) }

# Der Zielpfad MUSS expandiert sein -- genau daran ist der Lauf vom 2026-09-16
# gescheitert. Ein Doppelpunkt ausserhalb der Laufwerksangabe ist der Beweis,
# dass die Variable als Literal durchgereicht wurde.
if ($VenvDir -notmatch '^[A-Za-z]:\\' -or $VenvDir.Substring(2) -match ':') {
    throw "LOCALAPPDATA nicht expandiert -- Zielpfad waere '$VenvDir'. Abbruch."
}

# Eine fertige Installation ist ohne -Force ein No-op.
if ((Test-Path $FtExe) -and (-not $Force)) {
    Say "ft.exe existiert bereits: $FtExe (mit -Force neu installieren)"
    & $FtExe --version
    exit 0
}

# Aufgeraeumt wird am VENV-Verzeichnis, nicht an ft.exe. Der haeufige Zustand
# dieses Hosts ist die HALBE Installation: venv vorhanden, ft.exe nicht. Haengt
# die Bedingung an ft.exe, wird nie aufgeraeumt und "uv venv" bricht ab mit
# "A virtual environment already exists" (beobachtet 2026-09-16, zweimal).
if (Test-Path $VenvDir) {
    Say "entferne bestehendes venv $VenvDir"
    Remove-Item -Recurse -Force $VenvDir
}

# Wheels pruefen, BEVOR ein venv entsteht -- sonst bleibt bei fehlendem Asset
# wieder eine halbe Installation liegen.
if (-not (Test-Path $WheelDir)) { throw "Wheel-Verzeichnis fehlt: $WheelDir" }
$engineWheel = Get-ChildItem $WheelDir -Filter "freetoken-*cp312-cp312-win_amd64.whl" | Select-Object -First 1
$cacheWheel  = Get-ChildItem $WheelDir -Filter "freetoken_kernel_cache-*win_amd64.whl" | Select-Object -First 1
if (-not $engineWheel) { throw "Engine-Wheel (cp312, win_amd64) nicht in $WheelDir gefunden" }
if (-not $cacheWheel)  { throw "Kernel-Cache-Wheel nicht in $WheelDir gefunden" }
Say ("Engine-Wheel: " + $engineWheel.Name)
Say ("Kernel-Cache: " + $cacheWheel.Name)

# Interpreter beschaffen. uv wird bevorzugt, weil die vorhandenen Interpreter
# dieses Hosts ohnehin unter %APPDATA%\uv liegen; py -3.12 ist der Rueckfallweg.
$uv = Get-Command uv -ErrorAction SilentlyContinue
if ($uv) {
    Say "uv gefunden -- stelle Python $PythonVersion bereit"
    & uv python install $PythonVersion
    if ($LASTEXITCODE -ne 0) { throw "uv python install $PythonVersion fehlgeschlagen" }
    # --seed ist Pflicht: ohne das Flag legt uv ein venv OHNE pip an, und der
    # pip-Bootstrap weiter unten scheitert (beobachtet 2026-09-16).
    Say "erzeuge venv (uv, --seed): $VenvDir"
    & uv venv --seed --clear --python $PythonVersion $VenvDir
    if ($LASTEXITCODE -ne 0) { throw "uv venv fehlgeschlagen" }
} else {
    Say "uv nicht gefunden -- nutze py -$PythonVersion"
    & py "-$PythonVersion" -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { throw "py -$PythonVersion -m venv fehlgeschlagen" }
}

if (-not (Test-Path $PyExe)) { throw "venv-Interpreter fehlt: $PyExe" }

# Die Version wird gemessen, nicht angenommen: ein 3.11-venv nimmt das cp312-Wheel
# nicht an, und der Fehler kommt sonst erst nach dem mehrere GB grossen Torch-Download.
$actual = (& $PyExe -c "import sys; print('%d.%d' % sys.version_info[:2])").Trim()
if ($actual -ne $PythonVersion) {
    throw "venv-Interpreter ist Python $actual, erwartet $PythonVersion -- das cp312-Wheel waere nicht installierbar."
}
Say "venv-Interpreter: Python $actual"

& $PyExe -m pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) { throw "pip-Bootstrap fehlgeschlagen" }

# Torch zuerst und aus dem CUDA-Index. Wuerde es als Transitivabhaengigkeit des
# Engine-Wheels kommen, zoege pip die CPU-Variante von PyPI -- die laedt, laeuft,
# und faellt erst beim ersten Modell-Load als "no kernel image" auf.
Say "installiere torch (>=2.11,<2.12) aus $TorchIndex"
& $PyExe -m pip install --index-url $TorchIndex "torch>=2.11,<2.12"
if ($LASTEXITCODE -ne 0) { throw "torch-Installation fehlgeschlagen" }

Say "installiere FreeToken-Engine und Kernel-Cache"
& $PyExe -m pip install $engineWheel.FullName $cacheWheel.FullName
if ($LASTEXITCODE -ne 0) { throw "FreeToken-Installation fehlgeschlagen" }

if (-not (Test-Path $FtExe)) { throw "ft.exe fehlt nach der Installation: $FtExe" }

# Positiv-Anker: CUDA muss die Blackwell-Karte sehen. Ohne diese Zeile meldet das
# Skript Erfolg, waehrend jeder spaetere serve-Lauf auf der CPU landet.
$cuda = & $PyExe -c "import torch; print(torch.version.cuda, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO-GPU')"
Say ("torch/CUDA: " + $cuda)
if ($cuda -notmatch "True") { throw "torch sieht keine CUDA-GPU -- Installation unbrauchbar: $cuda" }

Say "ft.exe: $FtExe"
& $FtExe --version
Say "fertig."
