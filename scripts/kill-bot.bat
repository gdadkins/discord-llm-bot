@echo off
echo Shutting down all Discord bot instances...

REM Kill all node processes running the bot
taskkill /f /im node.exe 2>nul
taskkill /f /im ts-node.exe 2>nul

REM Kill any processes with "discord-llm-bot" in the command line
for /f "tokens=2" %%i in ('tasklist /v /fi "WINDOWTITLE eq *discord-llm-bot*" /fo csv ^| findstr /v "INFO:"') do (
    if not "%%i"=="PID" (
        taskkill /f /pid %%i 2>nul
    )
)

REM Kill any npm processes that might be running the dev script
for /f "tokens=2" %%i in ('wmic process where "name='node.exe' and commandline like '%%discord-llm-bot%%'" get processid /format:csv 2^>nul ^| findstr /r "[0-9]"') do (
    taskkill /f /pid %%i 2>nul
)

echo Bot shutdown complete!
pause