# Qwen3.5-4B worker pool, Windows-native :8080, RTX 3060 Ti only (T900930).
# 98304 shared KV / 3 slots is provisional: short requests verified, long-load pending.
# Copy to F:\tools\llama.cpp before use. Existing unrelated listeners are never killed.
param(
    [string]$LlamaDir = "F:\tools\llama.cpp",
    [string]$GpuUuid = "GPU-6b9ac882-e9e9-a364-4423-92d838536b86",
    [int]$Context = 98304,
    [int]$StartupTimeoutSec = 180
)
$ErrorActionPreference = "Stop"
$Exe = Join-Path $LlamaDir "llama-server.exe"
$Model = "F:\models\hub\models--unsloth--Qwen3.5-4B-MTP-GGUF\snapshots\86835bf9949e4d14d6860f7910b1340ad4f271a9\Qwen3.5-4B-UD-Q4_K_XL.gguf"
$Alias = "Qwen3.5-4B-MTP"
$PidFile = Join-Path $LlamaDir "qwen35-4b.pid"
$LogDir = Join-Path $LlamaDir "logs"
if ($Context -lt 65536 -or $Context -gt 98304) {
    throw "Context must be between 65536 and the provisional 98304 ceiling."
}
if (-not (Test-Path $Exe) -or -not (Test-Path $Model)) {
    throw "Missing pinned model or llama-server executable."
}
function Test-Worker {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:8080/health" -TimeoutSec 2
        $models = Invoke-RestMethod "http://127.0.0.1:8080/v1/models" -TimeoutSec 2
        $request = '{"messages":[{"role":"user","content":"hello"}],"add_generation_prompt":true}'
        $template = Invoke-RestMethod "http://127.0.0.1:8080/apply-template" -Method Post `
            -ContentType "application/json" -Body $request -TimeoutSec 2
        $direct = $template.prompt -match '<think>\s*</think>\s*$'
        return ($health.status -eq "ok" -and @($models.data.id) -contains $Alias -and $direct)
    } catch { return $false }
}
if (Test-Worker) {
    Write-Output "Qwen3.5-4B is healthy with non-thinking default on :8080; no reload."
    exit 0
}
# A wrong model or a thinking-default instance requires explicit operator replacement.
$listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    throw "Port 8080 is occupied by a different model/configuration. Stop the identified worker explicitly, then rerun."
}
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogOut = Join-Path $LogDir "qwen35-4b-out.log"
$LogErr = Join-Path $LogDir "qwen35-4b-err.log"
# Escaped inner quotes survive Start-Process's Windows command-line joining.
$ServerArgs = @(
    "-m", ('"' + $Model + '"'), "--alias", $Alias,
    "--spec-type", "draft-mtp", "--spec-draft-n-max", "4",
    "-c", "$Context", "-fit", "off", "-ngl", "999", "-fa", "1",
    "-ctk", "q4_0", "-ctv", "q4_0", "-ctkd", "q4_0", "-ctvd", "q4_0",
    "-np", "3", "-kvu", "--jinja", "--no-mmproj",
    "--chat-template-kwargs", '"{\"enable_thinking\":false}"',
    "--host", "0.0.0.0", "--port", "8080"
)
$OldGpuMask = $env:CUDA_VISIBLE_DEVICES
try {
    $env:CUDA_VISIBLE_DEVICES = $GpuUuid
    $process = Start-Process -FilePath $Exe -ArgumentList $ServerArgs -WorkingDirectory $LlamaDir `
        -WindowStyle Hidden -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr -PassThru
} finally {
    $env:CUDA_VISIBLE_DEVICES = $OldGpuMask
}
$process.Id | Out-File -FilePath $PidFile -Encoding ASCII
$deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) { throw "Worker exited. Inspect $LogErr" }
    if (Test-Worker) {
        Write-Output "Started $Alias with PID $($process.Id), non-thinking default, 3060 Ti $GpuUuid."
        exit 0
    }
    Start-Sleep -Seconds 2
    $process.Refresh()
}
# Preserve the process and logs for diagnosis; never kill by stale PID-file contents.
throw "Worker failed health/model/default checks within timeout. Inspect $LogErr and PID $($process.Id)."
