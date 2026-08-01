param(
    [int]$RetentionDays = 14,
    [switch]$SkipIfToday
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot "backups\postgresql"
$pgDump = "C:\Estudos\.tools\PostgreSQL18\pgsql\bin\pg_dump.exe"
$pgRestore = "C:\Estudos\.tools\PostgreSQL18\pgsql\bin\pg_restore.exe"

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

if ($SkipIfToday) {
    $latest = Get-ChildItem -LiteralPath $backupRoot -Filter "mercado_estoque_*.dump" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($latest -and $latest.LastWriteTime.Date -eq (Get-Date).Date) {
        Write-Host "Backup diário já existe: $($latest.Name)"
        exit 0
    }
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$destination = Join-Path $backupRoot "mercado_estoque_$timestamp.dump"

& $pgDump `
    --host=127.0.0.1 `
    --port=5433 `
    --username=postgres `
    --dbname=mercado_estoque `
    --format=custom `
    --compress=6 `
    --file=$destination

if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination }
    throw "Não foi possível criar o backup do PostgreSQL."
}

& $pgRestore --list $destination | Out-Null
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $destination
    throw "O arquivo de backup foi criado, mas não passou na verificação."
}

$limit = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $backupRoot -Filter "mercado_estoque_*.dump" -File |
    Where-Object LastWriteTime -lt $limit |
    ForEach-Object {
        if ($_.FullName.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $_.FullName
        }
    }

Write-Host "Backup verificado: $destination"
