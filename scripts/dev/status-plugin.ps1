param(
  [string]$VaultPath
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$manifestPath = Join-Path $repoRoot "manifest.json"
$manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
$pluginId = [string]$manifest.id

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

$vaultRoot = (Resolve-Path $VaultPath).Path
$pluginInstallPath = Join-Path $vaultRoot ".obsidian\\plugins\\$pluginId"

Write-Host "Repository root: $repoRoot"
Write-Host "Vault path: $vaultRoot"
Write-Host "Plugin id: $pluginId"
Write-Host "Expected plugin path: $pluginInstallPath"

if (-not (Test-Path $pluginInstallPath)) {
  Write-Host "Status: missing"
  exit 0
}

$item = Get-Item -Force $pluginInstallPath
$isReparsePoint = ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0

Write-Host "Status: present"
Write-Host "Attributes: $($item.Attributes)"

if ($isReparsePoint) {
  $target = $null
  if ($item.PSObject.Properties.Name -contains "Target") {
    $target = $item.Target
  }
  if ($item.PSObject.Properties.Name -contains "LinkTarget" -and -not $target) {
    $target = $item.LinkTarget
  }

  Write-Host "Link type: junction/symlink"
  if ($target) {
    Write-Host "Target: $target"
  }
} else {
  Write-Host "Link type: regular directory/file"
}
