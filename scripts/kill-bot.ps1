Write-Host "Shutting down all Discord bot instances..." -ForegroundColor Yellow

# Kill all Node.js processes that might be running the bot
Write-Host "Stopping Node.js processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -eq "node" -and ($_.CommandLine -like "*discord-llm-bot*" -or $_.CommandLine -like "*ts-node*")
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill any ts-node processes
Get-Process -Name "ts-node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill any npm processes related to the bot
Write-Host "Stopping npm processes..." -ForegroundColor Cyan
Get-Process -Name "npm" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*discord-llm-bot*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Alternative approach: Kill by window title or working directory
Write-Host "Checking for bot processes by path..." -ForegroundColor Cyan
Get-WmiObject Win32_Process | Where-Object {
    $_.CommandLine -like "*discord-llm-bot*" -or 
    $_.CommandLine -like "*src/index.ts*" -or
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*ts-node*")
} | ForEach-Object {
    Write-Host "Killing process: $($_.Name) (PID: $($_.ProcessId))" -ForegroundColor Red
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Bot shutdown complete!" -ForegroundColor Green
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")