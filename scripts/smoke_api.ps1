$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$Username,
  [Parameter(Mandatory=$true)][string]$Password
)

function Assert-Ok($name, $resp) {
  if (-not $resp.ok) {
    $j = $resp | ConvertTo-Json -Depth 10
    throw "Falhou: $name => $j"
  }
  Write-Host "OK: $name"
}

$api = $BaseUrl.TrimEnd("/") + "/api"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Login
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$api/login.php" -ContentType "application/json" -Body $loginBody -WebSession $session
Assert-Ok "login.php" $login

# Bootstrap
$bootstrap = Invoke-RestMethod -Method Get -Uri "$api/bootstrap.php" -WebSession $session
Assert-Ok "bootstrap.php" $bootstrap

# Changes (desde 0 só pra validar auth/ok)
$changes = Invoke-RestMethod -Method Get -Uri "$api/changes.php?since=0" -WebSession $session
Assert-Ok "changes.php" $changes

Write-Host "Smoke test concluído com sucesso."

