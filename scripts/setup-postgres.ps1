$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$postgresRoot = "C:\Estudos\.tools\PostgreSQL18\pgsql"
$dataDirectory = Join-Path $projectRoot ".postgres-data"
$logPath = Join-Path $projectRoot "backend\postgres.log"
$binDirectory = Join-Path $postgresRoot "bin"

if (-not (Test-Path (Join-Path $binDirectory "postgres.exe"))) {
    throw "PostgreSQL local não encontrado em $postgresRoot."
}

if (-not (Test-Path (Join-Path $dataDirectory "PG_VERSION"))) {
    & (Join-Path $binDirectory "initdb.exe") `
        --pgdata=$dataDirectory `
        --username=postgres `
        --auth=trust `
        --encoding=UTF8 `
        --locale=C
}

$status = & (Join-Path $binDirectory "pg_ctl.exe") status --pgdata=$dataDirectory 2>&1
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $binDirectory "pg_ctl.exe") start `
        --pgdata=$dataDirectory `
        --log=$logPath `
        --options="-p 5433 -h 127.0.0.1" `
        --wait
}

$databaseExists = & (Join-Path $binDirectory "psql.exe") `
    --host=127.0.0.1 `
    --port=5433 `
    --username=postgres `
    --dbname=postgres `
    --tuples-only `
    --no-align `
    --command="SELECT 1 FROM pg_database WHERE datname = 'mercado_estoque'"

if (($databaseExists | Out-String).Trim() -ne "1") {
    & (Join-Path $binDirectory "createdb.exe") `
        --host=127.0.0.1 `
        --port=5433 `
        --username=postgres `
        mercado_estoque
}

Write-Host "PostgreSQL do Mercado+ pronto em 127.0.0.1:5433."
