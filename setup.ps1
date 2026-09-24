# Qanvas: installs everything and leaves it running. Run setup.cmd (or: powershell -ExecutionPolicy Bypass -File setup.ps1).
# Safe to re-run: it resumes downloads, skips what is already done and restarts the services.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

Step 'Comprobando Docker'
$null = & docker info 2>&1
if ($LASTEXITCODE -ne 0) { Fail 'Docker no esta corriendo. Instala/abre Docker Desktop y vuelve a ejecutar el setup.' }
$null = & docker compose version 2>&1
if ($LASTEXITCODE -ne 0) { Fail 'Falta Docker Compose v2 (viene incluido en Docker Desktop).' }

Step 'Comprobando la GPU NVIDIA dentro de Docker'
$gpus = & docker run --rm --gpus all ubuntu:24.04 nvidia-smi -L 2>&1 | Where-Object { "$_" -match '^GPU \d+' }
if ($LASTEXITCODE -ne 0 -or -not $gpus) {
  Fail 'Docker no ve ninguna GPU NVIDIA. Actualiza el driver NVIDIA y usa Docker Desktop con WSL2 (o nvidia-container-toolkit en Linux).'
}
$gpus | ForEach-Object { Write-Host "   $_" }

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host '   Creado .env con la configuracion por defecto (1 GPU).'
}
if (@($gpus).Count -ge 2 -and -not (Select-String -Path .env -Pattern '^LLM_GPU=[1-9]' -Quiet)) {
  Write-Host '   Tienes mas de una GPU: pon LLM_GPU=1 en .env para dedicar la segunda al mejorador de prompts.' -ForegroundColor Yellow
}

$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
if (-not (Test-Path "$env:USERPROFILE\.wslconfig")) {
  Write-Host "   Consejo: con $ramGb GB de RAM, crea $env:USERPROFILE\.wslconfig con [wsl2] memory=20GB (ver README)." -ForegroundColor Yellow
}

Step 'Descargando modelos (~21 GB la primera vez; si se corta, vuelve a correr el setup y continua)'
& docker compose --profile setup run --rm models
if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron descargar todos los modelos. Revisa tu conexion y vuelve a ejecutar el setup.' }

Step 'Construyendo las imagenes'
& docker compose build
if ($LASTEXITCODE -ne 0) { Fail 'Fallo la construccion de las imagenes.' }

Step 'Iniciando los servicios'
& docker compose up -d
if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron iniciar los servicios.' }

$port = ((Select-String -Path .env -Pattern '^APP_PORT=(\d+)').Matches | Select-Object -First 1).Groups[1].Value
if (-not $port) { $port = '3000' }
$url = "http://localhost:$port"

Step 'Esperando a que los modelos terminen de precargarse (puede tardar unos minutos)'
$deadline = (Get-Date).AddMinutes(20)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $h = Invoke-RestMethod "$url/api/health" -TimeoutSec 5
    if ($h.comfy -and $h.warm.comfy) { $ready = $true; break }
  } catch { }
  Start-Sleep -Seconds 5
}
if (-not $ready) { Fail "Los servicios no quedaron listos a tiempo. Revisa: docker compose logs -f" }

Write-Host "`nQanvas esta listo en $url" -ForegroundColor Green
Start-Process $url
