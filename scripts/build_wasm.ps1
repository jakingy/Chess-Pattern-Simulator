$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$wslProjectRoot = (wsl wslpath -a "$projectRoot").Trim()

wsl bash -lc "cd '$wslProjectRoot/wasm_sim' && rustup target add wasm32-unknown-unknown && cargo build --release --target wasm32-unknown-unknown"

Copy-Item `
  -LiteralPath "$projectRoot\wasm_sim\target\wasm32-unknown-unknown\release\wasm_sim.wasm" `
  -Destination "$projectRoot\wasm_sim.wasm" `
  -Force

Write-Host "Built $projectRoot\wasm_sim.wasm"
