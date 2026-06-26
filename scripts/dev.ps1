$root = Split-Path -Parent $PSScriptRoot
$portableNode = Join-Path $root ".tools\node-v24.18.0-win-x64"

if (Test-Path $portableNode) {
  $env:Path = "$portableNode;$env:Path"
}

Set-Location $root
npm run dev
