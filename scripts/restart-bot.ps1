#!/usr/bin/env pwsh
# Discord LLM Bot - Restart Script
# This script stops the running bot and starts it again

$ErrorActionPreference = "Continue"

Write-Host "Restarting Discord LLM Bot..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray

# First, kill any existing bot processes
Write-Host "Stopping existing bot processes..." -ForegroundColor Yellow

# Kill Node.js processes running the bot
$killed = $false
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*discord-llm-bot*" -or
    $_.CommandLine -like "*ts-node*" -or
    $_.CommandLine -like "*src/index.ts*"
} | ForEach-Object {
    Stop-Process -Id $_.Id -Force
    $killed = $true
}

# Kill npm processes
Get-Process -Name "npm" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*discord-llm-bot*"
} | ForEach-Object {
    Stop-Process -Id $_.Id -Force
    $killed = $true
}

if ($killed) {
    Write-Host "Bot processes stopped." -ForegroundColor Green
    # Wait a moment for processes to fully terminate
    Start-Sleep -Seconds 2
} else {
    Write-Host "No running bot processes found." -ForegroundColor Gray
}

Write-Host "----------------------------------------" -ForegroundColor Gray

# Start the bot again
& "$PSScriptRoot\start-bot.ps1"