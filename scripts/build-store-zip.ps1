# Gera ZIP limpo para upload na Chrome Web Store.
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\build-store-zip.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$manifestPath = Join-Path $root "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "manifest.json nao encontrado em $root"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw "Campo version ausente no manifest.json" }

$distDir = Join-Path $root "dist"
$stageDir = Join-Path $distDir "package"
# Garante shared/sites.js no pacote (incluido via pasta shared/)
$zipName = "sei-fluxo-$version-chrome.zip"
$zipPath = Join-Path $distDir $zipName

# Pastas/arquivos incluidos no pacote da loja (runtime apenas)
$includeDirs = @(
  "background",
  "content",
  "icons",
  "options",
  "popup",
  "shared"
)
$includeFiles = @(
  "manifest.json"
)

if (Test-Path $stageDir) {
  Remove-Item $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

foreach ($dir in $includeDirs) {
  $src = Join-Path $root $dir
  if (-not (Test-Path $src)) {
    throw "Pasta obrigatoria ausente: $dir"
  }
  Copy-Item $src -Destination (Join-Path $stageDir $dir) -Recurse -Force
}

foreach ($file in $includeFiles) {
  $src = Join-Path $root $file
  if (-not (Test-Path $src)) {
    throw "Arquivo obrigatorio ausente: $file"
  }
  Copy-Item $src -Destination (Join-Path $stageDir $file) -Force
}

# Validacoes basicas
$requiredIcons = @(
  "icons\icon16.png",
  "icons\icon48.png",
  "icons\icon128.png"
)
foreach ($icon in $requiredIcons) {
  $p = Join-Path $stageDir $icon
  if (-not (Test-Path $p)) { throw "Icone ausente no pacote: $icon" }
}

$sw = Join-Path $stageDir "background\service-worker.js"
if (-not (Test-Path $sw)) { throw "service-worker.js ausente no pacote" }

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

# Lista conteudo do zip para conferencia
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entries = $zip.Entries | ForEach-Object { $_.FullName } | Sort-Object
$zip.Dispose()

Write-Host ""
Write-Host "Pacote gerado com sucesso."
Write-Host "Versao : $version"
Write-Host "ZIP    : $zipPath"
Write-Host "Tamanho: $((Get-Item $zipPath).Length) bytes"
Write-Host ""
Write-Host "Conteudo ($($entries.Count) entradas):"
$entries | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "Proximo passo: envie o ZIP em https://chrome.google.com/webstore/devconsole"
