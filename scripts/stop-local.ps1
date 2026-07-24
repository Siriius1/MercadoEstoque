$projectRoot = Split-Path -Parent $PSScriptRoot
$pidDirectory = Join-Path $projectRoot ".local-pids"
$postgresData = Join-Path $projectRoot ".postgres-data"
$pgCtl = "C:\Estudos\.tools\PostgreSQL18\pgsql\bin\pg_ctl.exe"

foreach ($name in @("api", "web")) {
    $pidFile = Join-Path $pidDirectory "$name.pid"
    if (Test-Path $pidFile) {
        $processId = [int](Get-Content $pidFile)
        Stop-Process -Id $processId -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $pidFile -Force
    }
}

if ((Test-Path $pgCtl) -and (Test-Path (Join-Path $postgresData "PG_VERSION"))) {
    & $pgCtl stop --pgdata=$postgresData --mode=fast --wait
}

Write-Host "Serviços locais do Mercado+ encerrados."
