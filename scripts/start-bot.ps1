param(
    [switch]$Silent,
    [switch]$NoWait
)

# Set window title
$Host.UI.RawUI.WindowTitle = "Discord LLM Bot"

if (-not $Silent) {
    Write-Host "Starting Discord LLM Bot..." -ForegroundColor Green
}

# Get the script directory and navigate to bot root
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$botPath = Split-Path -Parent $scriptPath
Set-Location $botPath

if (-not $Silent) {
    Write-Host "Bot directory: $botPath" -ForegroundColor Cyan
}

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    if (-not $Silent) {
        Write-Host "Installing dependencies..." -ForegroundColor Yellow
    }
    npm install
}

# Check for required environment variables
if (-not $env:DISCORD_TOKEN -or $env:DISCORD_TOKEN -eq "your_discord_bot_token_here") {
    $envFile = Join-Path $botPath ".env"
    if (Test-Path $envFile) {
        if (-not $Silent) {
            Write-Host "Loading environment variables from .env file..." -ForegroundColor Cyan
        }
        Get-Content $envFile | ForEach-Object {
            if ($_ -match "^([^#].+?)=(.+)$") {
                [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
    }
}

if (-not $Silent) {
    Write-Host "Starting bot..." -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the bot" -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Gray
}

try {
    # Start the bot
    if ($NoWait) {
        Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WindowStyle Hidden
        if (-not $Silent) {
            Write-Host "Bot started in background!" -ForegroundColor Green
        }
    } else {
        npm run dev
    }
} catch {
    Write-Host "Error starting bot: $($_.Exception.Message)" -ForegroundColor Red
    if (-not $NoWait) {
        Read-Host "Press Enter to continue"
    }
}