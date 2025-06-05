Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
botDir = fso.GetParentFolderName(scriptDir)

' Change to the bot directory and run the PowerShell script silently
WshShell.CurrentDirectory = botDir
WshShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptDir & "\start-bot.ps1"" -Silent -NoWait", 0, False