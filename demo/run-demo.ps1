# Demo 运行脚本 (PowerShell)

$Root = Split-Path -Parent $PSScriptRoot
$Demo = Join-Path $Root "demo\project"
$Cli = @("bun", "run", (Join-Path $Root "cli\index.ts"))

Write-Host "==> Initializing demo project at $Demo"
if (Test-Path $Demo) { Remove-Item -Recurse -Force $Demo }

# Non-interactive init: pipe project name
"Demo Wiki`n" | & bun run "$Root\cli\index.ts" init $Demo --template general

Write-Host "==> Listing pages"
& bun run "$Root\cli\index.ts" pages -p $Demo

Write-Host "==> Lint check"
& bun run "$Root\cli\index.ts" lint -p $Demo

Write-Host "==> Search"
& bun run "$Root\cli\index.ts" search "Welcome" -p $Demo

Write-Host "==> Graph"
& bun run "$Root\cli\index.ts" graph -p $Demo

Write-Host "==> Demo complete. Project at: $Demo"
