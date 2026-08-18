#requires -Version 5.1
$ErrorActionPreference = 'Stop'

$InstallDir = Join-Path $env:LOCALAPPDATA 'MiaoliAttendanceDashboardSchool'

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

if (Test-Path -LiteralPath $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Write-Host ('Removed local extension files: ' + $InstallDir) -ForegroundColor Green
}
else {
    Write-Host 'The managed local extension folder does not exist. No files were removed.'
}

$ChromePath = Get-ChromePath
if ($ChromePath) {
    try {
        Start-Process -FilePath $ChromePath -ArgumentList 'chrome://extensions/'
        Write-Host 'Chrome was opened. Remove the extension from the extensions page if it is still listed.' -ForegroundColor Yellow
    }
    catch {
        Write-Host ('Chrome could not be opened automatically: ' + $_.Exception.Message) -ForegroundColor Yellow
        Write-Host 'Open Chrome manually and go to chrome://extensions/.' -ForegroundColor Yellow
    }
}
else {
    Write-Host 'Google Chrome was not found automatically. Open Chrome manually and go to chrome://extensions/.' -ForegroundColor Yellow
}
