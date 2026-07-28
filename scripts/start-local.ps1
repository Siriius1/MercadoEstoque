$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = "C:\Estudos\.tools\Python314\python.exe"
$node = "C:\Estudos\.tools\node-v22.14.0-win-x64\node.exe"
$vinext = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
$pidDirectory = Join-Path $projectRoot ".local-pids"
$apiPort = 8001

& (Join-Path $PSScriptRoot "setup-postgres.ps1")
New-Item -ItemType Directory -Path $pidDirectory -Force | Out-Null

function Test-LocalPort([int]$Port) {
    return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

if (-not (Test-LocalPort $apiPort)) {
    $api = Start-Process -FilePath $python `
        -ArgumentList "-m","uvicorn","backend.app.main:app","--host","127.0.0.1","--port","$apiPort","--reload" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput (Join-Path $projectRoot "backend\api.out.log") `
        -RedirectStandardError (Join-Path $projectRoot "backend\api.err.log")
    $api.Id | Set-Content (Join-Path $pidDirectory "api.pid")
}

if (-not (Test-LocalPort 3000)) {
    $web = Start-Process -FilePath $node `
        -ArgumentList $vinext,"dev" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput (Join-Path $projectRoot "dev.out.log") `
        -RedirectStandardError (Join-Path $projectRoot "dev.err.log")
    $web.Id | Set-Content (Join-Path $pidDirectory "web.pid")
}

Write-Host "Mercado+ iniciado:"
Write-Host "  Site: http://localhost:3000"
Write-Host "  API:  http://127.0.0.1:$apiPort/docs"
Write-Host "Use scripts\stop-local.ps1 para encerrar."
