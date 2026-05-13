param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $root ("outputs/deploy/medisa-deploy-{0}.zip" -f $timestamp)
}

$outputDir = Split-Path -Parent $OutputPath
$stagingDir = Join-Path $env:TEMP ("medisa-deploy-stage-{0}" -f ([guid]::NewGuid().ToString("N")))

$excludePatterns = @(
    "node_modules/",
    "outputs/",
    "tmp/",
    ".git",
    ".github/",
    ".cursor/",
    ".agents/",
    ".vscode/",
    "data/",
    "*.zip"
)

function Test-ExcludedPath([string]$Path) {
    $normalized = $Path.Replace("\", "/")
    foreach ($pattern in $excludePatterns) {
        if ($pattern.EndsWith("/")) {
            if ($normalized.StartsWith($pattern)) {
                return $true
            }
        } elseif ($pattern.StartsWith("*.")) {
            if ($normalized.EndsWith($pattern.Substring(1))) {
                return $true
            }
        } elseif ($normalized -eq $pattern) {
            return $true
        }
    }
    return $false
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

try {
    $trackedFiles = git ls-files
    foreach ($relativePath in $trackedFiles) {
        if (Test-ExcludedPath $relativePath) {
            continue
        }

        $sourcePath = Join-Path $root $relativePath
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            continue
        }

        $destinationPath = Join-Path $stagingDir $relativePath
        $destinationDir = Split-Path -Parent $destinationPath
        if (-not (Test-Path -LiteralPath $destinationDir)) {
            New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
        }
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }

    $dataDirs = @(
        "data",
        "data/ruhsat",
        "data/kasko_police",
        "data/sigorta_police"
    )
    foreach ($relativeDir in $dataDirs) {
        $targetDir = Join-Path $stagingDir $relativeDir
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    }

    if (Test-Path -LiteralPath $OutputPath) {
        Remove-Item -LiteralPath $OutputPath -Force
    }

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $OutputPath -CompressionLevel Optimal
    Get-Item -LiteralPath $OutputPath | Select-Object FullName, Length, LastWriteTime
}
finally {
    if (Test-Path -LiteralPath $stagingDir) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
}
