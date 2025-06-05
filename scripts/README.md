# Bot Management Scripts

## 🚀 Starting the Bot

### **Manual Start (Interactive)**
```cmd
scripts\start-bot.bat          # Batch file - double-click or run from CMD
scripts\start-bot.ps1          # PowerShell - more features
```

### **Background Start (Silent)**
```vbs
scripts\start-bot-background.vbs    # Starts bot hidden in background
```

### **Auto-Start on Windows Boot**
1. **Run as Administrator:**
   ```powershell
   .\scripts\create-startup-task.ps1
   ```
2. This creates a Windows Task Scheduler task that starts the bot automatically when Windows boots

## 🛑 Stopping the Bot

### **Manual Stop Scripts**
```cmd
scripts\kill-bot.bat          # Batch file - simple
scripts\kill-bot.ps1          # PowerShell - more reliable
```

### **Quick Stop**
- Press **Ctrl+C** in the terminal where bot is running (graceful)

## 📋 What Each Script Does

### Start Scripts
- **start-bot.bat/ps1**: Opens visible window, shows bot logs
- **start-bot-background.vbs**: Runs bot completely hidden
- **create-startup-task.ps1**: Sets up automatic startup with Windows

### Stop Scripts  
- Forcefully terminate all bot-related processes
- Kills Node.js, ts-node, and npm processes
- Finds processes by command line patterns

## ⚙️ Startup Task Management

After creating the startup task:
1. Open **Task Scheduler** (`Win+R` → `taskschd.msc`)
2. Find "Discord LLM Bot Startup" in Task Scheduler Library
3. Right-click to **Enable/Disable/Delete**

## 🔧 Execution Policy (PowerShell)
If you get execution policy errors:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## 🎯 Recommended Usage
- **Development**: Use `start-bot.ps1` (see logs)
- **Production**: Use `start-bot-background.vbs` (hidden)
- **Auto-startup**: Run `create-startup-task.ps1` once as Admin