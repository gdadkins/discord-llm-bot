@echo off
title Discord LLM Bot
echo Starting Discord LLM Bot...

REM Change to the bot directory
cd /d "%~dp0\.."

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies...
    npm install
)

REM Start the bot
echo Bot starting up...
npm run dev

REM If we get here, the bot has stopped
echo Bot has stopped. Press any key to close...
pause