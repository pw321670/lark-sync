param(
  [string]$VaultPath
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$manifestPath = Join-Path $repoRoot "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found at $manifestPath"
}

$manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
$pluginId = [string]$manifest.id

if (-not $pluginId) {
  throw "Plugin id is missing from manifest.json"
}

if (-not $VaultPath) {
  $localConfigPath = Join-Path $repoRoot "dev-vault.json"
  if (Test-Path $localConfigPath) {
    $localConfig = Get-Content -Path $localConfigPath -Raw | ConvertFrom-Json
    $VaultPath = [string]$localConfig.vaultPath
  }
}

if (-not $VaultPath) {
  throw "Provide -VaultPath or create dev-vault.json based on dev-vault.example.json"
}

if (-not (Test-Path $VaultPath)) {
  throw "Vault path does not exist: $VaultPath"
}

$vaultRoot = (Resolve-Path $VaultPath).Path
$obsidianPath = Join-Path $vaultRoot ".obsidian"

if (-not (Test-Path $obsidianPath)) {
  throw "The target path is not an Obsidian vault because .obsidian was not found: $vaultRoot"
}

$pluginsPath = Join-Path $obsidianPath "plugins"
if (-not (Test-Path $pluginsPath)) {
  New-Item -ItemType Directory -Path $pluginsPath | Out-Null
}

$pluginInstallPath = Join-Path $pluginsPath $pluginId

if (Test-Path $pluginInstallPath) {
  $existing = Get-Item -Force $pluginInstallPath
  $isReparsePoint = ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0

  if ($isReparsePoint) {
    Write-Host "Plugin link already exists: $pluginInstallPath"
    exit 0
  }

  throw "A real directory or file already exists at $pluginInstallPath. Move it away before creating the junction."
}

New-Item -ItemType Junction -Path $pluginInstallPath -Target $repoRoot | Out-Null

Write-Host "Created plugin junction:"
Write-Host "  Vault: $vaultRoot"
Write-Host "  Plugin path: $pluginInstallPath"
Write-Host "  Target repo: $repoRoot"
