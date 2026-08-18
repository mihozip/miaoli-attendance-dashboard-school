#requires -Version 5.1
$ErrorActionPreference = 'Stop'

$Repo = 'mihozip/miaoli-attendance-dashboard-school'
$Branch = 'main'
$InstallDir = Join-Path $env:LOCALAPPDATA 'MiaoliAttendanceDashboardSchool'
$TempRoot = Join-Path $env:TEMP ('miaoli-attendance-dashboard-' + [Guid]::NewGuid().ToString('N'))
$ZipPath = Join-Path $TempRoot 'source.zip'
$ExtractDir = Join-Path $TempRoot 'source'
$ArchiveUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"

Write-Host ''
Write-Host 'Miaoli Attendance Dashboard - School Edition' -ForegroundColor Cyan
Write-Host 'PowerShell installer / updater' -ForegroundColor Cyan
Write-Host ''

function Get-ChromePath {
    $cmd = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) {
        return $cmd.Source
    }

    $candidates = @()

    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')
    }

    $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($programFilesX86) {
        $candidates += (Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe')
    }

    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return $candidate
        }
    }

    return $null
}

try {
    New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null

    Write-Host '[1/4] Downloading the latest source from GitHub...'
    Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ZipPath -UseBasicParsing

    Write-Host '[2/4] Extracting files...'
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

    $SourceDir = Get-ChildItem -Path $ExtractDir -Directory | Select-Object -First 1
    if (-not $SourceDir) {
        throw 'The extracted source directory was not found.'
    }

    $Manifest = Join-Path $SourceDir.FullName 'manifest.json'
    if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
        throw 'manifest.json was not found in the downloaded source.'
    }

    Write-Host '[3/4] Installing to the local application data folder...'
    if (Test-Path -LiteralPath $InstallDir) {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $SourceDir.FullName '*') -Destination $InstallDir -Recurse -Force

    Write-Host '[4/4] Opening the extension folder and Chrome extensions page...'
    Start-Process -FilePath explorer.exe -ArgumentList ('"' + $InstallDir + '"')
    try { Set-Clipboard -Value $InstallDir } catch { }

    $ChromePath = Get-ChromePath
    if ($ChromePath) {
        try {
            Start-Process -FilePath $ChromePath -ArgumentList 'chrome://extensions/'
        }
        catch {
            Write-Host ('Chrome could not be opened automatically: ' + $_.Exception.Message) -ForegroundColor Yellow
        }
    }
    else {
        Write-Host 'Google Chrome was not found automatically.' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host 'Installation files are ready.' -ForegroundColor Green
    Write-Host ('Extension folder: ' + $InstallDir)
    Write-Host ''
    Write-Host 'First-time setup in Chrome:' -ForegroundColor Yellow
    Write-Host '  1. Open chrome://extensions/'
    Write-Host '  2. Turn on Developer mode.'
    Write-Host '  3. Click Load unpacked.'
    Write-Host ('  4. Select: ' + $InstallDir)
    Write-Host ''
    Write-Host 'The extension folder path was also copied to the clipboard when possible.'
    Write-Host 'For future updates, run this installer again and click Reload on the extension card.'
}
catch {
    Write-Host ''
    Write-Host ('Installation failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
finally {
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
