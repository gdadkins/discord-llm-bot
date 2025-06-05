# This script creates a Windows Task Scheduler task to auto-start the bot
# Run this as Administrator

param(
    [string]$TaskName = "Discord LLM Bot Startup"
)

Write-Host "Creating Windows startup task for Discord LLM Bot..." -ForegroundColor Green

# Get the current script directory and bot path
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$botPath = Split-Path -Parent $scriptPath
$vbsScript = Join-Path $scriptPath "start-bot-background.vbs"

# Check if VBS script exists
if (-not (Test-Path $vbsScript)) {
    Write-Host "Error: start-bot-background.vbs not found!" -ForegroundColor Red
    exit 1
}

try {
    # Create the scheduled task
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsScript`""
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    # Register the task
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
    
    Write-Host "✅ Startup task '$TaskName' created successfully!" -ForegroundColor Green
    Write-Host "The bot will now start automatically when Windows boots." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To manage this task:" -ForegroundColor Yellow
    Write-Host "1. Open Task Scheduler (taskschd.msc)" -ForegroundColor Gray
    Write-Host "2. Look for '$TaskName' in the Task Scheduler Library" -ForegroundColor Gray
    Write-Host "3. Right-click to Enable/Disable/Delete" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Error creating startup task: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure you're running PowerShell as Administrator!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")