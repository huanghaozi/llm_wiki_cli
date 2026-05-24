# Build llm-wiki-native for the current platform or a cross-compilation target.
#
# Usage:
#   .\scripts\build-native.ps1
#   .\scripts\build-native.ps1 -Target x86_64-pc-windows-msvc

param(
    [string]$Target = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$NativeDir = Join-Path $Root "native"

Push-Location $NativeDir
try {
    if ($Target) {
        Write-Host "Building llm-wiki-native for target: $Target"
        rustup target add $Target 2>$null
        cargo build --release --target $Target
        $Out = Join-Path $NativeDir "target\$Target\release\llm-wiki-native.exe"
        if (-not (Test-Path $Out)) {
            $Out = Join-Path $NativeDir "target\$Target\release\llm-wiki-native"
        }
    }
    else {
        Write-Host "Building llm-wiki-native for host platform"
        cargo build --release
        $Out = Join-Path $NativeDir "target\release\llm-wiki-native.exe"
        if (-not (Test-Path $Out)) {
            $Out = Join-Path $NativeDir "target\release\llm-wiki-native"
        }
    }
    Write-Host "Built: $Out"
}
finally {
    Pop-Location
}
